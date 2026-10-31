/*
 * useDrillFlow: one case drilled with the smart cube (see drillFlow.ts).
 * The scramble card shows the guide, like for a normal smart cube solve.
 */

import { useEffect, useRef, useState } from "react";
import { SOLVED_FACELETS, type Face } from "@cube-racing/shared/cube3";
import type { TrainerStep } from "@cube-racing/shared";
import { cubeState, onCubeMove, onCubeState, requestCubeState } from "../smartCube";
import { publish } from "../timer/useSmartSolve";
import { DrillFlow, type DrillView } from "./drillFlow";

/** The cube stopped this long without being done: ask for its full state (a move may be lost). */
const CHECK_AFTER_STILL_MS = 400;

interface Options {
  active: boolean;
  scramble: string;
  step: TrainerStep;
  cross: Face;
  onDone: (result: NonNullable<DrillView["result"]>) => void;
  onLost: () => void;
}

export function useDrillFlow({ active, scramble, step, cross, onDone, onLost }: Options): DrillView | null {
  const [view, setView] = useState<DrillView | null>(null);
  const latest = useRef({ onDone, onLost });
  latest.current = { onDone, onLost };

  useEffect(() => {
    if (!active || !scramble) return;
    const flow = new DrillFlow(scramble, step, cross, cubeState() ?? SOLVED_FACELETS, performance.now());
    let phase = flow.view().phase;
    let stillTimer: ReturnType<typeof setTimeout> | null = null;

    const refresh = () => {
      const next = flow.view();
      setView(next);
      // The scramble card reads the guide like a normal smart solve's.
      publish({
        scramble,
        view: {
          phase: next.phase === "scrambling" ? "scrambling" : "inspecting",
          guide: next.guide,
          inspectionEndsAt: null,
          startedAt: next.shownAt,
          moveCount: next.moveCount,
          result: null,
        },
      });
      if (next.phase === phase) return;
      phase = next.phase;
      if (phase === "done" && next.result) latest.current.onDone(next.result);
      if (phase === "lost") latest.current.onLost();
    };
    refresh();

    const offMove = onCubeMove((move, state) => {
      flow.onMove(move.move, state, performance.now());
      if (stillTimer) clearTimeout(stillTimer);
      if (flow.view().phase === "turning") stillTimer = setTimeout(requestCubeState, CHECK_AFTER_STILL_MS);
      refresh();
    });
    const offState = onCubeState((state) => {
      flow.onState(state, performance.now());
      refresh();
    });
    return () => {
      offMove();
      offState();
      if (stillTimer) clearTimeout(stillTimer);
      setView(null);
      publish(null);
    };
  }, [active, scramble, step, cross]);

  return active ? view : null;
}
