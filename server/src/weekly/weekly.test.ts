import { newDb } from "pg-mem";
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { EMPTY_ROOM_TTL_MS, RECONNECT_GRACE_MS, type Scramble } from "@cube-racing/shared";
import { invertMoves, parseMoves } from "@cube-racing/shared/cube3";
import type { MatchTiming } from "../match/types";
import { historyEvents } from "../persistence/history";
import { PostgresStore } from "../persistence/store";
import {
  autoStart,
  createScheduledRoom,
  joinRoom,
  leaveRoom,
  publicIdFor,
  shouldDeleteRoom,
  submitSolve,
  tickRoom,
  type LogicResult,
} from "../rooms/roomLogic";
import type { ServerRoom } from "../rooms/types";
import { rankWeekly } from "./results";
import { currentWeeklyRace, previousWeeklyRace, WEEKLY_SETTINGS } from "./schedule";

const SATURDAY_NOON = { day: 6, hourUtc: 12 };
const at = (iso: string) => Date.parse(iso);

describe("the weekly schedule", () => {
  it("before the race: this Saturday's; right after: still this one (results); a day later: next week's", () => {
    // 2026-10-10 is a Saturday.
    expect(currentWeeklyRace(at("2026-10-07T09:00:00Z"), SATURDAY_NOON)).toEqual({
      weeklyId: "2026-10-10",
      startsAt: at("2026-10-10T12:00:00Z"),
      opensAt: at("2026-10-10T11:30:00Z"),
    });
    expect(currentWeeklyRace(at("2026-10-10T15:00:00Z"), SATURDAY_NOON).weeklyId).toBe("2026-10-10");
    expect(currentWeeklyRace(at("2026-10-11T12:30:00Z"), SATURDAY_NOON).weeklyId).toBe("2026-10-17");
    expect(previousWeeklyRace(currentWeeklyRace(at("2026-10-07T09:00:00Z"), SATURDAY_NOON)).weeklyId).toBe("2026-10-03");
  });
});

describe("the weekly race's room", () => {
  const startsAt = 1_000_000;
  const timing: MatchTiming = { solveReviewMs: 0, setResultMs: 6_000, submitGraceMs: 6_000 };
  const ok = (r: LogicResult): ServerRoom => {
    if (!r.ok) throw new Error(r.error);
    return r.room;
  };
  const room = () => createScheduledRoom("WEEKLY", WEEKLY_SETTINGS, { weeklyId: "2026-10-10", startsAt });
  const alice = { playerId: "alice-id", nickname: "Alice" };
  const bob = { playerId: "bob-id", nickname: "Bob" };
  const scrambles: Scramble[] = Array.from({ length: 5 }, () => ({ cubeEvent: "333", text: "R U F" }));
  const start = { matchId: "w1", scrambles: { "333": scrambles }, timing };

  it("waits, empty and without a host, until its start time", () => {
    const empty = room();
    expect(empty).toMatchObject({ hostId: null, autoStartAt: startsAt, emptySince: null });
    expect(shouldDeleteRoom(empty, startsAt - 1)).toBe(false);

    const joined = ok(joinRoom(ok(joinRoom(empty, alice, 10)), bob, 20));
    expect(joined).toMatchObject({ hostId: null, autoStartAt: startsAt }); // no 3-second countdown

    const left = leaveRoom(leaveRoom(joined, alice.playerId, 30), bob.playerId, 40);
    expect(left).toMatchObject({ emptySince: null, autoStartAt: startsAt });
    expect(shouldDeleteRoom(tickRoom(left, startsAt - 1), startsAt - 1)).toBe(false);
  });

  it("starts on time for whoever is there, even one player", () => {
    const one = ok(joinRoom(room(), alice, 10));
    expect(ok(autoStart(one, start, startsAt - 1)).match).toBeNull();
    expect(ok(autoStart(one, start, startsAt)).match).toMatchObject({ matchId: "w1", roster: [publicIdFor(alice.playerId)] });
  });

  it("nobody came: it doesn't start, and closes like an empty room", () => {
    const nobody = ok(autoStart(room(), start, startsAt));
    expect(nobody).toMatchObject({ match: null, autoStartAt: null, emptySince: startsAt });
    expect(shouldDeleteRoom(nobody, startsAt + EMPTY_ROOM_TTL_MS)).toBe(true);
  });

  it("only takes verified smart cube solves, and its match is marked as the weekly race in the history", () => {
    const racing = ok(autoStart(ok(joinRoom(room(), alice, 10)), start, startsAt));
    const plain = submitSolve(racing, alice.playerId, { matchId: "w1", setIndex: 0, solveIndex: 0, timeMs: 9_000, penalty: "OK" }, startsAt + 9_000);
    expect(plain).toMatchObject({ ok: false });
    const lobby = ok(joinRoom(room(), alice, 10));
    expect(historyEvents(lobby, racing, startsAt)[0]).toMatchObject({ kind: "match_started", weeklyId: "2026-10-10" });
    // A disconnected player is removed after 30 s like anywhere else.
    expect(tickRoom({ ...racing, players: racing.players.map((p) => ({ ...p, status: "reconnecting", disconnectedAt: 0 })) }, RECONNECT_GRACE_MS).players).toEqual([]);
  });

  it("ranks by average, then best single; ties share a rank", () => {
    const rows = rankWeekly(
      { a: { result: 9_000, best: 8_000 }, b: { result: "DNF", best: 7_000 }, c: { result: 9_000, best: 8_000 }, d: { result: 8_500, best: 8_100 } },
      { a: "Anu", b: "Bat", c: "Cece", d: "Dulam" },
    );
    expect(rows.map((r) => [r.rank, r.name])).toEqual([[1, "Dulam"], [2, "Anu"], [2, "Cece"], [4, "Bat"]]);
  });
});

