// Data shapes that both the server and the client use.
// If you change something here, TypeScript will point out every place
// on both sides that needs updating.

import type { CubeEventId } from "./cubeEvents";

export const ROOM_FORMATS = ["single", "ao5", "ao12"] as const;
export type RoomFormat = (typeof ROOM_FORMATS)[number];

export const WIN_CONDITIONS = ["bo1", "bo3", "bo5", "unlimited"] as const;
export type WinCondition = (typeof WIN_CONDITIONS)[number];

/** Minutes a player has for each solve before they get an automatic DNF. */
export const SOLVE_TIME_LIMITS = ["off", 1, 2, 5, 10] as const;
export type SolveTimeLimit = (typeof SOLVE_TIME_LIMITS)[number];

/** "reconnecting" = their connection dropped, and we're holding their seat for a short time. */
export type PlayerStatus = "connected" | "reconnecting";

/** Whether a player's timer is running right now (never their live time, just this). */
export type TimerStatus = "solving" | "idle";

/** public = listed on the home page for everyone; private = hidden, joining needs a PIN. */
export const ROOM_VISIBILITIES = ["public", "private"] as const;
export type RoomVisibility = (typeof ROOM_VISIBILITIES)[number];

export interface RoomSettings {
  /** The room's name, shown in the public list and at the top of the room. */
  name: string;
  visibility: RoomVisibility;
  /** Which puzzle everyone races on, e.g. "333" or "pyram". */
  cubeEvent: CubeEventId;
  format: RoomFormat;
  winCondition: WinCondition;
  maxPlayers: number;
  solveTimeLimit: SolveTimeLimit;
}

/** A scramble that every player in the room solves. Made by the server. */
export interface Scramble {
  /** The event it was made for (so the picture always matches the text). */
  cubeEvent: CubeEventId;
  /** The moves, e.g. "R U R' F2 ...". Megaminx scrambles contain line breaks. */
  text: string;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export const PENALTIES = ["OK", "+2", "DNF"] as const;
export type Penalty = (typeof PENALTIES)[number];

/**
 * Where a result came from:
 *  "submitted" - the player sent it
 *  "timeout"   - the solve time limit ran out (automatic DNF)
 *  "skipped"   - the host skipped the player (automatic DNF)
 *  "removed"   - the player left the room (automatic DNF)
 */
export type ResultSource = "submitted" | "timeout" | "skipped" | "removed";

/** One solve. Times are ALWAYS whole milliseconds (never decimals). */
export interface SolveResult {
  /** The raw time as timed, without the +2. 0 for automatic DNFs. */
  timeMs: number;
  penalty: Penalty;
  source: ResultSource;
}

/**
 * A scored value: whole milliseconds (always a multiple of 10, because
 * scores use hundredths like the WCA), or "DNF".
 */
export type Mark = number | "DNF";

/** A player's result for one set: the single or the average, and their best single. */
export interface SetStanding {
  result: Mark;
  best: Mark;
}

// ---------------------------------------------------------------------------
// Snapshots: what the server sends to every client
// ---------------------------------------------------------------------------

/** One player, as everyone in the room sees them. */
export interface PlayerSnapshot {
  /** Public id. Safe to show to others (NOT the secret playerId from localStorage). */
  id: string;
  nickname: string;
  status: PlayerStatus;
  timerStatus: TimerStatus;
  /** True if they joined during a set: they watch until the next set starts. */
  spectator: boolean;
}

/**
 * The match state machine:
 *   solving -> solve_review -> solving -> ... -> set_result -> solving -> ... -> match_over
 */
export type MatchPhase = "solving" | "solve_review" | "set_result" | "match_over";

/** A finished set, kept short: the winners and each player's set result (not every solve). */
export interface SetSummary {
  setIndex: number;
  winnerIds: string[];
  standings: Record<string, SetStanding>;
}

export interface MatchSnapshot {
  matchId: string;
  phase: MatchPhase;
  /** 0-based. Shown to people as "Set {setIndex + 1}". */
  setIndex: number;
  /** 0-based index of the current solve inside the set. */
  solveIndex: number;
  solvesPerSet: number;
  /** Points needed to win (bo3 = 2), or null for unlimited. */
  targetPoints: number | null;
  /** Only the CURRENT scramble. Future scrambles are never sent. */
  scramble: Scramble | null;
  /** Server time when the current solve's time limit runs out, or null. */
  solveDeadline: number | null;
  /** Server time when solve_review / set_result ends, or null. */
  phaseEndsAt: number | null;
  /** Public ids of the players in this set (everyone else is a spectator). */
  roster: string[];
  /** Every roster player's results for the current set (null = no result yet). */
  results: Record<string, (SolveResult | null)[]>;
  /** Each roster player's set result so far (null until all their solves are in). */
  standings: Record<string, SetStanding | null>;
  /** Points of everyone who has played in this match. */
  points: Record<string, number>;
  finishedSets: SetSummary[];
  /** Filled in when the match is over. Empty = nobody won. */
  winnerIds: string[];
}

/**
 * The FULL state of a room, exactly as the server sends it to clients.
 * Clients render only this. They never edit it themselves.
 */
export interface RoomSnapshot {
  code: string;
  /** Goes up by 1 on every change. Clients use it to ignore old snapshots. */
  version: number;
  /** The server's clock when this was sent. Clients use it to show correct countdowns. */
  serverTime: number;
  settings: RoomSettings;
  /** A private room's 4-digit PIN (everyone in the room already knows it), or null. */
  pin: string | null;
  /** Public id of the host, or null if the room is empty. */
  hostId: string | null;
  /** In join order: players[0] has been in the room the longest. */
  players: PlayerSnapshot[];
  /** null = the room is in the lobby. */
  match: MatchSnapshot | null;
}

/** One line of the public room list on the home page. Never includes private rooms. */
export interface PublicRoomInfo {
  code: string;
  name: string;
  cubeEvent: RoomSettings["cubeEvent"];
  format: RoomFormat;
  winCondition: WinCondition;
  players: number;
  maxPlayers: number;
  /** true = a match is running (new players watch until the next set). */
  racing: boolean;
  hostName: string | null;
}
