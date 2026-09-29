/*
 * useSpeedTimer: a speedcubing timer, like on csTimer or a stackmat.
 *
 *   idle ──hold space / touch──> holding (red) ──300 ms──> ready (green)
 *     ^                            │ let go too early           │ let go
 *     └────────────────────────────┘                            v
 *   stopped <──────────── any key / touch ─────────────────── running
 *
 * The time is measured with performance.now() timestamps:
 *   final time = stop timestamp - start timestamp
 * (never by adding up frame times, which drift). The screen is only
 * refreshed with requestAnimationFrame (see TimerDisplay).
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type TimerPhase = "idle" | "holding" | "ready" | "running" | "stopped";

/** How long space / touch must be held before the timer turns green. */
export const HOLD_MS = 300;

interface Options {
  /** Can a solve start right now? (solving phase, in the set, no time yet for this solve) */
  canStart: boolean;
  onStart: () => void;
  onStop: (elapsedMs: number) => void;
  /** The big area that works like the space bar on phones. */
  touchArea: HTMLElement | null;
}

export interface SpeedTimer {
  phase: TimerPhase;
  /** performance.now() when the timer started. */
  startedAt: number;
  /** Back to idle (e.g. when a new scramble arrives). */
  reset: () => void;
}

export function useSpeedTimer({ canStart, onStart, onStop, touchArea }: Options): SpeedTimer {
  const [phase, setPhaseState] = useState<TimerPhase>("idle");
  const phaseRef = useRef<TimerPhase>("idle");
  const startedAt = useRef(0);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The event listeners below are set up once, so they read the latest values from refs.
  const latest = useRef({ canStart, onStart, onStop });
  latest.current = { canStart, onStart, onStop };

  const setPhase = useCallback((next: TimerPhase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  const clearHold = useCallback(() => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  }, []);

  const reset = useCallback(() => {
    clearHold();
    setPhase("idle");
  }, [clearHold, setPhase]);

  const stop = useCallback(() => {
    const elapsed = Math.floor(performance.now() - startedAt.current);
    setPhase("stopped");
    latest.current.onStop(elapsed);
  }, [setPhase]);

  /** Space pressed / finger down. Returns true if it did something. */
  const press = useCallback((): boolean => {
    if (phaseRef.current === "running") {
      stop();
      return true;
    }
    if (phaseRef.current !== "idle" || !latest.current.canStart) return false;
    setPhase("holding");
    holdTimer.current = setTimeout(() => {
      if (phaseRef.current === "holding") setPhase("ready");
    }, HOLD_MS);
    return true;
  }, [setPhase, stop]);

  /** Space released / finger up. */
  const release = useCallback(() => {
    if (phaseRef.current === "holding") {
      reset(); // let go too early: not ready yet
    } else if (phaseRef.current === "ready") {
      startedAt.current = performance.now();
      setPhase("running");
      latest.current.onStart();
    }
  }, [reset, setPhase]);

  // ---- Keyboard ----
  useEffect(() => {
    function isTyping(target: EventTarget | null): boolean {
      return target instanceof HTMLElement && target.matches("input, textarea, select, [contenteditable]");
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (phaseRef.current === "running") {
        // ANY key stops the timer.
        event.preventDefault();
        if (!event.repeat) stop();
        return;
      }
      if (isTyping(event.target)) return;

      if (event.code === "Space") {
        // Never let space scroll the page or press a focused button.
        event.preventDefault();
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        if (!event.repeat) press();
      } else if (event.key === "Escape" && (phaseRef.current === "holding" || phaseRef.current === "ready")) {
        reset();
      }
    }

    function onKeyUp(event: KeyboardEvent): void {
      if (event.code !== "Space" || isTyping(event.target)) return;
      event.preventDefault();
      release();
    }

    // "capture: true" = we see the key before any button does.
    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("keyup", onKeyUp, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("keyup", onKeyUp, { capture: true });
    };
  }, [press, release, reset, stop]);

  // ---- Touch (and mouse) on the big timer area ----
  useEffect(() => {
    if (!touchArea) return;

    function onPointerDown(event: PointerEvent): void {
      if (!event.isPrimary || event.button > 0) return;
      if (press()) event.preventDefault();
    }
    function onPointerUp(event: PointerEvent): void {
      if (!event.isPrimary) return;
      release();
    }
    function onPointerCancel(): void {
      if (phaseRef.current === "holding" || phaseRef.current === "ready") reset();
    }
    // No long-press menu or text selection while holding a finger on the timer.
    function block(event: Event): void {
      event.preventDefault();
    }

    touchArea.addEventListener("pointerdown", onPointerDown);
    touchArea.addEventListener("pointerup", onPointerUp);
    touchArea.addEventListener("pointercancel", onPointerCancel);
    touchArea.addEventListener("contextmenu", block);
    touchArea.addEventListener("selectstart", block);
    return () => {
      touchArea.removeEventListener("pointerdown", onPointerDown);
      touchArea.removeEventListener("pointerup", onPointerUp);
      touchArea.removeEventListener("pointercancel", onPointerCancel);
      touchArea.removeEventListener("contextmenu", block);
      touchArea.removeEventListener("selectstart", block);
    };
  }, [touchArea, press, release, reset]);

  // If starting stops being allowed (a new phase, the host skipped us...) while
  // getting ready or running, drop it. A stopped time is kept (it's in the outbox).
  useEffect(() => {
    if (!canStart && phaseRef.current !== "stopped" && phaseRef.current !== "idle") reset();
  }, [canStart, reset]);

  useEffect(() => clearHold, [clearHold]);

  return { phase, startedAt: startedAt.current, reset };
}
