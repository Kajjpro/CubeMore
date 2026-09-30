/*
 * HOW THE CLIENT AND SERVER TALK
 * ==============================
 *
 * There are only two kinds of messages:
 *
 * 1. REQUESTS (client -> server)
 *    The client asks the server to do something ("join room", "submit solve"...).
 *    Every request carries an "acknowledgement" (ack) callback. The server calls
 *    it exactly once with either:
 *        { ok: true, ...extra data }
 *        { ok: false, error: "reason to show the user", code?: "NOT_CURRENT" | ... }
 *    The client NEVER changes room state itself. It just asks.
 *
 * 2. BROADCASTS (server -> clients)
 *    Whenever a room changes, the server sends the FULL room snapshot
 *    ("room:state") to everyone in that room (at most one every 50 ms).
 *    Clients replace what they have with it, unless its `version` is lower
 *    than the one they have.
 *
 * To add a new request:
 *    - add its name to ClientEvents,
 *    - add a zod schema for its payload in schemas.ts,
 *    - add a row to ClientRequests below,
 *    - handle it on the server, and the client can call `request(...)` for it.
 */

import type { z } from "zod";
import type {
  changePenaltySchema,
  chatSchema,
  quickRaceSchema,
  watchRoomSchema,
  dailySchema,
  dailyStartSchema,
  dailySubmitSchema,
  cubeMovesSchema,
  reactSchema,
  createRoomSchema,
  joinRoomSchema,
  restartSchema,
  submitSolveSchema,
  targetPlayerSchema,
  timerStatusSchema,
  updateSettingsSchema,
} from "./schemas";
import type { ChatMessage, DailyStatus, PublicRoomInfo, RoomSnapshot } from "./types";

/** Event names the CLIENT sends. */
export const ClientEvents = {
  CREATE_ROOM: "room:create",
  JOIN_ROOM: "room:join",
  LEAVE_ROOM: "room:leave",
  UPDATE_SETTINGS: "room:update_settings",
  KICK_PLAYER: "room:kick",
  START_MATCH: "room:start",
  /** Every open room (public and private), for the list on the home page. */
  LIST_ROOMS: "rooms:list",

  SUBMIT_SOLVE: "match:submit_solve",
  CHANGE_PENALTY: "match:change_penalty",
  TIMER_STATUS: "match:timer_status",
  SKIP_PLAYER: "match:skip_player",
  END_MATCH: "match:end",
  REMATCH: "match:rematch",
  BACK_TO_LOBBY: "match:back_to_lobby",

  /** Send a chat message to everyone in your room. */
  SEND_CHAT: "chat:send",
  /** React to another player's latest time (shows on their row and in the chat). */
  REACT: "chat:react",
  /** Smart cube: your moves during a solve, so others can watch your cube live. */
  CUBE_MOVES: "match:cube_moves",
  /** The daily scramble: your status and today's leaderboard. */
  DAILY_STATUS: "daily:status",
  /** Start your one daily attempt: the scramble shows and the 10 minutes start. */
  DAILY_START: "daily:start",
  /** Send your daily time. */
  DAILY_SUBMIT: "daily:submit",
  /** Watch a room without a seat in it (the streamer overlay). Gets snapshots like a player. */
  WATCH_ROOM: "room:watch",
  /** "Race now": the code of an open public room for this event, or null (then create one). */
  QUICK_RACE: "rooms:quick_race",

  /** Just answers { ok: true, serverTime }. Used to measure latency. */
  PING: "ping",
} as const;

/** Event names the SERVER sends. */
export const ServerEvents = {
  /** The full, current room snapshot. */
  ROOM_STATE: "room:state",
  /** Sent only to a player who was kicked. */
  KICKED: "room:kicked",
  /** A message for everyone, e.g. "the server is restarting". */
  NOTICE: "server:notice",
  /** One new chat line (a player's message, or a notice like "Anu joined the room"). */
  CHAT: "chat:message",
  /** A player's smart cube moves during the current solve (not part of the room state). */
  CUBE_MOVES: "match:cube_moves",
} as const;

/**
 * Error codes the client reacts to (besides showing the message):
 *  NOT_CURRENT  - that solve / set isn't current anymore: drop the request, trust the snapshot.
 *  RATE_LIMITED - too many requests: try again a bit later.
 *  INVALID      - the payload didn't pass the checks.
 *  PIN_REQUIRED - a private room: ask for the PIN (missing or wrong) and try again.
 */
export type ErrorCode = "NOT_CURRENT" | "RATE_LIMITED" | "INVALID" | "PIN_REQUIRED";

/** What the server sends back through the ack callback. */
export type AckResponse<Data extends object = object> =
  | ({ ok: true } & Data)
  | { ok: false; error: string; code?: ErrorCode };

// ---- Request payloads (the shapes come from the zod schemas in schemas.ts) ----

