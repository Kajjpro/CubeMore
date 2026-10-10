// Data shapes that both the server and the client use.
// If you change something here, TypeScript will point out every place
// on both sides that needs updating.

import type { CubeEventId } from "./cubeEvents";

export const ROOM_FORMATS = ["single", "ao5", "ao12"] as const;
export type RoomFormat = (typeof ROOM_FORMATS)[number];

export const WIN_CONDITIONS = ["bo1", "bo3", "bo5", "unlimited"] as const;
export type WinCondition = (typeof WIN_CONDITIONS)[number];

/**
 * How a set is won.
 *   fastest:  the best average (or single) wins, WCA-style.
 *   handicap: everyone races their own pace (their average from earlier sets);
 *             whoever beats it by the most wins. Fair for mixed levels.
 */
export const SCORING_MODES = ["fastest", "handicap"] as const;
export type ScoringMode = (typeof SCORING_MODES)[number];

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
  /**
   * Which puzzle everyone races on, e.g. "333" or "pyram". In a mixed room
   * it's the event a player races until they pick their own.
   */
  cubeEvent: CubeEventId;
  /** Mixed events: every player picks their own event (one of MIXED_EVENTS) and they race on time. */
  mixedEvents: boolean;
  format: RoomFormat;
  winCondition: WinCondition;
  maxPlayers: number;
  solveTimeLimit: SolveTimeLimit;
  scoring: ScoringMode;
  /** Smart cubes only: every solve must be a verified smart cube solve (3x3 events). */
  smartOnly: boolean;
  /**
   * The race starts by itself 3 seconds after someone joins the host (true), or
   * only when the host presses Start (false: wait for more people). Rooms saved
   * before this setting existed start by themselves.
   */
  autoStart?: boolean;
}

/** A scramble that every player on its event solves. Made by the server. */
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
 *  "away"      - the player switched to watching during the set (automatic DNF)
 */
export type ResultSource = "submitted" | "timeout" | "skipped" | "removed" | "away";

/** One solve. Times are ALWAYS whole milliseconds (never decimals). */
export interface SolveResult {
  /** The raw time as timed, without the +2. 0 for automatic DNFs. */
  timeMs: number;
  penalty: Penalty;
  source: ResultSource;
  /** A smart cube solve the server replayed and checked: its move count and turns per second. */
  verified?: { moves: number; tps: number };
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
  /** Server time their timer started, while it runs (for the live clock others see), or null. */
  solvingSince: number | null;
  /** True if they joined during a set: they watch until the next set starts. */
  spectator: boolean;
  /** Playing without an account (anyone can use any nickname). Signed-in players have a unique username. */
  guest: boolean;
  /**
   * Stepped away: still in the room (chat, standings), but out of the race
   * until they come back. Nobody waits for them.
   */
  watching: boolean;
  /** Mixed rooms: just joined and still picking their event (the race waits for them). */
  pickingEvent: boolean;
  /**
   * The event they race next: their own pick in a mixed room, otherwise the
   * room's event. (In a running match, MatchSnapshot.events says what they race now.)
   */
  cubeEvent: CubeEventId;
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
  /** Handicap only: each player's pace going into this set (ms), null = no pace yet. */
  paces: Record<string, number | null> | null;
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
  /**
   * Only the CURRENT scramble of each event being raced (one event, unless the
   * room is mixed), while it's being solved. Future scrambles are never sent.
   */
  scrambles: Partial<Record<CubeEventId, Scramble>>;
  /** The event of everyone who has raced in this match. It's fixed until the match ends. */
  events: Record<string, CubeEventId>;
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
  /** Handicap only: each roster player's pace for the current set (ms), null = no pace yet. */
  paces: Record<string, number | null> | null;
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
  /** Lobby only: when the race starts by itself (someone joined), or null. */
  autoStartAt: number | null;
  /** Best of can be changed until the first race starts, then it's fixed. */
  bestOfLocked: boolean;
  /** The weekly race (opened by the server, no host, starts at autoStartAt). */
  weekly: boolean;
  /**
   * Just created: the host is still setting it up. Nobody else can join, and it
   * isn't listed, until the host opens it.
   */
  setup: boolean;
}

/**
 * One chat line in a room. "system" lines are notices the server writes itself
 * ("Anu joined the room", "Nomin submitted 9.12").
 */
