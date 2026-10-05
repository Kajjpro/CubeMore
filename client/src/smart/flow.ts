/*
 * ONE SMART CUBE SOLVE, from scramble to finish (pure: no Bluetooth, no React).
 *
 *   scrambling  the guide follows you while you scramble (see guide.ts)
 *   inspecting  the cube matches the scramble: 15 s of inspection start right away.
 *               Your first turn starts the solve; if the 15 s run out, it starts then.
 *   running     every move is recorded with its time
 *   solved      the cube is solved: the time and every move, ready to send
 */

import { isSolved, type Facelets } from "@cube-racing/shared/cube3";
import type { SmartSolveData } from "@cube-racing/shared/smartSolve";
import { ScrambleGuide, type GuideStatus } from "./guide";
import { solveTimes, type SolveStart, type TimedMove } from "./timing";

export const INSPECTION_MS = 15_000;

export type FlowPhase = "scrambling" | "inspecting" | "running" | "solved";

export interface FlowView {
  phase: FlowPhase;
  guide: GuideStatus;
  /** performance.now() when the inspection ends (while inspecting). */
  inspectionEndsAt: number | null;
  /** performance.now() when the solve started (running, solved). */
  startedAt: number | null;
  moveCount: number;
  /** When solved: the time, and every move with its time. */
  result: { timeMs: number; smart: SmartSolveData } | null;
}

export class SmartSolveFlow {
  private readonly guide: ScrambleGuide;
  private phase: FlowPhase = "scrambling";
  private inspectionEndsAt: number | null = null;
  private start: SolveStart | null = null;
  private startedAt: number | null = null;
  private moves: TimedMove[] = [];
  private result: FlowView["result"] = null;

  constructor(
    scramble: string,
    state: Facelets,
    /** Host ms per cube ms (see ClockFit), read when the solve ends. */
    private readonly clockRatio: () => number,
    private readonly inspectionMs = INSPECTION_MS,
  ) {
    this.guide = new ScrambleGuide(scramble, state);
    if (this.guide.current.kind === "scrambled") this.phase = "inspecting";
  }

  /** The cube is already scrambled when the flow starts: inspection starts now. */
  begin(now: number): void {
    if (this.phase === "inspecting" && this.inspectionEndsAt === null) this.inspectionEndsAt = now + this.inspectionMs;
  }

  view(): FlowView {
    return {
      phase: this.phase,
      guide: this.guide.current,
      inspectionEndsAt: this.inspectionEndsAt,
      startedAt: this.startedAt,
      moveCount: this.moves.length,
      result: this.result,
    };
  }

  /** A move, with the cube's state after it. `now` = performance.now(). */
  onMove(move: TimedMove, state: Facelets, now: number): void {
    switch (this.phase) {
      case "scrambling":
        if (this.guide.update(state, move.move).kind === "scrambled") {
          this.phase = "inspecting";
          this.inspectionEndsAt = now + this.inspectionMs;
        }
        return;
      case "inspecting":
        // The first turn starts the solve.
        this.phase = "running";
        this.start = { kind: "first-move" };
        this.startedAt = move.hostAt ?? now;
        this.record(move, state);
        return;
      case "running":
        this.record(move, state);
        return;
      case "solved":
        return;
    }
  }

  /**
   * A fresh full state from the cube (no move). While solving, it can show the
   * cube is solved even if a move got lost on the way: the solve ends then.
   */
  onState(state: Facelets, now: number): void {
    if (this.phase === "scrambling") {
      if (this.guide.update(state, null).kind === "scrambled") {
        this.phase = "inspecting";
        this.inspectionEndsAt = now + this.inspectionMs;
      }
    } else if (this.phase === "running" && this.moves.length > 0 && isSolved(state)) {
      this.finish();
    }
  }

  /** Time passes: the inspection may run out, and then the solve starts by itself. */
  tick(now: number): void {
    if (this.phase === "inspecting" && this.inspectionEndsAt !== null && now >= this.inspectionEndsAt) {
      this.phase = "running";
      this.start = { kind: "at", hostAt: this.inspectionEndsAt };
      this.startedAt = this.inspectionEndsAt;
    }
  }

  private record(move: TimedMove, state: Facelets): void {
    this.moves.push(move);
    if (isSolved(state)) this.finish();
  }

  private finish(): void {
    const times = solveTimes(this.moves, this.start ?? { kind: "first-move" }, this.clockRatio());
    this.phase = "solved";
    this.result = {
      timeMs: times[times.length - 1] ?? 0,
      smart: { moves: this.moves.map((m) => m.move), times },
    };
  }
}
