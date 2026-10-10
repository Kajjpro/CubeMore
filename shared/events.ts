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
  chooseEventSchema,
  watchSchema,
  contactIdSchema,
  contactSchema,
  quickRaceSchema,
  watchRoomSchema,
  dailySchema,
  dailyStartSchema,
  dailySubmitSchema,
  cubeMovesSchema,
  reactSchema,
  createRoomSchema,
  joinRoomSchema,
  leaderboardSchema,
  practiceListSchema,
  callMediaSchema,
  callSignalSchema,
  practiceSaveSchema,
  practiceSessionSchema,
  replaySchema,
  restartSchema,
  submitSolveSchema,
  targetPlayerSchema,
  timerStatusSchema,
  updateSettingsSchema,
} from "./schemas";
import type { ChatMessage, ContactMessage, DailyStatus, Scramble, LeaderboardRow, PublicRoomInfo, Replay, RoomSnapshot, WeeklyStatus } from "./types";
import type { PracticeSession, PracticeSessionInfo, PracticeSolve, TopSolve } from "./practice";
import type { SiteStats } from "./stats";
import type { CallParticipant, CallSignal, IceServer } from "./call";

/** Event names the CLIENT sends. */
export const ClientEvents = {
  CREATE_ROOM: "room:create",
  JOIN_ROOM: "room:join",
  LEAVE_ROOM: "room:leave",
  UPDATE_SETTINGS: "room:update_settings",
  /** Mixed rooms: pick the event you race. */
  CHOOSE_EVENT: "room:choose_event",
  /** Step away and only watch, or race again (from the next set). */
  SET_WATCHING: "room:set_watching",
  /** Host: setup is done, open the room (listed, joinable). */
  OPEN_ROOM: "room:open",
  /** Waiting alone: a scramble of your event to warm up on (doesn't count). */
  WARMUP_SCRAMBLE: "room:warmup_scramble",
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
  /** The weekly smart-cube race: when, its room, its results. */
  WEEKLY_STATUS: "weekly:status",
  /** The best verified smart cube singles (this week or all time). */
  LEADERBOARD: "leaderboard:get",
  /** Every move of one verified solve, to watch it again. */
  REPLAY: "replay:get",

  /** The analyzer: a scramble to practice with (any visitor). */
  PRACTICE_SCRAMBLE: "practice:scramble",
  /** Keep an analyzed solve (signed in). The server checks and analyzes it again. */
  PRACTICE_SAVE: "practice:save",
  /** Your saved sessions, newest first. */
  PRACTICE_LIST: "practice:list",
  /** One saved session with every solve and its analysis. */
  PRACTICE_SESSION: "practice:session",
  PRACTICE_DELETE: "practice:delete",
  /** A short written summary of a session from the AI coach (if it's set up). */
  PRACTICE_COACH: "practice:coach",
  /** The fastest verified solves on CubeMore, analyzed, to compare with. */
  PRACTICE_TOP: "practice:top",

  /** The contact form. */
  CONTACT_SEND: "contact:send",
  /** The site owner (ADMIN_USER_IDS): every contact message, newest first. */
  ADMIN_MESSAGES: "admin:messages",
  /** The site owner deletes a contact message. */
  ADMIN_DELETE_MESSAGE: "admin:delete_message",
  /** The site owner: visitors, people online, races (see stats.ts). */
  ADMIN_STATS: "admin:stats",

  /** Voice and video: join the room's call (with mic / camera on or off). */
  CALL_JOIN: "call:join",
  CALL_LEAVE: "call:leave",
  /** Your mic or camera turned on or off. */
  CALL_MEDIA: "call:media",
  /** A connection message for one other browser in the call. */
  CALL_SIGNAL: "call:signal",

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
  /** Who's in the room's call, and their mic / camera (sent to the whole room on every change). */
  CALL_STATE: "call:state",
  /** A connection message from another browser in the call. */
  CALL_SIGNAL: "call:signal",
  /** A player's smart cube moves during the current solve (not part of the room state). */
  CUBE_MOVES: "match:cube_moves",
} as const;

/**
 * The connection is refused with this message when the sign-in token it came
 * with isn't valid (usually: expired). The client connects again with a fresh one.
 */
export const SIGN_IN_REFUSED = "SIGN_IN_REFUSED";

/**
 * Error codes the client reacts to (besides showing the message):
 *  NOT_CURRENT  - that solve / set isn't current anymore: drop the request, trust the snapshot.
 *  RATE_LIMITED - too many requests: try again a bit later.
 *  INVALID      - the payload didn't pass the checks.
 *  PIN_REQUIRED - a private room: ask for the PIN (missing or wrong) and try again.
 *  REJECTED     - this solve will never count (a smart cube solve that failed the check): don't send it again.
 */
