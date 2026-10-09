/*
 * PRACTICE WITH THE ANALYZER (/analyze): smart cube solves on your own, each
 * one split into CFOP stages with suggestions (see analysis/). Signed-in
 * players' solves are kept, grouped in sessions (a single, or an ao5).
 */

import type { SessionSummary, SolveAnalysis } from "./analysis/types";

export const PRACTICE_KINDS = ["single", "ao5"] as const;
export type PracticeKind = (typeof PRACTICE_KINDS)[number];

/** Solves in a session of each kind. */
export const PRACTICE_SIZE: Record<PracticeKind, number> = { single: 1, ao5: 5 };

export interface PracticeSolve {
  id: string;
  sessionId: string;
  /** 0-4 in an ao5. */
  index: number;
  createdAt: number;
  scramble: string;
  timeMs: number;
  moves: string[];
  /** When each move happened, ms from the start. */
  times: number[];
  analysis: SolveAnalysis;
}

/** One line of the history. */
export interface PracticeSessionInfo {
  id: string;
  kind: PracticeKind;
  createdAt: number;
  times: number[];
  /** The single's time, or the ao5 once it has 5 solves. */
  resultMs: number | null;
}

export interface PracticeSession {
  id: string;
  kind: PracticeKind;
  createdAt: number;
  solves: PracticeSolve[];
  summary: SessionSummary | null;
  /** The written coach summary, once asked for. */
  coach: string | null;
}

/** One of the fastest verified smart cube solves on CubeMore, analyzed. */
export interface TopSolve {
  name: string;
  timeMs: number;
  scramble: string;
  moves: string[];
  times: number[];
  analysis: SolveAnalysis;
}
