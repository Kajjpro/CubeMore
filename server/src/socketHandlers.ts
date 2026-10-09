/*
 * SOCKET LAYER: connects Socket.IO events to the rooms.
 *
 * Every request goes through the same steps (see `on()` below):
 *   1. RATE LIMIT: too many requests from one connection are refused.
 *   2. CHECK the payload with its zod schema (shared/schemas.ts). Never trust the client.
 *   3. QUEUE: the work runs in the room's queue (LiveRoom.run), one action at a time.
 *   4. RUN the pure room logic (roomLogic.ts) to get the new room, and COMMIT it.
 *      The full snapshot is then broadcast to everyone in the room.
 *   5. REPLY through the ack callback: { ok: true } or { ok: false, error, code? }.
 *
 * Socket.IO "rooms": each room code is also a Socket.IO room name, so
 * `io.to(code).emit(...)` reaches every browser tab that is in that room.
 */

import { randomUUID } from "node:crypto";
import type { Server, Socket } from "socket.io";
import type { z } from "zod";
import {
  ClientEvents,
  DEFAULT_SETTINGS,
  ServerEvents,
  SIGN_IN_REFUSED,
  type AckResponse,
  type ClientRequests,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type WeeklyRow,
  type WeeklyStatus,
} from "@cube-racing/shared";
import {
  changePenaltySchema,
  chatSchema,
  chooseEventSchema,
  watchSchema,
  contactIdSchema,
  contactSchema,
  createRoomSchema,
  describeProblem,
  emptySchema,
  joinRoomSchema,
  quickRaceSchema,
  reactSchema,
  watchRoomSchema,
  dailySchema,
  dailyStartSchema,
  dailySubmitSchema,
  cubeMovesSchema,
  leaderboardSchema,
  practiceListSchema,
  practiceSaveSchema,
  practiceSessionSchema,
  replaySchema,
  restartSchema,
  submitSolveSchema,
  targetPlayerSchema,
  timerStatusSchema,
  updateSettingsSchema,
} from "@cube-racing/shared/schemas";
import { accountPlayerId, type Account, type AccountVerifier } from "./accounts";
import { newContactMessage, type ContactStore } from "./contact";
import type { MatchTiming } from "./match/types";
import type { RoomPersistence } from "./persistence/persistence";
import { restoreRoom } from "./persistence/restore";
import type { HistoryReader, SavedRoom } from "./persistence/store";
import { rankWeekly } from "./weekly/results";
import { currentWeeklyRace, previousWeeklyRace, WEEKLY_SETTINGS, type WeeklySchedule } from "./weekly/schedule";
import { RateLimiter } from "./rateLimit";
import { LiveRoom, type RestoredChat } from "./rooms/liveRoom";
import * as logic from "./rooms/roomLogic";
import { RoomStore } from "./rooms/roomStore";
import type { ServerRoom } from "./rooms/types";
import type { DailyService } from "./daily/daily";
import { generateScramble, generateSetScrambles } from "./scrambles";
import { IssuedScrambles, PracticeError, type PracticeService } from "./practice/service";

/** What the server remembers about each connection (browser tab). */
interface SocketData {
  roomCode: string | null;
  playerId: string | null;
  limiter: RateLimiter;
  /** A stricter limit just for chat, so nobody can flood the room chat. */
  chatLimiter: RateLimiter;
  /** A room this connection watches without playing (the streamer overlay), or null. */
  watching: string | null;
  /** Smart cube moves have their own limit (up to ~10 batches a second while solving). */
  movesLimiter: RateLimiter;
  /** The signed-in account (checked when the connection opened), or null for a guest. */
  account: Account | null;
  /** Analyzer scrambles given to this connection (a kept solve must use one). */
  practiceScrambles: IssuedScrambles;
}

type NoEvents = Record<string, never>;
export type IoServer = Server<ClientToServerEvents, ServerToClientEvents, NoEvents, SocketData>;
type IoSocket = Socket<ClientToServerEvents, ServerToClientEvents, NoEvents, SocketData>;

