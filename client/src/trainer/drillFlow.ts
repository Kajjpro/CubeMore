/*
 * ONE CASE DRILLED WITH A SMART CUBE (pure: no Bluetooth, no React).
 *
 *   scrambling  the guide follows you while you scramble (smart/guide.ts)
 *   looking     the cube shows the case: recognition time runs
 *   turning     your first turn ends recognition; every move is counted
 *   done        OLL: the last layer is oriented. PLL: the cube is solved.
 *   lost        too many moves without getting there (a miss)
 */

import { simplifyMoves, type Face, type Facelets } from "@cube-racing/shared/cube3";
import type { TrainerStep } from "@cube-racing/shared";
import { drillDone } from "@cube-racing/shared/analysis/trainer";
import { ScrambleGuide, type GuideStatus } from "../smart/guide";

/** More moves than this and the case is lost. */
const MAX_MOVES = 60;

export type DrillPhase = "scrambling" | "looking" | "turning" | "done" | "lost";

export interface DrillView {
  phase: DrillPhase;
  guide: GuideStatus;
  /** performance.now() when the cube showed the case. */
  shownAt: number | null;
  /** performance.now() of the first turn. */
  firstMoveAt: number | null;
  moveCount: number;
  result: { recognitionMs: number; executionMs: number; moves: number } | null;
}

export class DrillFlow {
  private readonly guide: ScrambleGuide;
  private phase: DrillPhase = "scrambling";
  private shownAt: number | null = null;
  private firstMoveAt: number | null = null;
  private moves: string[] = [];
  private result: DrillView["result"] = null;

  constructor(
    scramble: string,
    private readonly step: TrainerStep,
    private readonly crossFace: Face,
    state: Facelets,
    now: number,
  ) {
    this.guide = new ScrambleGuide(scramble, state);
    if (this.guide.current.kind === "scrambled") this.show(now);
  }

  view(): DrillView {
    return {
      phase: this.phase,
      guide: this.guide.current,
      shownAt: this.shownAt,
      firstMoveAt: this.firstMoveAt,
      moveCount: this.moves.length,
      result: this.result,
    };
  }

  private show(now: number): void {
    this.phase = "looking";
    this.shownAt = now;
  }

  /** A move, with the cube's state after it. `now` = performance.now(). */
  onMove(move: string, state: Facelets, now: number): void {
    switch (this.phase) {
      case "scrambling":
        if (this.guide.update(state, move).kind === "scrambled") this.show(now);
        return;
      case "looking":
        this.phase = "turning";
        this.firstMoveAt = now;
        this.moves = [move];
        this.check(state, now);
        return;
      case "turning":
        this.moves.push(move);
        this.check(state, now);
        return;
      default:
        return;
    }
  }

  /** A fresh full state from the cube (a move got lost on the way). */
  onState(state: Facelets, now: number): void {
    if (this.phase === "scrambling") {
      if (this.guide.update(state, null).kind === "scrambled") this.show(now);
    } else if (this.phase === "turning") {
      this.check(state, now);
    }
  }

  private check(state: Facelets, now: number): void {
    if (drillDone(state, this.step, this.crossFace)) {
      this.phase = "done";
      this.result = {
        recognitionMs: Math.round(this.firstMoveAt! - this.shownAt!),
        executionMs: Math.round(now - this.firstMoveAt!),
        // Counted like the analyzer: R R is one move, R R' none.
        moves: simplifyMoves(this.moves).length,
      };
    } else if (this.moves.length > MAX_MOVES) {
      this.phase = "lost";
    }
  }
}
