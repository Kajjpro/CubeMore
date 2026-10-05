/*
 * useSmartSolve: a solve with a smart cube instead of the spacebar (see smart/flow.ts).
 *
 * Scramble with the guide, 15 s of inspection start the moment the cube matches,
 * your first turn (or the end of the inspection) starts the timer, and solving
 * the cube stops it. While solving, the moves go to the room in small batches
 * so others can watch, and whenever the cube stops for a moment without being
 * solved, we ask it for its full state: if a move got lost on the way and the
 * cube is really solved, the solve ends right there (no extra U U' needed).
 *
 * The scramble card shows the guide too: it reads it with useSmartGuide().
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ClientEvents } from "@cube-racing/shared";
import { SOLVED_FACELETS } from "@cube-racing/shared/cube3";
import type { SmartSolveData } from "@cube-racing/shared/smartSolve";
import { cubeClockRatio, cubeState, onCubeMove, onCubeState, requestCubeState } from "../smartCube";
import { SmartSolveFlow, type FlowView } from "../smart/flow";
import { request } from "../socket";

/** Moves are sent to the room at most this often while solving. */
const SEND_EVERY_MS = 150;
/** The cube stopped this long without being solved: ask for its full state. */
const CHECK_AFTER_STILL_MS = 400;

interface Options {
  /** False = no smart cube for this solve. */
  active: boolean;
  /** The scramble to match (a new one starts a new solve). */
  scramble: string;
  onStart: () => void;
  onStop: (timeMs: number, smart: SmartSolveData) => void;
}

// The latest guide, for the scramble card.
let shared: { scramble: string; view: FlowView } | null = null;
const sharedListeners = new Set<() => void>();
function publish(next: typeof shared): void {
  shared = next;
  sharedListeners.forEach((listener) => listener());
}

/** The smart cube guide for this scramble, or null when no smart solve is going on. */
export function useSmartGuide(scramble: string): FlowView | null {
  const current = useSyncExternalStore(
    (listener) => {
      sharedListeners.add(listener);
      return () => sharedListeners.delete(listener);
    },
    () => shared,
  );
  return current?.scramble === scramble ? current.view : null;
}

export function useSmartSolve({ active, scramble, onStart, onStop }: Options): FlowView | null {
  const [view, setView] = useState<FlowView | null>(null);
  const latest = useRef({ onStart, onStop });
  latest.current = { onStart, onStop };

  useEffect(() => {
    if (!active) return;
    let flow: SmartSolveFlow;
    try {
      flow = new SmartSolveFlow(scramble, cubeState() ?? SOLVED_FACELETS, cubeClockRatio);
    } catch {
      return; // not a face-turn scramble: the smart cube can't follow it
    }
    flow.begin(performance.now());
    let phase = flow.view().phase;
    let outgoing: string[] = [];
    let stillTimer: ReturnType<typeof setTimeout> | null = null;

    const refresh = () => {
      const next = flow.view();
      setView(next);
      publish({ scramble, view: next });
      if (next.phase === phase) return;
      phase = next.phase;
      if (phase === "running") latest.current.onStart();
      if (phase === "solved" && next.result) latest.current.onStop(next.result.timeMs, next.result.smart);
    };
    refresh();

    const offMove = onCubeMove((move, state) => {
      const before = flow.view().phase;
      flow.onMove(move, state, performance.now());
      const after = flow.view().phase;
      if (after === "running" || (after === "solved" && before === "running")) outgoing.push(move.move);
      if (stillTimer) clearTimeout(stillTimer);
      if (after === "running") stillTimer = setTimeout(requestCubeState, CHECK_AFTER_STILL_MS);
      refresh();
    });
    const offState = onCubeState((state) => {
      flow.onState(state, performance.now());
      refresh();
    });
    // The inspection may run out (the solve then starts by itself).
    const tick = setInterval(() => {
      const before = flow.view().phase;
      flow.tick(performance.now());
      if (flow.view().phase !== before) refresh();
    }, 50);
    const flush = setInterval(() => {
      if (outgoing.length === 0) return;
      void request(ClientEvents.CUBE_MOVES, { moves: outgoing.splice(0, 30) });
    }, SEND_EVERY_MS);

    return () => {
      offMove();
      offState();
      clearInterval(tick);
      clearInterval(flush);
      if (stillTimer) clearTimeout(stillTimer);
      outgoing = [];
      setView(null);
      publish(null);
    };
  }, [active, scramble]);

  return active ? view : null;
}
