/*
 * useSmartSolve: a solve timed by a smart cube instead of the spacebar.
 * Turn the cube until it matches the scramble, then the first turn starts the
 * timer and solving the cube stops it. While it runs, the moves are sent to
 * the room in small batches, so others can watch the cube live.
 */

import { useEffect, useRef, useState } from "react";
import { ClientEvents } from "@cube-racing/shared";
import { currentSmartPattern, onSmartMove, scrambledPattern, SmartSolveTracker, type SmartState } from "../smartCube";
import { request } from "../socket";

/** Moves are sent at most this often while solving. */
const SEND_EVERY_MS = 150;

interface Options {
  /** False = no smart cube for this solve (the spacebar timer is used). */
  active: boolean;
  /** The scramble to match (a new one starts a new solve). */
  scramble: string;
  onStart: () => void;
  onStop: (elapsedMs: number) => void;
}

export function useSmartSolve({ active, scramble, onStart, onStop }: Options): { state: SmartState; startedAt: number } | null {
  const [state, setState] = useState<SmartState>("scrambling");
  const [startedAt, setStartedAt] = useState(0);
  const latest = useRef({ onStart, onStop });
  latest.current = { onStart, onStop };

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let tracker: SmartSolveTracker | null = null;
    let outgoing: string[] = [];
    const flush = setInterval(() => {
      if (outgoing.length === 0) return;
      void request(ClientEvents.CUBE_MOVES, { moves: outgoing.splice(0, 30) });
    }, SEND_EVERY_MS);

    setState("scrambling");
    void scrambledPattern(scramble).then((target) => {
      if (stopped) return;
      tracker = new SmartSolveTracker(target);
      // The cube may already match the scramble.
      const now = currentSmartPattern();
      if (now) setState(tracker.onMove(now, performance.now()));
    });

    const unsubscribe = onSmartMove((move, pattern, at) => {
      if (!tracker) return;
      const before = tracker.state;
      const next = tracker.onMove(pattern, at);
      if (next === "running" || (next === "solved" && before === "running")) outgoing.push(move);
      if (next === before) return;
      setState(next);
      if (next === "running") {
        setStartedAt(tracker.startedAt);
        latest.current.onStart();
      }
      if (next === "solved") latest.current.onStop(tracker.elapsedMs);
    });

    return () => {
      stopped = true;
      unsubscribe();
      clearInterval(flush);
      outgoing = [];
    };
  }, [active, scramble]);

  return active ? { state, startedAt } : null;
}
