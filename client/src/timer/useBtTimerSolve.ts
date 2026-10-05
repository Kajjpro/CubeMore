/*
 * useBtTimerSolve: a solve timed by a Bluetooth timer (see btTimer.ts).
 * The web timer shows what the real timer does; the time that counts is the
 * timer's own, sent when it stops.
 */

import { useEffect, useRef, useState } from "react";
import { onBtTimer } from "../btTimer";
import type { TimerPhase } from "./useSpeedTimer";

interface Options {
  /** False = the timer isn't used for this solve. */
  active: boolean;
  onStart: () => void;
  onStop: (timeMs: number) => void;
}

export function useBtTimerSolve({ active, onStart, onStop }: Options): { phase: TimerPhase; startedAt: number } | null {
  const [state, setState] = useState<{ phase: TimerPhase; startedAt: number }>({ phase: "idle", startedAt: 0 });
  const phase = useRef<TimerPhase>("idle");
  const latest = useRef({ onStart, onStop });
  latest.current = { onStart, onStop };

  useEffect(() => {
    if (!active) return;
    const set = (next: TimerPhase, startedAt = 0) => {
      phase.current = next;
      setState({ phase: next, startedAt });
    };
    set("idle");
    return onBtTimer((event) => {
      const now = phase.current;
      switch (event.kind) {
        case "hands-on":
          if (now === "idle") set("holding");
          return;
        case "ready":
          if (now === "holding" || now === "idle") set("ready");
          return;
        case "hands-off":
        case "idle":
          if (now === "holding" || now === "ready") set("idle");
          return;
        case "running":
          if (now === "running" || now === "stopped") return;
          set("running", performance.now());
          latest.current.onStart();
          return;
        case "stopped":
          // Only a solve that started here counts (not a stop left over from before).
          if (now !== "running") return;
          set("stopped");
          latest.current.onStop(event.timeMs);
          return;
      }
    });
  }, [active]);

  return active ? state : null;
}
