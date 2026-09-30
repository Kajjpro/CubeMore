import type { RoomSettings } from "./types";

export const ROOM_CODE_LENGTH = 6;
/** Characters allowed in room codes. 0/O and 1/I are left out because they look alike. */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const NICKNAME_MAX_LENGTH = 20;

export const ROOM_NAME_MAX_LENGTH = 30;

/** Longest chat message. */
export const CHAT_MAX_LENGTH = 200;

/** How many chat lines a room keeps (and sends to someone who joins). */
export const CHAT_HISTORY_LENGTH = 100;

/** Private rooms are protected by a PIN of this many digits. */
export const PIN_LENGTH = 4;

export const MIN_PLAYERS_LIMIT = 2;
export const MAX_PLAYERS_LIMIT = 100;

export const DEFAULT_SETTINGS: RoomSettings = {
  name: "",
  visibility: "public",
  cubeEvent: "333",
  format: "ao5",
  winCondition: "bo3",
  maxPlayers: 50,
  solveTimeLimit: "off",
  scoring: "fastest",
};

/** How long we keep a disconnected player's seat before removing them. */
export const RECONNECT_GRACE_MS = 30_000;

/** How long an empty room is kept before it is deleted. */
export const EMPTY_ROOM_TTL_MS = 10 * 60_000;

/** The daily scramble: how long you have from "Start" to sending your time. */
export const DAILY_ATTEMPT_MS = 10 * 60_000;
/** How many rows of the daily leaderboard are sent. */
export const DAILY_LEADERBOARD_SIZE = 20;

/** The reactions anyone can send to another player's time. */
export const REACTIONS = ["🔥", "👏", "😮", "😂"] as const;

/** When a second player joins the lobby, the race starts this long after. */
export const AUTO_START_DELAY_MS = 3_000;

/** How long everyone's times for a solve are shown before the next scramble. */
export const SOLVE_REVIEW_MS = 3_000;

/** How long the set result (averages, winner, points) is shown. */
export const SET_RESULT_MS = 6_000;

/** After the timer stops, the time is confirmed as OK automatically after this long. */
export const AUTO_CONFIRM_MS = 5_000;

/**
 * With a solve time limit, a player still gets this long after the deadline to
 * send a time they stopped in time (e.g. while choosing OK / +2 / DNF).
 */
export const SUBMIT_GRACE_MS = 6_000;

/** A +2 penalty, in milliseconds. */
export const PLUS_TWO_MS = 2_000;

/** Longest time the server accepts for one solve (2 hours, enough for multi-blind). */
export const MAX_SOLVE_TIME_MS = 2 * 60 * 60 * 1000;
