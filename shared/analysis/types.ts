/*
 * What the analyzer says about a solve. Plain JSON: it's saved with the solve
 * and sent to the browser. ANALYSIS_VERSION changes when the analysis changes,
 * so old saved analyses can be redone.
 */

import type { Face } from "../cube3";
import type { LevelId } from "./benchmarks";

export const ANALYSIS_VERSION = 1;

export type StageId = "cross" | "pair1" | "pair2" | "pair3" | "pair4" | "oll" | "pll";

export interface StageSplit {
  stage: StageId;
  /** The last move of the stage before (-1: the start of the solve). */
  fromMove: number;
  /** The move that finished this stage (-1: it was done before the first move). */
  toMove: number;
  startMs: number;
  endMs: number;
  /** The pause before the stage's first move (0 for the cross: inspection doesn't count). */
  recognitionMs: number;
  executionMs: number;
  /** Moves, counting R2 as one and R R as one (STM). */
  moves: number;
  /** Moves per second while turning (recognition left out). */
  tps: number;
  /** The longest pause between two moves inside the stage. */
  longestPauseMs: number;
}

/** Moves to show on the 3D cube, from the state after move `afterMove`. Full notation, starting with the rotation to the held view. */
export interface ShowMoves {
  afterMove: number;
  alg: string;
}

export interface CrossInfo {
  face: Face;
  /** The shortest cross for this color, as held: cross on the bottom, `front` in front. */
  optimal: string;
  optimalMoves: number;
  front: Face;
  /** Shortest cross on each color (moves). */
  byColor: Record<Face, number>;
  /** A pair was solved together with the cross. */
  xcross: boolean;
}

export interface PairInfo {
  stage: StageId;
  /** The slot's two side colors (center letters), e.g. "FR". Several when solved together. */
  slots: string[];
  /** The shortest way for this pair (no D turns), held with the slot at front right. Null when not computed. */
  optimal: string | null;
  optimalMoves: number | null;
}

export interface LastLayerInfo {
  /** "OLL 27" / "PLL T", or null for a skip. */
  caseId: string | null;
  name: string | null;
  alg: string | null;
  /** U turns to do before the algorithm, as held ("", "U", "U2", "U'"). */
  preAuf: string;
  skip: boolean;
  /** 2 when it was done in two algorithms with a pause between (2-look). */
  looks: number;
}

export type AdviceKind =
  | "cross-moves"
  | "cross-time"
  | "pair-moves"
  | "lookahead"
  | "oll-two-look"
  | "pll-two-look"
  | "oll-recognition"
  | "pll-recognition"
  | "turning";

export interface Advice {
  kind: AdviceKind;
  stage: StageId | "f2l" | "all";
  /** Roughly how much time this would save (ms). */
  savedMs: number;
  title: string;
  detail: string;
  show: ShowMoves | null;
}

export interface SolveAnalysis {
  version: number;
  timeMs: number;
  moves: number;
  tps: number;
  /** The level of this time, and the next one up (what the comparison uses). */
  level: LevelId;
  target: LevelId;
  stages: StageSplit[];
  cross: CrossInfo;
  pairs: PairInfo[];
  oll: LastLayerInfo;
  pll: LastLayerInfo;
  advice: Advice[];
}

export interface StageAverage {
  stage: StageId;
  ms: number;
  recognitionMs: number;
  moves: number;
}

export interface SessionSummary {
  version: number;
  count: number;
  /** ao5 (best and worst dropped) or the mean when fewer solves. */
  averageMs: number;
  bestMs: number;
  worstMs: number;
  /** Standard deviation of the times. */
  spreadMs: number;
  level: LevelId;
  target: LevelId;
  stages: StageAverage[];
  /** The three things that would save the most time across the solves. */
  focus: { kind: AdviceKind; title: string; savedMs: number; solves: number }[];
}
