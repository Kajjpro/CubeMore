import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, RECONNECT_GRACE_MS, type Scramble } from "@cube-racing/shared";
import type { MatchTiming } from "../match/types";
import { createRoom, joinRoom, publicIdFor, rematch, startMatch, submitSolve, tickRoom, type LogicResult } from "../rooms/roomLogic";
import type { ServerRoom } from "../rooms/types";
import { historyEvents } from "./history";
import { RESTORE_VERSION_JUMP, restoreRoom } from "./restore";

const timing: MatchTiming = { solveReviewMs: 0, setResultMs: 6_000, submitGraceMs: 6_000 };
const alice = { playerId: "alice-id", nickname: "Alice" };
const bob = { playerId: "bob-id", nickname: "Bob" };
const T0 = 1_000_000;

function ok(result: LogicResult): ServerRoom {
  if (!result.ok) throw new Error(result.error);
  return result.room;
}

const scrambles = (n: number): Scramble[] => Array.from({ length: n }, (_, i) => ({ cubeEvent: "333", text: `R U F${i}` }));

/** Alice and Bob in a bo1 single room, the match just started. */
function started(): { lobby: ServerRoom; room: ServerRoom } {
  let lobby = createRoom("ABC234", { ...DEFAULT_SETTINGS, name: "Test", format: "single", winCondition: "bo1" }, alice, T0);
  lobby = ok(joinRoom(lobby, bob, T0));
  const room = ok(startMatch(lobby, alice.playerId, { matchId: "m1", scrambles: scrambles(1), timing }, T0));
  return { lobby, room };
}

function solve(room: ServerRoom, playerId: string, timeMs: number, now: number): ServerRoom {
  const m = room.match!;
  return ok(submitSolve(room, playerId, { matchId: m.matchId, setIndex: m.setIndex, solveIndex: m.solveIndex, timeMs, penalty: "OK" }, now));
}

describe("history events", () => {
  it("a new match: match_started and set_started with everyone's nickname", () => {
    const { lobby, room } = started();
    const events = historyEvents(lobby, room, T0);
    expect(events.map((e) => e.kind)).toEqual(["match_started", "set_started"]);
    expect(events[1]).toMatchObject({
      setIndex: 0,
      players: [
        { publicId: publicIdFor(alice.playerId), nickname: "Alice" },
        { publicId: publicIdFor(bob.playerId), nickname: "Bob" },
      ],
    });
  });

  it("nothing while a set is played", () => {
    const { room } = started();
    expect(historyEvents(room, solve(room, alice.playerId, 9_120, T0 + 9_000), T0)).toEqual([]);
  });

  it("the last solve: set_finished with every solve and its scramble; then match_ended", () => {
    const { room } = started();
    const one = solve(room, alice.playerId, 9_120, T0 + 9_000);
    const done = solve(one, bob.playerId, 11_000, T0 + 11_000);

    const events = historyEvents(one, done, T0 + 11_000);
    expect(events.map((e) => e.kind)).toEqual(["set_finished"]);
    expect(events[0]).toMatchObject({
      cubeEvent: "333",
      scrambles: ["R U F0"],
      set: { setIndex: 0, winnerIds: [publicIdFor(alice.playerId)] },
    });

    const over = tickRoom(done, T0 + 11_000 + timing.setResultMs);
    const end = historyEvents(done, over, T0 + 20_000);
    expect(end).toEqual([
      {
        kind: "match_ended",
        matchId: "m1",
        status: "finished",
        winnerIds: [publicIdFor(alice.playerId)],
        points: { [publicIdFor(alice.playerId)]: 1, [publicIdFor(bob.playerId)]: 0 },
        at: T0 + 20_000,
      },
    ]);
    // Already over: no second match_ended.
    expect(historyEvents(over, { ...over, version: over.version + 1 }, T0 + 21_000)).toEqual([]);
  });

  it("a restart in the middle: the old match is abandoned, a new one starts", () => {
    const { room } = started();
    const restarted = ok(rematch(room, alice.playerId, { matchId: "m2", scrambles: scrambles(1), timing }, T0 + 1_000));
    const events = historyEvents(room, restarted, T0 + 1_000);
    expect(events.map((e) => [e.kind, e.matchId])).toEqual([
      ["match_ended", "m1"],
      ["match_started", "m2"],
      ["set_started", "m2"],
    ]);
    expect(events[0]).toMatchObject({ status: "abandoned" });
  });
});

describe("restoring a room", () => {
  it("everyone is reconnecting from now, deadlines move by the downtime, the version jumps", () => {
    const { room } = started();
    const withLimit = { ...room, match: { ...room.match!, solveDeadline: T0 + 60_000 } };
    const savedAt = T0 + 5_000;
    const now = savedAt + 20_000;

    const restored = restoreRoom(withLimit, savedAt, now);
    expect(restored.version).toBe(room.version + RESTORE_VERSION_JUMP);
    expect(restored.players.every((p) => p.status === "reconnecting" && p.disconnectedAt === now)).toBe(true);
    expect(restored.match!.solveDeadline).toBe(T0 + 60_000 + 20_000);
    expect(restored.match!.results).toEqual(room.match!.results);

    // Nobody comes back: after 30 seconds they're removed, like any disconnect.
    expect(tickRoom(restored, now + RECONNECT_GRACE_MS).players).toEqual([]);
  });
});