export interface ChatMessage {
  id: string;
  /** Server time when it was sent. */
  at: number;
  /** "reaction": someone reacted to another player's time ("🔥 Nomin's 9.12"). */
  kind: "user" | "system" | "reaction";
  /** The sender's nickname (user messages and reactions). */
  name: string | null;
  /** The sender's PUBLIC id (user messages and reactions), so the UI can mark your own. */
  senderId: string | null;
  /** Reactions: the PUBLIC id of the player reacted to (their row shows the emoji). */
  targetId: string | null;
  text: string;
}

/** One line of the public room list on the home page. Never includes private rooms. */
export interface PublicRoomInfo {
  code: string;
  name: string;
  cubeEvent: RoomSettings["cubeEvent"];
  /** Everyone picks their own event (2x2, Pyraminx, Skewb, Clock). */
  mixedEvents: boolean;
  format: RoomFormat;
  winCondition: WinCondition;
  players: number;
  maxPlayers: number;
  /** true = a match is running (new players watch until the next set). */
  racing: boolean;
  /** Private rooms are listed too, but joining one needs its PIN. */
  visibility: RoomVisibility;
  /** Smart cubes only. */
  smartOnly: boolean;
  hostName: string | null;
}

// ---------------------------------------------------------------------------
// The daily scramble: one 3x3 scramble per day (UTC) for everyone, one attempt
// ---------------------------------------------------------------------------

/** One line of the daily leaderboard. */
export interface DailyRow {
  rank: number;
  name: string;
  /** The player's PUBLIC id (so the page can mark your own row). */
  playerId: string;
  result: SolveResult;
}

/** Everything the daily page shows, for one player. */
export interface DailyStatus {
  /** "2026-09-30" (UTC). */
  day: string;
  /** The server's clock when this was sent (for correct countdowns). */
  serverTime: number;
  /** Server time when the next daily scramble comes out (midnight UTC). */
  nextAt: number;
  /** new = not started; started = the scramble is showing, the clock is on; done = result in. */
  status: "new" | "started" | "done";
  /** Only once you've started: nobody sees it before their own attempt. */
  scramble: Scramble | null;
  /** While started: the server time the attempt runs out (then it counts as DNF). */
  deadline: number | null;
  /** Your result (done only), your rank, and how many have finished today. */
  result: SolveResult | null;
  rank: number | null;
  total: number;
  /** The top of today's leaderboard. */
  leaderboard: DailyRow[];
  /** Your public id, to find your row. */
  youId: string;
}

// ---------------------------------------------------------------------------
// Smart cubes: the weekly race, the verified leaderboard, replays
// ---------------------------------------------------------------------------

/** One player's result in a weekly race (an ao5). */
export interface WeeklyRow {
  rank: number;
  name: string;
  /** Public id. */
  playerId: string;
  average: Mark;
  best: Mark;
}

/** Everything the home page shows about the weekly race. */
export interface WeeklyStatus {
  /** "2026-10-10" (UTC). */
  weeklyId: string;
  startsAt: number;
  /** The room opens this long before the start. */
  opensAt: number;
  serverTime: number;
  /** upcoming: not open yet; open: join now; racing: started; over: results are in. */
  phase: "upcoming" | "open" | "racing" | "over";
  /** The room to join (open or racing). */
  roomCode: string | null;
  /** This race's results (once it's over). */
  results: WeeklyRow[];
  /** The race before, for "last week's results". */
  previous: { weeklyId: string; results: WeeklyRow[] } | null;
}

/** One line of the verified leaderboard: a player's best verified single. */
export interface LeaderboardRow {
  rank: number;
  name: string;
  playerId: string;
  /** The single that counts (with +2), in ms. */
  timeMs: number;
  moves: number;
  tps: number;
  at: number;
  /** For REPLAY. */
  replayId: string;
}

/** Every move of one verified solve, to watch it again. */
export interface Replay {
  name: string;
  scramble: string;
  moves: string[];
  /** When each move happened, ms from the start. */
  times: number[];
  timeMs: number;
  penalty: Penalty;
  tps: number;
}

// ---------------------------------------------------------------------------
// The contact form
// ---------------------------------------------------------------------------

/** A message sent with the contact form. Only the site owner reads them (/admin). */
export interface ContactMessage {
  id: string;
  /** Server time when it was sent. */
  at: number;
  name: string;
  /** Where to reply. */
  email: string;
  message: string;
  /** The sender's username, if they were signed in. */
  username: string | null;
}