export interface SocketOptions {
  timing: MatchTiming;
  /** At most one snapshot per room this often. */
  broadcastIntervalMs: number;
  log: (code: string, message: string) => void;
  /** Lets tests use fake scrambles. */
  makeScrambles?: typeof generateSetScrambles;
  /** The daily scramble (see daily/daily.ts). */
  daily: DailyService;
  /** Keeps rooms and match history in the database, or null to keep everything in memory. */
  persistence?: RoomPersistence | null;
  /** Rooms saved before the last restart: they open again, waiting for their players. */
  restoredRooms?: SavedRoom[];
  /** When the weekly smart-cube race is. */
  weeklySchedule: WeeklySchedule;
  /** The history (weekly results, verified leaderboard, replays), or null without a database. */
  reader?: HistoryReader | null;
  /** Checks sign-in tokens (Clerk), or null: no accounts, everyone is a guest. */
  accounts?: AccountVerifier | null;
  /** Where contact form messages go. */
  contact: ContactStore;
  /** Clerk user ids allowed to read them (the site owner). */
  adminUserIds: string[];
  /** The analyzer: kept solves, the coach, the top solves. */
  practice: PracticeService;
}

const NOT_IN_ROOM_ERROR = "You are not in a room.";
const ROOM_NOT_FOUND_ERROR = "Room not found. Check the code, or the room may have closed.";

/** Rate limit per connection: bursts of 30, then 15 requests per second. */
const RATE_LIMIT_BURST = 30;
const RATE_LIMIT_PER_SECOND = 15;

/** Chat: bursts of 5 messages, then one every 2 seconds. */
const CHAT_BURST = 5;
const CHAT_PER_SECOND = 0.5;

