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
  type AckResponse,
  type ClientRequests,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from "@cube-racing/shared";
import {
  changePenaltySchema,
  createRoomSchema,
  describeProblem,
  emptySchema,
  joinRoomSchema,
  submitSolveSchema,
  targetPlayerSchema,
  timerStatusSchema,
  updateSettingsSchema,
} from "@cube-racing/shared/schemas";
import type { MatchTiming } from "./match/types";
import { RateLimiter } from "./rateLimit";
import { LiveRoom } from "./rooms/liveRoom";
import * as logic from "./rooms/roomLogic";
import { RoomStore } from "./rooms/roomStore";
import type { ServerRoom } from "./rooms/types";
import { generateSetScrambles } from "./scrambles";

/** What the server remembers about each connection (browser tab). */
interface SocketData {
  roomCode: string | null;
  playerId: string | null;
  limiter: RateLimiter;
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
}

const NOT_IN_ROOM_ERROR = "You are not in a room.";
const ROOM_NOT_FOUND_ERROR = "Room not found. Check the code, or the room may have closed.";

/** Rate limit per connection: bursts of 30, then 15 requests per second. */
const RATE_LIMIT_BURST = 30;
const RATE_LIMIT_PER_SECOND = 15;

export function registerSocketHandlers(io: IoServer, options: SocketOptions): { rooms: RoomStore; stop: () => void } {
  const rooms = new RoomStore();
  const { log } = options;

  io.on("connection", (socket) => {
    socket.data = {
      roomCode: null,
      playerId: null,
      limiter: new RateLimiter(RATE_LIMIT_BURST, RATE_LIMIT_PER_SECOND),
    };

    // ---- Rooms ----

    on(socket, ClientEvents.CREATE_ROOM, createRoomSchema, async (input) => {
      await leaveCurrentRoom(socket);
      const code = rooms.generateUniqueCode();
      const room = logic.createRoom(code, { ...DEFAULT_SETTINGS, ...input.settings }, input, Date.now());
      const live = openRoom(room);
      log(code, `created by ${input.nickname}`);

      return live.run(() => {
        enterSocketRoom(socket, code, input.playerId);
        return { ok: true, room: live.snapshot(), youId: logic.publicIdFor(input.playerId) };
      });
    });

    /** Used for joining the first time AND for coming back after a refresh or network drop. */
    on(socket, ClientEvents.JOIN_ROOM, joinRoomSchema, async (input) => {
      if (!rooms.get(input.code)) return logic.fail(ROOM_NOT_FOUND_ERROR);

      // One tab can only be in one room at a time, as one player.
      if (socket.data.roomCode !== input.code || socket.data.playerId !== input.playerId) {
        await leaveCurrentRoom(socket);
      }

      const live = rooms.get(input.code);
      if (!live) return logic.fail(ROOM_NOT_FOUND_ERROR);

      return live.run(() => {
        if (live.deleted) return logic.fail(ROOM_NOT_FOUND_ERROR);
        const result = logic.joinRoom(live.state, input, Date.now());
        if (!result.ok) return result;

        const isNewPlayer = !logic.findPlayer(live.state, input.playerId);
        live.commit(result.room);
        enterSocketRoom(socket, input.code, input.playerId);
        if (isNewPlayer) log(input.code, `${input.nickname} joined`);

        // The player gets the full current snapshot right away, in the reply.
        return { ok: true, room: live.snapshot(), youId: logic.publicIdFor(input.playerId) };
      });
    });

    on(socket, ClientEvents.LEAVE_ROOM, emptySchema, async () => {
      await leaveCurrentRoom(socket);
      return { ok: true };
    });

    on(socket, ClientEvents.UPDATE_SETTINGS, updateSettingsSchema, (input) =>
      inMyRoom(socket, (live, playerId) => commitResult(live, logic.updateSettings(live.state, playerId, input.settings))),
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
        const scrambles = await live.takeScrambles(live.state.settings);
        const start = { matchId: randomUUID(), scrambles, timing: live.timing };
        const result = logic.startMatch(live.state, playerId, start, Date.now());
        if (result.ok) log(live.code, "match started, set 1 started");
        return commitResult(live, result);
      }),
    );

    on(socket, ClientEvents.REMATCH, emptySchema, () =>
      inMyRoom(socket, async (live, playerId) => {
        const error = logic.rematchError(live.state, playerId);
        if (error) return logic.fail(error);
        const scrambles = await live.takeScrambles(live.state.settings);
        const start = { matchId: randomUUID(), scrambles, timing: live.timing };
        const result = logic.rematch(live.state, playerId, start, Date.now());
        if (result.ok) log(live.code, "rematch started, set 1 started");
        return commitResult(live, result);
      }),
    );

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
        live.commit(logic.setTimerStatus(live.state, playerId, input.status));
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
  }, 1000);

  return {
    rooms,
    stop: () => {
      clearInterval(sweep);
      for (const live of rooms.all()) live.delete();
    },
  };

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  function openRoom(room: ServerRoom): LiveRoom {
    const live = new LiveRoom(room, {
      broadcast: (snapshot) => io.to(room.code).emit(ServerEvents.ROOM_STATE, snapshot),
      makeScrambles: options.makeScrambles ?? generateSetScrambles,
      onDelete: (code) => rooms.remove(code),
      log,
      timing: options.timing,
      broadcastIntervalMs: options.broadcastIntervalMs,
    });
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
      if (!socket.data.limiter.tryTake()) {
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