export type CreateRoomPayload = z.input<typeof createRoomSchema>;
export type JoinRoomPayload = z.input<typeof joinRoomSchema>;
export type UpdateSettingsPayload = z.input<typeof updateSettingsSchema>;
export type TargetPlayerPayload = z.input<typeof targetPlayerSchema>;
export type SubmitSolvePayload = z.input<typeof submitSolveSchema>;
export type ChangePenaltyPayload = z.input<typeof changePenaltySchema>;
export type TimerStatusPayload = z.input<typeof timerStatusSchema>;
export type RestartPayload = z.input<typeof restartSchema>;
export type ChatPayload = z.input<typeof chatSchema>;
export type ReactPayload = z.input<typeof reactSchema>;
export type QuickRacePayload = z.input<typeof quickRaceSchema>;
export type WatchRoomPayload = z.input<typeof watchRoomSchema>;
export type DailyPayload = z.input<typeof dailySchema>;
export type CubeMovesPayload = z.input<typeof cubeMovesSchema>;
export type DailyStartPayload = z.input<typeof dailyStartSchema>;
export type DailySubmitPayload = z.input<typeof dailySubmitSchema>;
export type EmptyPayload = Record<string, never>;

// ---- Response data ----

export interface JoinedRoomResponse {
  room: RoomSnapshot;
  /** Your own public id, so the UI can tell which player is "you". */
  youId: string;
  /** The room's recent chat (oldest first). Chat isn't part of the synced room state. */
  chat: ChatMessage[];
}

/**
 * THE LIST OF ALL REQUESTS: event name -> payload type + response type.
 * Both the server and the client are type-checked against this table.
 */
export interface ClientRequests {
  [ClientEvents.CREATE_ROOM]: { payload: CreateRoomPayload; response: JoinedRoomResponse };
  [ClientEvents.JOIN_ROOM]: { payload: JoinRoomPayload; response: JoinedRoomResponse };
  [ClientEvents.LEAVE_ROOM]: { payload: EmptyPayload; response: object };
  [ClientEvents.UPDATE_SETTINGS]: { payload: UpdateSettingsPayload; response: object };
  [ClientEvents.KICK_PLAYER]: { payload: TargetPlayerPayload; response: object };
  [ClientEvents.START_MATCH]: { payload: EmptyPayload; response: object };
  [ClientEvents.LIST_ROOMS]: { payload: EmptyPayload; response: { rooms: PublicRoomInfo[] } };
  [ClientEvents.SUBMIT_SOLVE]: { payload: SubmitSolvePayload; response: object };
  [ClientEvents.CHANGE_PENALTY]: { payload: ChangePenaltyPayload; response: object };
  [ClientEvents.TIMER_STATUS]: { payload: TimerStatusPayload; response: object };
  [ClientEvents.SKIP_PLAYER]: { payload: TargetPlayerPayload; response: object };
  [ClientEvents.END_MATCH]: { payload: EmptyPayload; response: object };
  /** Rematch after a match, or restart in the middle of one (optionally with another event). */
  [ClientEvents.REMATCH]: { payload: RestartPayload; response: object };
  [ClientEvents.BACK_TO_LOBBY]: { payload: EmptyPayload; response: object };
  [ClientEvents.SEND_CHAT]: { payload: ChatPayload; response: object };
  [ClientEvents.REACT]: { payload: ReactPayload; response: object };
  [ClientEvents.QUICK_RACE]: { payload: QuickRacePayload; response: { code: string | null } };
  [ClientEvents.WATCH_ROOM]: { payload: WatchRoomPayload; response: { room: RoomSnapshot } };
  [ClientEvents.CUBE_MOVES]: { payload: CubeMovesPayload; response: object };
  [ClientEvents.DAILY_STATUS]: { payload: DailyPayload; response: { daily: DailyStatus } };
  [ClientEvents.DAILY_START]: { payload: DailyStartPayload; response: { daily: DailyStatus } };
  [ClientEvents.DAILY_SUBMIT]: { payload: DailySubmitPayload; response: { daily: DailyStatus } };
  [ClientEvents.PING]: { payload: EmptyPayload; response: { serverTime: number } };
}

// The two types below are what Socket.IO wants. They're built from the table above.

export type ClientToServerEvents = {
  [Event in keyof ClientRequests]: (
    payload: ClientRequests[Event]["payload"],
    ack: (response: AckResponse<ClientRequests[Event]["response"]>) => void,
  ) => void;
};

export interface ServerToClientEvents {
  [ServerEvents.ROOM_STATE]: (room: RoomSnapshot) => void;
  [ServerEvents.KICKED]: (info: { code: string }) => void;
  [ServerEvents.NOTICE]: (info: { message: string }) => void;
  [ServerEvents.CHAT]: (message: ChatMessage) => void;
  [ServerEvents.CUBE_MOVES]: (batch: { playerId: string; solveKey: string; moves: string[] }) => void;
}