export function registerSocketHandlers(
  io: IoServer,
  options: SocketOptions,
): { rooms: RoomStore; stop: () => void; flush: () => Promise<void> } {
  const rooms = new RoomStore();
  const { log } = options;
  const persistence = options.persistence ?? null;
  const reader = options.reader ?? null;
  /** Weekly races we opened a room for, and finished weekly races' results. */
  const openedWeekly = new Set<string>();
  const weeklyResults = new Map<string, WeeklyRow[]>();

  for (const saved of options.restoredRooms ?? []) {
    const live = openRoom(restoreRoom(saved.room, saved.savedAt, Date.now()), { log: saved.chat, count: saved.chatCount });
    // Save the restored copy soon: its version jumped, and a second restart must keep that.
    persistence?.saveSoon(live);
    log(live.code, `restored (${live.state.players.length} players, waiting for them to reconnect)`);
  }

  // SIGN-IN: a browser that is signed in sends its session token when it
  // connects. It's checked once, here. A token that isn't valid refuses the
  // connection (the browser then comes back with a fresh one) rather than
  // quietly making a signed-in player a guest.
  const accounts = options.accounts ?? null;

  // The contact form: 3 messages, then one every 5 minutes, per visitor (by
  // address, so reconnecting doesn't reset it). Behind a host's proxy (Render,
  // Fly) the visitor's address is the first one in X-Forwarded-For.
  const contactLimiters = new Map<string, RateLimiter>();
  const contactLimiter = (socket: IoSocket): RateLimiter => {
    const forwarded = socket.handshake.headers["x-forwarded-for"];
    const address = (typeof forwarded === "string" ? forwarded.split(",")[0].trim() : "") || socket.handshake.address;
    if (contactLimiters.size > 10_000) contactLimiters.clear(); // never grows without end
    let limiter = contactLimiters.get(address);
    if (!limiter) contactLimiters.set(address, (limiter = new RateLimiter(3, 1 / 300)));
    return limiter;
  };
  io.use(async (socket, next) => {
    const token: unknown = socket.handshake.auth?.token;
    let account: Account | null = null;
    if (typeof token === "string" && token && accounts) {
      account = await accounts.verify(token);
      if (!account) return next(new Error(SIGN_IN_REFUSED));
    }
    socket.data = { ...socket.data, account };
    next();
  });

  io.on("connection", (socket) => {
    socket.data = {
      roomCode: null,
      playerId: null,
      limiter: new RateLimiter(RATE_LIMIT_BURST, RATE_LIMIT_PER_SECOND),
      chatLimiter: new RateLimiter(CHAT_BURST, CHAT_PER_SECOND),
      watching: null,
      movesLimiter: new RateLimiter(20, 12),
      account: socket.data?.account ?? null,
      practiceScrambles: new IssuedScrambles(),
    };

    /**
     * Who this connection plays as: a signed-in account (the same player on
     * every device, called by their username), or the guest id and nickname
     * the browser sent.
     */
    const me = (input: { playerId: string; nickname?: string }): { playerId: string; nickname: string; guest: boolean } => {
      const account = socket.data.account;
      return account
        ? { playerId: accountPlayerId(account.userId), nickname: account.username, guest: false }
        : { playerId: input.playerId, nickname: input.nickname ?? "", guest: true };
    };

    // ---- Rooms ----

    on(socket, ClientEvents.CREATE_ROOM, createRoomSchema, async (input) => {
      const settings = { ...DEFAULT_SETTINGS, ...input.settings };
      const settingsError = logic.settingsError(settings);
      if (settingsError) return logic.fail(settingsError);
      await leaveCurrentRoom(socket);
      const code = rooms.generateUniqueCode();
      const player = { ...me(input), cubeEvent: input.cubeEvent };
      const room = logic.createRoom(code, settings, player, Date.now(), input.pin ?? null);
      const live = openRoom(room);
      log(code, `${room.settings.visibility} room "${room.settings.name}" created by ${player.nickname}`);
      live.addChat("system", `${player.nickname} created the room`);

      return live.run(() => {
        enterSocketRoom(socket, code, player.playerId);
        return { ok: true, room: live.snapshot(), youId: logic.publicIdFor(player.playerId), chat: live.chatHistory() };
      });
    });

    /** Used for joining the first time AND for coming back after a refresh or network drop. */
    on(socket, ClientEvents.JOIN_ROOM, joinRoomSchema, async (input) => {
      if (!rooms.get(input.code)) return logic.fail(ROOM_NOT_FOUND_ERROR);
      const player = { ...me(input), cubeEvent: input.cubeEvent };

      // One tab can only be in one room at a time, as one player.
      if (socket.data.roomCode !== input.code || socket.data.playerId !== player.playerId) {
        await leaveCurrentRoom(socket);
      }

      const live = rooms.get(input.code);
      if (!live) return logic.fail(ROOM_NOT_FOUND_ERROR);

      return live.run(() => {
        if (live.deleted) return logic.fail(ROOM_NOT_FOUND_ERROR);
        const needsPin = live.state.pin !== null && !logic.findPlayer(live.state, player.playerId);
        if (needsPin && input.pin && !live.wrongPins.hasToken()) {
          return logic.fail("Too many wrong PINs for this room. Wait a minute and try again.", "PIN_REQUIRED");
        }
        const result = logic.joinRoom(live.state, player, Date.now(), input.pin);
        if (!result.ok) {
          if (result.code === "PIN_REQUIRED" && input.pin) live.wrongPins.tryTake();
          return result;
        }

        const isNewPlayer = !logic.findPlayer(live.state, player.playerId);
        live.commit(result.room);
        enterSocketRoom(socket, input.code, player.playerId);
        if (isNewPlayer) log(input.code, `${player.nickname} joined`);

        // The player gets the full current snapshot (and the recent chat) right away, in the reply.
        return { ok: true, room: live.snapshot(), youId: logic.publicIdFor(player.playerId), chat: live.chatHistory() };
      });
    });

    /** A chat message to everyone in your room. Rendered as plain text by the clients. */
    on(socket, ClientEvents.SEND_CHAT, chatSchema, (input) =>
      inMyRoom(socket, (live, playerId) => {
        const player = logic.findPlayer(live.state, playerId);
        if (!player) return logic.fail(NOT_IN_ROOM_ERROR);
        if (!socket.data.chatLimiter.tryTake()) {
          return logic.fail("You're sending messages too fast. Wait a moment.", "RATE_LIMITED");
        }
        live.addChat("user", input.text, { name: player.nickname, publicId: player.publicId });
        return { ok: true };
      }),
    );

    /** A reaction to another player's latest time. Shares the chat's rate limit. */
    on(socket, ClientEvents.REACT, reactSchema, (input) =>
      inMyRoom(socket, (live, playerId) => {
        const player = logic.findPlayer(live.state, playerId);
        if (!player) return logic.fail(NOT_IN_ROOM_ERROR);
        if (input.targetId === player.publicId) return logic.fail("You can't react to your own time.");
        const text = logic.reactionText(live.state, input.targetId, input.emoji);
        if (!text) return logic.fail("That player isn't in the room any more.");
        if (!socket.data.chatLimiter.tryTake()) {
          return logic.fail("You're reacting too fast. Wait a moment.", "RATE_LIMITED");
        }
        live.addChat("reaction", text, { name: player.nickname, publicId: player.publicId }, input.targetId);
        return { ok: true };
      }),
    );

    /**
     * Watch a room without a seat (the streamer overlay): the connection gets
     * every snapshot, but isn't a player. Private rooms need the PIN, with the
     * same wrong-PIN limit as joining.
     */
    on(socket, ClientEvents.WATCH_ROOM, watchRoomSchema, (input) => {
      const live = rooms.get(input.code);
      if (!live || live.deleted) return logic.fail(ROOM_NOT_FOUND_ERROR);
      const pin = live.state.pin;
      if (pin !== null && input.pin !== pin) {
        if (!input.pin) return logic.fail("This room is private. Add its PIN to the overlay link.", "PIN_REQUIRED");
        if (!live.wrongPins.tryTake()) {
          return logic.fail("Too many wrong PINs for this room. Wait a minute and try again.", "PIN_REQUIRED");
        }
        return logic.fail("Wrong PIN in the overlay link.", "PIN_REQUIRED");
      }
      if (socket.data.watching && socket.data.watching !== input.code && socket.data.watching !== socket.data.roomCode) {
        socket.leave(socket.data.watching);
      }
      socket.join(input.code);
      socket.data.watching = input.code;
      return { ok: true, room: live.snapshot() };
    });

    /**
     * Smart cube moves during a solve: passed on to everyone else in the room
     * (not stored, not in snapshots). Only while this player's timer runs.
     */
    on(socket, ClientEvents.CUBE_MOVES, cubeMovesSchema, (input) =>
      inMyRoom(socket, (live, playerId) => {
        const player = logic.findPlayer(live.state, playerId);
        const match = live.state.match;
        if (!player || !match || match.phase !== "solving" || player.timerStatus !== "solving") {
          return logic.fail("Not solving right now.", "NOT_CURRENT");
        }
        if (!socket.data.movesLimiter.tryTake()) return logic.fail("Too many moves at once.", "RATE_LIMITED");
        const solveKey = `${match.matchId}/${match.setIndex}/${match.solveIndex}`;
        socket.to(live.code).emit(ServerEvents.CUBE_MOVES, { playerId: player.publicId, solveKey, moves: input.moves });
        return { ok: true };
      }),
    );

    // ---- The daily scramble ----

    // A signed-in player has one daily attempt per account (not per device).
    on(socket, ClientEvents.DAILY_STATUS, dailySchema, (input) => options.daily.status(me(input).playerId));
    on(socket, ClientEvents.DAILY_START, dailyStartSchema, (input) => {
      const player = me(input);
      return options.daily.start(player.playerId, player.nickname);
    });
    on(socket, ClientEvents.DAILY_SUBMIT, dailySubmitSchema, (input) =>
      options.daily.submit(me(input).playerId, input.timeMs, input.penalty),
    );

    // ---- The contact form, and reading it (the site owner only) ----

    on(socket, ClientEvents.CONTACT_SEND, contactSchema, async (input) => {
      if (!contactLimiter(socket).tryTake()) {
        return logic.fail("Thanks! You've sent a few messages already. Please wait a few minutes.", "RATE_LIMITED");
      }
      // The hidden "website" field is only ever filled in by bots: say thanks, keep nothing.
      if (input.website) return { ok: true };
      const { name, email, message } = input;
      await options.contact.add(newContactMessage({ name, email, message, username: socket.data.account?.username ?? null }, Date.now()));
      log("contact", `new message from ${name}`);
      return { ok: true };
    });

    const isAdmin = () => socket.data.account !== null && options.adminUserIds.includes(socket.data.account.userId);
    const NOT_ADMIN = "Only the site owner can read the messages. Sign in with that account.";

    on(socket, ClientEvents.ADMIN_MESSAGES, emptySchema, async () =>
      isAdmin() ? { ok: true, messages: await options.contact.list(500) } : logic.fail(NOT_ADMIN),
    );

    on(socket, ClientEvents.ADMIN_DELETE_MESSAGE, contactIdSchema, async (input) => {
      if (!isAdmin()) return logic.fail(NOT_ADMIN);
      await options.contact.remove(input.id);
      return { ok: true };
    });

    // ---- Smart cubes: the weekly race, the verified leaderboard, replays ----

    on(socket, ClientEvents.WEEKLY_STATUS, emptySchema, async () => ({ ok: true, weekly: await weeklyStatus() }));

    on(socket, ClientEvents.LEADERBOARD, leaderboardSchema, async (input) => {
      if (!reader) return { ok: true, rows: [], available: false };
      const since = input.period === "week" ? Date.now() - 7 * 24 * 60 * 60_000 : 0;
      return { ok: true, rows: await reader.leaderboard("333", since, 20), available: true };
    });

    on(socket, ClientEvents.REPLAY, replaySchema, async (input) => {
      const replay = reader ? await reader.replay(input.id) : null;
      return replay ? { ok: true, replay } : logic.fail("That solve isn't available.");
    });

    // ---- The analyzer (/analyze) ----

    const practice = options.practice;
    const SIGN_IN_TO_KEEP = "Sign in to keep your solves. They're still analyzed here.";
    /** Runs an analyzer request for the signed-in player; their mistakes become friendly errors. */
    const forAccount = async (work: (userId: string) => Promise<AckResponse>): Promise<AckResponse> => {
      const account = socket.data.account;
      if (!account) return logic.fail(SIGN_IN_TO_KEEP);
      try {
        return await work(account.userId);
      } catch (error) {
        if (error instanceof PracticeError) return logic.fail(error.message);
        throw error;
      }
    };

    on(socket, ClientEvents.PRACTICE_SCRAMBLE, emptySchema, async () => {
      const scramble = await generateScramble("333");
      return { ok: true, scramble: scramble.text, scrambleId: socket.data.practiceScrambles.issue(scramble.text) };
    });

    on(socket, ClientEvents.PRACTICE_SAVE, practiceSaveSchema, (input) =>
      forAccount(async (userId) => ({ ok: true, ...(await practice.save(userId, input, socket.data.practiceScrambles)) })),
    );

    on(socket, ClientEvents.PRACTICE_LIST, practiceListSchema, async (input) => {
      const sessions = socket.data.account ? await practice.list(socket.data.account.userId, input.before) : [];
      return { ok: true, sessions, coach: practice.coachAvailable, kept: practice.kept };
    });

    on(socket, ClientEvents.PRACTICE_SESSION, practiceSessionSchema, (input) =>
      forAccount(async (userId) => ({ ok: true, session: await practice.get(userId, input.sessionId) })),
    );

    on(socket, ClientEvents.PRACTICE_DELETE, practiceSessionSchema, (input) =>
      forAccount(async (userId) => {
        await practice.delete(userId, input.sessionId);
        return { ok: true };
      }),
    );

    on(socket, ClientEvents.PRACTICE_COACH, practiceSessionSchema, (input) =>
      forAccount(async (userId) => ({ ok: true, text: await practice.coachSummary(userId, input.sessionId) })),
    );

    on(socket, ClientEvents.PRACTICE_TOP, emptySchema, async () => ({ ok: true, solves: await practice.topSolves() }));

    /** "Race now": an open public room for this event, or null (the client then creates one). */
    on(socket, ClientEvents.QUICK_RACE, quickRaceSchema, (input) => ({
      ok: true,
      code: logic.quickRaceCode(
        rooms.all().filter((live) => !live.deleted).map((live) => live.state),
        input.cubeEvent,
        socket.data.roomCode,
      ),
    }));

    on(socket, ClientEvents.LEAVE_ROOM, emptySchema, async () => {
      await leaveCurrentRoom(socket);
      return { ok: true };
    });

    on(socket, ClientEvents.UPDATE_SETTINGS, updateSettingsSchema, (input) =>
      inMyRoom(socket, (live, playerId) =>
        commitResult(live, logic.updateSettings(live.state, playerId, input.settings, input.pin)),
      ),
    );

    on(socket, ClientEvents.CHOOSE_EVENT, chooseEventSchema, (input) =>
      inMyRoom(socket, (live, playerId) => commitResult(live, logic.chooseEvent(live.state, playerId, input.cubeEvent, Date.now()))),
    );

    /** Host: done setting up; the room is listed and others can join. */
    on(socket, ClientEvents.OPEN_ROOM, emptySchema, () =>
      inMyRoom(socket, (live, playerId) => {
        const result = logic.openRoom(live.state, playerId);
        if (result.ok && result.room !== live.state) log(live.code, "opened (setup done)");
        return commitResult(live, result);
      }),
    );

    /**
     * Warming up alone: a scramble of your event. It only reads the room, so it
     * doesn't wait in the room's queue (a big cube's scramble can take a moment).
     */
    on(socket, ClientEvents.WARMUP_SCRAMBLE, emptySchema, async () => {
      const { roomCode, playerId } = socket.data;
      const live = roomCode ? rooms.get(roomCode) : undefined;
      const player = live && playerId ? logic.findPlayer(live.state, playerId) : undefined;
      if (!live || !player) return logic.fail(NOT_IN_ROOM_ERROR);
      const [scramble] = await (options.makeScrambles ?? generateSetScrambles)(logic.eventOf(live.state.settings, player), 1);
      return { ok: true, scramble };
    });

    on(socket, ClientEvents.SET_WATCHING, watchSchema, (input) =>
      inMyRoom(socket, (live, playerId) => commitResult(live, logic.setWatching(live.state, playerId, input.watching, Date.now()))),
    );

    on(socket, ClientEvents.KICK_PLAYER, targetPlayerSchema, (input) =>
      inMyRoom(socket, (live, playerId) => {
        const target = live.state.players.find((p) => p.publicId === input.targetId);
        const result = logic.kickPlayer(live.state, playerId, input.targetId, Date.now());
        if (!result.ok) return result;

        // Tell the kicked player's tab(s) and take them out of the Socket.IO room
        // BEFORE broadcasting, so they stop getting this room's updates.
        for (const kicked of target ? socketsOfPlayer(live.code, target.playerId) : []) {
          kicked.emit(ServerEvents.KICKED, { code: live.code });
          kicked.leave(live.code);
          kicked.data.roomCode = null;
          kicked.data.playerId = null;
        }
        live.commit(result.room);
        log(live.code, `${target?.nickname} was kicked`);
        return { ok: true };
      }),
    );

    // ---- Match: host ----

    on(socket, ClientEvents.START_MATCH, emptySchema, () =>
      inMyRoom(socket, async (live, playerId) => {
        const error = logic.startMatchError(live.state, playerId);
        if (error) return logic.fail(error);
        // We're inside the room's queue, so nothing else can change the room while we wait.
        const scrambles = await live.takeScrambles(logic.newMatchEvents(live.state), live.state.settings.format);
        const start = { matchId: randomUUID(), scrambles, timing: live.timing };
        const result = logic.startMatch(live.state, playerId, start, Date.now());
        if (result.ok) log(live.code, "match started, set 1 started");
        return commitResult(live, result);
      }),
    );

    /** Rematch after a match, or restart in the middle of one, maybe with another event. */
    on(socket, ClientEvents.REMATCH, restartSchema, (input) =>
      inMyRoom(socket, async (live, playerId) => {
        const error = logic.rematchError(live.state, playerId);
        if (error) return logic.fail(error);
        // Scrambles for the NEW event (if the host picked another one).
        const next = logic.settingsAfterRestart(live.state, input.settings);
        const scrambles = await live.takeScrambles(logic.newMatchEvents(live.state, next), next.format);
        const start = { matchId: randomUUID(), scrambles, timing: live.timing };
        const result = logic.rematch(live.state, playerId, start, Date.now(), input.settings);
        if (result.ok) log(live.code, `new match (${next.cubeEvent}, ${next.format}), set 1 started`);
        return commitResult(live, result);
      }),
    );

    /** Every open room for the home page, private ones too (never their PIN). */
    on(socket, ClientEvents.LIST_ROOMS, emptySchema, () => ({
      ok: true,
      rooms: logic.roomList(rooms.all().filter((live) => !live.deleted).map((live) => live.state)),
    }));

    on(socket, ClientEvents.END_MATCH, emptySchema, () =>
      inMyRoom(socket, (live, playerId) => commitResult(live, logic.endMatch(live.state, playerId))),
    );

    on(socket, ClientEvents.BACK_TO_LOBBY, emptySchema, () =>
      inMyRoom(socket, (live, playerId) => commitResult(live, logic.backToLobby(live.state, playerId))),
    );

    on(socket, ClientEvents.SKIP_PLAYER, targetPlayerSchema, (input) =>
      inMyRoom(socket, (live, playerId) =>
        commitResult(live, logic.skipPlayer(live.state, playerId, input.targetId, Date.now())),
      ),
    );

    // ---- Match: players ----

    on(socket, ClientEvents.SUBMIT_SOLVE, submitSolveSchema, (input) =>
      inMyRoom(socket, (live, playerId) => {
        const before = live.state.version;
        const result = logic.submitSolve(live.state, playerId, input, Date.now());
        const response = commitResult(live, result);
        if (result.ok && result.room.version !== before) {
          const name = logic.findPlayer(result.room, playerId)?.nickname;
          log(live.code, `solve submitted by ${name}: set ${input.setIndex + 1}, solve ${input.solveIndex + 1}`);
        }
        return response;
      }),
    );

    on(socket, ClientEvents.CHANGE_PENALTY, changePenaltySchema, (input) =>
      inMyRoom(socket, (live, playerId) => commitResult(live, logic.changePenalty(live.state, playerId, input))),
    );

    on(socket, ClientEvents.TIMER_STATUS, timerStatusSchema, (input) =>
      inMyRoom(socket, (live, playerId) => {
        live.commit(logic.setTimerStatus(live.state, playerId, input.status, Date.now()));
        return { ok: true };
      }),
    );

    on(socket, ClientEvents.PING, emptySchema, () => ({ ok: true, serverTime: Date.now() }));

    socket.on("disconnect", () => handleDisconnect(socket));
  });

  // Safety net: once a second, every room checks whether something is due.
  // (Each room also has its own precise wake-up timer; this catches anything missed.)
  const sweep = setInterval(() => {
    for (const live of rooms.all()) {
      void live.run(() => live.processDue());
    }
    openWeeklyIfDue(Date.now());
    keepWeeklyResults();
  }, 1000);

  return {
    rooms,
    stop: () => {
      clearInterval(sweep);
      // stop(), not delete(): the saved copies must stay for the next start.
      for (const live of rooms.all()) live.stop();
    },
    /** Saves every room now (on shutdown), after the actions already waiting in its queue. */
    flush: async () => {
      if (!persistence) return;
      await Promise.all(rooms.all().map((live) => live.run(() => persistence.saveNow(live))));
    },
  };

  // -------------------------------------------------------------------------
  // The weekly race
  // -------------------------------------------------------------------------

  function weeklyRoom(weeklyId: string): LiveRoom | undefined {
    return rooms.all().find((live) => !live.deleted && live.state.scheduled?.weeklyId === weeklyId);
  }

  /** 30 minutes before the start, the server opens the weekly race's room (once). */
  function openWeeklyIfDue(now: number): void {
    const race = currentWeeklyRace(now, options.weeklySchedule);
    if (now < race.opensAt || now >= race.startsAt || openedWeekly.has(race.weeklyId) || weeklyRoom(race.weeklyId)) return;
    openedWeekly.add(race.weeklyId);
    const live = openRoom(
      logic.createScheduledRoom(rooms.generateUniqueCode(), WEEKLY_SETTINGS, { weeklyId: race.weeklyId, startsAt: race.startsAt }),
    );
    live.addChat("system", "The weekly race opens: it starts on the minute for everyone here.");
    log(live.code, `weekly race ${race.weeklyId} opened`);
  }

  /** Keeps each weekly race's results once its set is over (for the home page, even without a database). */
  function keepWeeklyResults(): void {
    for (const live of rooms.all()) {
      const weeklyId = live.state.scheduled?.weeklyId;
      const set = live.state.match?.finishedSets[0];
      if (!weeklyId || !set || weeklyResults.has(weeklyId)) continue;
      const names = Object.fromEntries(live.state.players.map((p) => [p.publicId, p.nickname]));
      weeklyResults.set(weeklyId, rankWeekly(set.standings, names));
    }
  }

  async function resultsOf(weeklyId: string): Promise<WeeklyRow[]> {
    return weeklyResults.get(weeklyId) ?? (reader ? await reader.weeklyResults(weeklyId).catch(() => []) : []);
  }

  async function weeklyStatus(): Promise<WeeklyStatus> {
    const now = Date.now();
    const race = currentWeeklyRace(now, options.weeklySchedule);
    const previous = previousWeeklyRace(race);
    const live = weeklyRoom(race.weeklyId);
    const results = await resultsOf(race.weeklyId);
    const match = live?.state.match;
    const phase: WeeklyStatus["phase"] =
      results.length > 0 || (now >= race.startsAt && !live) || match?.phase === "match_over"
        ? "over"
        : match
          ? "racing"
          : live
            ? "open"
            : "upcoming";
    const previousResults = await resultsOf(previous.weeklyId);
    return {
      weeklyId: race.weeklyId,
      startsAt: race.startsAt,
      opensAt: race.opensAt,
      serverTime: now,
      phase,
      roomCode: live && phase !== "over" ? live.code : null,
      results,
      previous: previousResults.length > 0 ? { weeklyId: previous.weeklyId, results: previousResults } : null,
    };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  function openRoom(room: ServerRoom, chat?: RestoredChat): LiveRoom {
    const live: LiveRoom = new LiveRoom(
      room,
      {
        broadcast: (snapshot) => io.to(room.code).emit(ServerEvents.ROOM_STATE, snapshot),
        sendChat: (message) => {
          io.to(room.code).emit(ServerEvents.CHAT, message);
          persistence?.saveSoon(live);
        },
        onCommit: (before, next) => persistence?.changed(live, before, next),
        makeScrambles: options.makeScrambles ?? generateSetScrambles,
        onDelete: (code) => {
          rooms.remove(code);
          persistence?.deleted(code);
        },
        log,
        timing: options.timing,
        broadcastIntervalMs: options.broadcastIntervalMs,
      },
      chat,
    );
    rooms.add(live);
    return live;
  }

  /**
   * Runs an action in this socket's room queue, with the room and the player's
   * secret id. Answers "not in a room" if the socket isn't in one (anymore).
   * (No "NOT_CURRENT" code here: a client that isn't back in its room yet must
   * keep its unsent solves and try again after rejoining.)
   */
  async function inMyRoom(
    socket: IoSocket,
    action: (live: LiveRoom, playerId: string) => AckResponse | Promise<AckResponse>,
  ): Promise<AckResponse> {
    const { roomCode, playerId } = socket.data;
    const live = roomCode ? rooms.get(roomCode) : undefined;
    if (!live || !playerId) return logic.fail(NOT_IN_ROOM_ERROR);

    return live.run(() => {
      // Things may have changed while this action waited in the queue.
      if (live.deleted || socket.data.roomCode !== live.code || socket.data.playerId !== playerId) {
        return logic.fail(NOT_IN_ROOM_ERROR);
      }
      return action(live, playerId);
    });
  }

  function commitResult(live: LiveRoom, result: logic.LogicResult): AckResponse {
    if (!result.ok) return result;
    live.commit(result.room);
    return { ok: true };
  }

  function enterSocketRoom(socket: IoSocket, code: string, playerId: string): void {
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.playerId = playerId;
  }

  /** Removes this socket's player from their current room (if any). */
  async function leaveCurrentRoom(socket: IoSocket): Promise<void> {
    const { roomCode, playerId } = socket.data;
    socket.data.roomCode = null;
    socket.data.playerId = null;
    if (!roomCode || !playerId) return;

    socket.leave(roomCode);
    const live = rooms.get(roomCode);
    if (!live) return;
    await live.run(() => {
      if (live.deleted) return;
      const name = logic.findPlayer(live.state, playerId)?.nickname;
      const updated = logic.leaveRoom(live.state, playerId, Date.now());
      if (updated !== live.state) log(roomCode, `${name} left`);
      live.commit(updated);
    });
  }

  function handleDisconnect(socket: IoSocket): void {
    const { roomCode, playerId } = socket.data;
    const live = roomCode ? rooms.get(roomCode) : undefined;
    if (!live || !playerId) return;

    void live.run(() => {
      if (live.deleted) return;
      // After a refresh, the NEW connection sometimes arrives before the OLD one
      // has closed. If the player still has another connection in this room,
      // they haven't really gone anywhere, so we leave them "connected".
      if (socketsOfPlayer(live.code, playerId).some((s) => s.id !== socket.id)) return;

      const updated = logic.markDisconnected(live.state, playerId, Date.now());
      if (updated !== live.state) {
        log(live.code, `${logic.findPlayer(updated, playerId)?.nickname} disconnected (seat kept for 30 s)`);
      }
      // Keep their seat for 30 seconds. If they don't come back, tickRoom
      // removes them and their missing solves in this set become DNFs.
      live.commit(updated);
    });
  }

  /** All open connections (tabs) of one player inside one room. */
  function socketsOfPlayer(roomCode: string, playerId: string): IoSocket[] {
    const socketIds = io.sockets.adapter.rooms.get(roomCode) ?? new Set<string>();
    const result: IoSocket[] = [];
    for (const id of socketIds) {
      const s = io.sockets.sockets.get(id);
      if (s && s.data.playerId === playerId) {
        result.push(s);
      }
    }
    return result;
  }

  /**
   * Registers a request handler: rate limit -> zod check -> handler -> ack.
   * The client always gets exactly one answer, even if the handler crashes.
   */
  function on<Event extends keyof ClientRequests, Schema extends z.ZodType>(
    socket: IoSocket,
    event: Event,
    schema: Schema,
    handler: (input: z.output<Schema>) => AckResponse | Promise<AckResponse>,
  ): void {
    // `payload` and `ack` are `unknown` on purpose: they come from the outside
    // world and could be anything until we check them.
    (socket as unknown as Socket).on(event as string, async (payload: unknown, ack: unknown) => {
      if (typeof ack !== "function") return; // no callback = nobody to answer

      let response: AckResponse;
      // Smart cube moves have their own, higher limit (see CUBE_MOVES).
      const limited = event !== ClientEvents.CUBE_MOVES && !socket.data.limiter.tryTake();
      if (limited) {
        response = logic.fail("Too many requests. Slow down a little.", "RATE_LIMITED");
      } else {
        const parsed = schema.safeParse(payload ?? {});
        if (!parsed.success) {
          response = logic.fail(describeProblem(parsed.error), "INVALID");
        } else {
          try {
            response = await handler(parsed.data);
          } catch (error) {
            console.error(`Error while handling ${event}:`, error);
            response = logic.fail("Something went wrong on the server.");
          }
        }
      }
      ack(response);
    });
  }
}