describe("reading the history", () => {
  const SCRAMBLE = "D2 F' U2 L2 F' R2 B U2 F2 U2 L' D' R B' U L' F2 D' F' R'";
  const SOLUTION = [...Array(6).fill(parseMoves("R U R' U'")).flat(), ...invertMoves(parseMoves(SCRAMBLE))];
  const times = SOLUTION.map((_, i) => i * 200);

  async function store(): Promise<PostgresStore> {
    const { Pool: MemPool } = newDb().adapters.createPg();
    return PostgresStore.open(new MemPool() as unknown as Pool);
  }

  /** One finished set of `players` with these single times; the verified ones keep their moves. */
  async function playSet(s: PostgresStore, matchId: string, players: [string, string, number, boolean][], weeklyId: string | null) {
    await s.record({ kind: "match_started", matchId, roomCode: "ROOM01", settings: WEEKLY_SETTINGS, weeklyId, at: 1 });
    await s.record({ kind: "set_started", matchId, setIndex: 0, players: players.map(([id, name]) => ({ publicId: id, nickname: name })) });
    const results: Record<string, { timeMs: number; penalty: "OK"; source: "submitted"; verified?: { moves: number; tps: number } }[]> = {};
    const standings: Record<string, { result: number; best: number }> = {};
    const replays: Record<string, { moves: string[]; times: number[] }> = {};
    for (const [id, , timeMs, verified] of players) {
      results[id] = [{ timeMs, penalty: "OK", source: "submitted", ...(verified ? { verified: { moves: SOLUTION.length, tps: 4.6 } } : {}) }];
      standings[id] = { result: timeMs, best: timeMs };
      if (verified) replays[`${id}/0`] = { moves: SOLUTION, times };
    }
    await s.record({
      kind: "set_finished",
      matchId,
      events: Object.fromEntries(players.map((p) => [p[0], "333" as const])),
      set: { setIndex: 0, roster: players.map((p) => p[0]), results, standings, winnerIds: [], paces: null },
      scrambles: { "333": [SCRAMBLE] },
      replays,
      at: 2,
    });
  }

  it("the leaderboard has only verified solves, each player once with their best", async () => {
    const s = await store();
    await playSet(s, "m1", [["p1", "Anu", 9_000, true], ["p2", "Bat", 7_000, false], ["p3", "Cece", 8_000, true]], null);
    await playSet(s, "m2", [["p1", "Anu", 8_500, true]], null);
    const rows = await s.leaderboard("333", 0, 20);
    expect(rows.map((r) => [r.rank, r.name, r.timeMs, r.moves])).toEqual([
      [1, "Cece", 8_000, 44],
      [2, "Anu", 8_500, 44],
    ]);

    const replay = await s.replay(rows[0].replayId);
    expect(replay).toMatchObject({ name: "Cece", scramble: SCRAMBLE, moves: SOLUTION, timeMs: 8_000, penalty: "OK" });
    expect(await s.replay("m1/0/0/p2")).toBeNull(); // not verified: no replay
  });

  it("a weekly race's results come back ranked", async () => {
    const s = await store();
    await playSet(s, "w1", [["p1", "Anu", 9_000, true], ["p3", "Cece", 8_000, true]], "2026-10-10");
    expect((await s.weeklyResults("2026-10-10")).map((r) => [r.rank, r.name])).toEqual([[1, "Cece"], [2, "Anu"]]);
    expect(await s.weeklyResults("2026-10-03")).toEqual([]);
  });
});
