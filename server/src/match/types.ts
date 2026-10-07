import type { SmartSolveData } from "@cube-racing/shared/smartSolve";
import type {
  CubeEventId,
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
  /**
   * All scrambles of the current set, per event being raced (one event unless
   * the room is mixed). Only scrambles[event][solveIndex] is ever shown.
   */
  scrambles: SetScrambles;
  /**
   * The event of everyone who has raced in this match (by public id). A player's
   * event is fixed from their first set until the match ends.
   */
  events: Record<string, CubeEventId>;
  /** Current set: one slot per solve for each roster player. null = no result yet. */
  results: Record<string, (SolveResult | null)[]>;
  points: Record<string, number>;
  finishedSets: FinishedSet[];
  /** When solve_review / set_result ends (server time). */
  phaseEndsAt: number | null;
  /** When the current solve's time limit runs out (server time), or null. */
  solveDeadline: number | null;
  winnerIds: string[];
  /**
   * Verified smart cube solves of the CURRENT set (every move, for replays and
   * the history), by replayKey(). Never sent in snapshots.
   */
  replays: Record<string, SmartSolveData>;
}

/** A set's scrambles: one per solve, for each event being raced. */
export type SetScrambles = Partial<Record<CubeEventId, Scramble[]>>;

/** "publicId/solveIndex": where a solve's replay is kept in Match.replays. */
export function replayKey(publicId: string, solveIndex: number): string {
  return `${publicId}/${solveIndex}`;
}

/** Submitting one solve. (matchId, setIndex, solveIndex) says exactly which solve it is. */
export interface SolveSubmission {
  matchId: string;
  setIndex: number;
  solveIndex: number;
  timeMs: number;
  penalty: SolveResult["penalty"];
  /** A smart cube solve's moves and their times (verified before it counts as one). */
  smart?: SmartSolveData;
}

export interface PenaltyChange {
  matchId: string;
  setIndex: number;
  solveIndex: number;
  penalty: SolveResult["penalty"];
}
