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

// ---------------------------------------------------------------------------
// The case trainer (/train): OLL and PLL times, from analyzer solves and drills.

export type TrainerStep = "oll" | "pll";

/** One timed go at an OLL or PLL case. */
export interface CaseTime {
  /** "OLL 27", "PLL T". */
  caseId: string;
  at: number;
  /** "solve": seen in an analyzed smart cube solve. "drill": practised on its own in the trainer. */
  source: "solve" | "drill";
  /** The pause before the first move (smart cube only). */
  recognitionMs: number | null;
  /** From the first move to done (smart cube), or the whole time on a timer. */
  executionMs: number;
  /** Moves (smart cube only). */
  moves: number | null;
  /** 2 when it was done in two algorithms (2-look). */
  looks: 1 | 2;
  /** Drill: "I didn't know it", or lost on the way. */
  missed: boolean;
}

/** Times sent to the server in one go (a drill sends as it goes; a guest's times once, on sign-in). */
export const TRAINER_SAVE_MAX = 200;
