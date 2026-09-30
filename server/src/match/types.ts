import type {
  MatchPhase,
  RoomSettings,
  Scramble,
  SetStanding,
  SolveResult,
} from "@cube-racing/shared";

/** How long the timed screens last. Normally 3 s / 6 s; tests make them shorter. */
export interface MatchTiming {
  solveReviewMs: number;
  setResultMs: number;
  /** Extra time after a solve time limit to send a time that was stopped in time. */
  submitGraceMs: number;
}

/** A set that has finished, with EVERY solve (the server keeps them all). */
export interface FinishedSet {
  setIndex: number;
  roster: string[];
  results: Record<string, SolveResult[]>;
  standings: Record<string, SetStanding>;
  winnerIds: string[];
  /** Handicap only: each player's pace going into this set. */
  paces: Record<string, number | null> | null;
}

/**
 * The server's full match state. Players are identified by their PUBLIC id,
 * so points survive a player leaving and coming back.
 */
export interface Match {
  matchId: string;
  phase: MatchPhase;
  /** Settings are frozen for the whole match (they can only change in the lobby). */
  settings: RoomSettings;
  timing: MatchTiming;
  setIndex: number;
  solveIndex: number;
  /** Players in the current set. Anyone else is a spectator until the next set. */
  roster: string[];
  /** All scrambles of the current set. Only scrambles[solveIndex] is ever shown. */
  scrambles: Scramble[];
  /** Current set: one slot per solve for each roster player. null = no result yet. */
  results: Record<string, (SolveResult | null)[]>;
  points: Record<string, number>;
  finishedSets: FinishedSet[];
  /** When solve_review / set_result ends (server time). */
  phaseEndsAt: number | null;
  /** When the current solve's time limit runs out (server time), or null. */
  solveDeadline: number | null;
  winnerIds: string[];
}

/** Submitting one solve. (matchId, setIndex, solveIndex) says exactly which solve it is. */
export interface SolveSubmission {
  matchId: string;
  setIndex: number;
  solveIndex: number;
  timeMs: number;
  penalty: SolveResult["penalty"];
}

export interface PenaltyChange {
  matchId: string;
  setIndex: number;
  solveIndex: number;
  penalty: SolveResult["penalty"];
}