export type ErrorCode = "NOT_CURRENT" | "RATE_LIMITED" | "INVALID" | "PIN_REQUIRED" | "REJECTED";

/** What the server sends back through the ack callback. */
export type AckResponse<Data extends object = object> =
  | ({ ok: true } & Data)
  | { ok: false; error: string; code?: ErrorCode };

// ---- Request payloads (the shapes come from the zod schemas in schemas.ts) ----

export type CreateRoomPayload = z.input<typeof createRoomSchema>;
export type JoinRoomPayload = z.input<typeof joinRoomSchema>;
export type UpdateSettingsPayload = z.input<typeof updateSettingsSchema>;
export type ChooseEventPayload = z.input<typeof chooseEventSchema>;
export type WatchPayload = z.input<typeof watchSchema>;
export type ContactPayload = z.input<typeof contactSchema>;
export type ContactIdPayload = z.input<typeof contactIdSchema>;
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
export type LeaderboardPayload = z.input<typeof leaderboardSchema>;
export type ReplayPayload = z.input<typeof replaySchema>;
export type PracticeSavePayload = z.input<typeof practiceSaveSchema>;
export type PracticeSessionPayload = z.input<typeof practiceSessionSchema>;
export type PracticeListPayload = z.input<typeof practiceListSchema>;
export type CallMediaPayload = z.input<typeof callMediaSchema>;
export type CallSignalPayload = z.input<typeof callSignalSchema>;
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
  [ClientEvents.CHOOSE_EVENT]: { payload: ChooseEventPayload; response: object };
  [ClientEvents.SET_WATCHING]: { payload: WatchPayload; response: object };
  [ClientEvents.OPEN_ROOM]: { payload: EmptyPayload; response: object };
  [ClientEvents.WARMUP_SCRAMBLE]: { payload: EmptyPayload; response: { scramble: Scramble } };
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
  [ClientEvents.WEEKLY_STATUS]: { payload: EmptyPayload; response: { weekly: WeeklyStatus } };
  /** available: false = no database, so no history to rank. */
  [ClientEvents.LEADERBOARD]: { payload: LeaderboardPayload; response: { rows: LeaderboardRow[]; available: boolean } };
  [ClientEvents.REPLAY]: { payload: ReplayPayload; response: { replay: Replay } };
  [ClientEvents.PRACTICE_SCRAMBLE]: { payload: EmptyPayload; response: { scrambleId: string; scramble: string } };
  [ClientEvents.PRACTICE_SAVE]: { payload: PracticeSavePayload; response: { solve: PracticeSolve; session: PracticeSessionInfo } };
  /** coach: the AI summary is set up on this server. kept: solves are kept in a database (not just until a restart). */
  [ClientEvents.PRACTICE_LIST]: { payload: PracticeListPayload; response: { sessions: PracticeSessionInfo[]; coach: boolean; kept: boolean } };
  [ClientEvents.PRACTICE_SESSION]: { payload: PracticeSessionPayload; response: { session: PracticeSession } };
  [ClientEvents.PRACTICE_DELETE]: { payload: PracticeSessionPayload; response: object };
  [ClientEvents.PRACTICE_COACH]: { payload: PracticeSessionPayload; response: { text: string } };
  [ClientEvents.PRACTICE_TOP]: { payload: EmptyPayload; response: { solves: TopSolve[] } };
  [ClientEvents.CONTACT_SEND]: { payload: ContactPayload; response: object };
  [ClientEvents.ADMIN_MESSAGES]: { payload: EmptyPayload; response: { messages: ContactMessage[] } };
  [ClientEvents.ADMIN_DELETE_MESSAGE]: { payload: ContactIdPayload; response: object };
  [ClientEvents.ADMIN_STATS]: { payload: EmptyPayload; response: { stats: SiteStats } };
  [ClientEvents.CALL_JOIN]: { payload: CallMediaPayload; response: { peerId: string; iceServers: IceServer[]; participants: CallParticipant[] } };
  [ClientEvents.CALL_LEAVE]: { payload: EmptyPayload; response: object };
  [ClientEvents.CALL_MEDIA]: { payload: CallMediaPayload; response: object };
  [ClientEvents.CALL_SIGNAL]: { payload: CallSignalPayload; response: object };
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
  [ServerEvents.CALL_STATE]: (state: { participants: CallParticipant[] }) => void;
  [ServerEvents.CALL_SIGNAL]: (signal: CallSignal & { from: string }) => void;
}
