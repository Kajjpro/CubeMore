import { newDb } from "pg-mem";
import type { Pool } from "pg";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";
import { ClientEvents, ServerEvents, type CubeEventId, type RoomSnapshot, type Scramble } from "@cube-racing/shared";
import { startServer, type RunningServer } from "../server";
import { RESTORE_VERSION_JUMP } from "./restore";
import { PostgresStore } from "./store";

/** A store on pg-mem (an in-memory Postgres), so the SQL is tested too. Also returns the pool to look inside. */
async function postgres(): Promise<{ store: PostgresStore; pool: Pool }> {
  const { Pool: MemPool } = newDb().adapters.createPg();
  const pool = new MemPool() as unknown as Pool;
  return { store: await PostgresStore.open(pool), pool };
}

async function fakeScrambles(cubeEvent: CubeEventId, count: number): Promise<Scramble[]> {
  return Array.from({ length: count }, (_, i) => ({ cubeEvent, text: `R U F${i}` }));
}

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";
const timing = { solveReviewMs: 0, setResultMs: 100, submitGraceMs: 0 };

async function until<T>(check: () => T | Promise<T>, what: string): Promise<NonNullable<T>> {
  for (let i = 0; i < 200; i++) {
    const value = await check();
    if (value) return value as NonNullable<T>;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

const servers: RunningServer[] = [];
const sockets: Socket[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.disconnect();
  for (const server of servers.splice(0)) await server.close().catch(() => {});
});

/** A player's connection that remembers the latest room snapshot. */
function player(server: RunningServer) {
  const socket = connect(`http://localhost:${server.port}`, { transports: ["websocket"], reconnection: false });
  sockets.push(socket);
  const seen: { room: RoomSnapshot | null } = { room: null };
  socket.on(ServerEvents.ROOM_STATE, (room: RoomSnapshot) => (seen.room = room));
  const send = async (event: string, payload: object = {}) => {
    const response = await socket.emitWithAck(event, payload);
    if (!response.ok) throw new Error(response.error);
    if (response.room) seen.room = response.room;
    return response;
  };
  return { socket, seen, send };
}

describe("PostgresStore", () => {
  it("a whole match goes into the history; the room survives a restart", async () => {
    const { store, pool } = await postgres();
    const first = await startServer({ port: 0, timing, logs: false, store, makeScrambles: fakeScrambles });
    servers.push(first);

    // Alice and Bob play a bo1 single.
    const alice = player(first);
    const bob = player(first);
    const { room } = await alice.send(ClientEvents.CREATE_ROOM, {
      playerId: ALICE,
      nickname: "Alice",
      settings: { name: "Saved room", format: "single", winCondition: "bo1" },
    });
    const code: string = room.code;
    await bob.send(ClientEvents.JOIN_ROOM, { playerId: BOB, nickname: "Bob", code });
    await alice.send(ClientEvents.START_MATCH);
    const match = (await until(() => alice.seen.room?.match, "the match")).matchId;
    const solve = { matchId: match, setIndex: 0, solveIndex: 0, penalty: "OK" };
    await alice.send(ClientEvents.SUBMIT_SOLVE, { ...solve, timeMs: 9_123 });
    await bob.send(ClientEvents.SUBMIT_SOLVE, { ...solve, timeMs: 11_000 });
    await alice.send(ClientEvents.SEND_CHAT, { text: "gg" });
    await until(() => alice.seen.room?.match?.phase === "match_over", "the match to end");

    // The history (written in the background).
    const saved = await until(async () => {
      const { rows } = await pool.query("SELECT * FROM matches WHERE match_id = $1 AND status = 'finished'", [match]);
      return rows[0];
    }, "the match in the history");
    expect(saved).toMatchObject({ room_code: code, room_name: "Saved room", cube_event: "333", format: "single" });
    const { rows: solves } = await pool.query("SELECT * FROM solves WHERE match_id = $1 ORDER BY time_ms", [match]);
    expect(solves.map((s) => [s.time_ms, s.scored_ms, s.scramble])).toEqual([
      [9_123, 9_120, "R U F0"],
      [11_000, 11_000, "R U F0"],
    ]);
    const { rows: players } = await pool.query("SELECT nickname, points FROM match_players WHERE match_id = $1 ORDER BY nickname", [match]);
    expect(players).toEqual([
      { nickname: "Alice", points: 1 },
      { nickname: "Bob", points: 0 },
    ]);

    // Restart: everything is saved on the way down...
    const versionBefore = alice.seen.room!.version;
    await first.close();
    const restored = await store.loadRooms();
    expect(restored.map((r) => r.room.code)).toEqual([code]);

    // ...and the room is back, with its match and chat, waiting for its players.
    const second = await startServer({ port: 0, timing, logs: false, store, restoredRooms: restored, makeScrambles: fakeScrambles });
    servers.push(second);
    const back = player(second);
    const rejoined = await back.send(ClientEvents.JOIN_ROOM, { playerId: ALICE, nickname: "Alice", code });
    expect(rejoined.room.version).toBeGreaterThan(versionBefore + RESTORE_VERSION_JUMP - 1);
    expect(rejoined.room.match.matchId).toBe(match);
    expect(rejoined.room.match.phase).toBe("match_over");
    expect(rejoined.room.players.map((p: { nickname: string; status: string }) => [p.nickname, p.status])).toEqual([
      ["Alice", "connected"],
      ["Bob", "reconnecting"],
    ]);
    expect(rejoined.chat.map((m: { text: string }) => m.text)).toContain("gg");
  });

  it("a closed room's saved copy is removed", async () => {
    const { store } = await postgres();
    const server = await startServer({ port: 0, timing, logs: false, store, makeScrambles: fakeScrambles });
    servers.push(server);
    const alice = player(server);
    const { room } = await alice.send(ClientEvents.CREATE_ROOM, { playerId: ALICE, nickname: "Alice" });
    await until(async () => (await store.loadRooms()).length === 1, "the room to be saved");

    server.rooms.get(room.code)!.delete();
    await until(async () => (await store.loadRooms()).length === 0, "the room to be removed");
  });
});
