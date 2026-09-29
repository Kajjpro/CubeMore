import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  RECONNECT_GRACE_MS,
  type CubeEventId,
  type RoomSettings,
  type RoomSnapshot,
  type Scramble,
} from "@cube-racing/shared";
import type { MatchTiming } from "../match/types";
import { LiveRoom } from "./liveRoom";
import { createRoom, joinRoom, markDisconnected, startMatch, submitSolve, type LogicResult } from "./roomLogic";
import type { ServerRoom } from "./types";

const timing: MatchTiming = { solveReviewMs: 3_000, setResultMs: 6_000, submitGraceMs: 6_000 };
const alice = { playerId: "alice-id", nickname: "Alice" };
const bob = { playerId: "bob-id", nickname: "Bob" };

let scrambleCounter = 0;
async function fakeScrambles(cubeEvent: CubeEventId, count: number): Promise<Scramble[]> {
  return Array.from({ length: count }, () => ({ cubeEvent, text: `R U F${scrambleCounter++}` }));
}

function ok(result: LogicResult): ServerRoom {
  if (!result.ok) throw new Error(result.error);
  return result.room;
}

function setup(options: { settings?: Partial<RoomSettings>; makeScrambles?: typeof fakeScrambles } = {}) {
  const broadcasts: RoomSnapshot[] = [];
  const deleted: string[] = [];
  const makeScrambles = vi.fn(options.makeScrambles ?? fakeScrambles);
  const room = createRoom("ABC234", { ...DEFAULT_SETTINGS, ...options.settings }, alice, Date.now());
  const live = new LiveRoom(room, {
    broadcast: (snapshot) => broadcasts.push(snapshot),
    makeScrambles,
    onDelete: (code) => deleted.push(code),
    log: () => {},
    timing,
    broadcastIntervalMs: 50,
  });
  return { live, broadcasts, deleted, makeScrambles };
}

/** Starts a match the same way the socket handler does. */
function start(live: LiveRoom): Promise<void> {
  return live.run(async () => {
    const scrambles = await live.takeScrambles(live.state.settings);
    live.commit(ok(startMatch(live.state, alice.playerId, { matchId: "m1", scrambles, timing }, Date.now())));
  });
}

function submit(live: LiveRoom, playerId: string, timeMs: number): Promise<void> {
  return live.run(() => {
    const m = live.state.match!;
    const solve = { matchId: m.matchId, setIndex: m.setIndex, solveIndex: m.solveIndex, timeMs, penalty: "OK" as const };
    live.commit(ok(submitSolve(live.state, playerId, solve, Date.now())));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the room queue", () => {
  it("runs actions one at a time, even when one of them waits", async () => {
    const { live } = setup();
    const order: string[] = [];
    let release!: () => void;
    const slow = new Promise<void>((resolve) => (release = resolve));

    const first = live.run(async () => {
      order.push("first starts");
      await slow;
      order.push("first ends");
    });
    const second = live.run(() => {
      order.push("second");
    });

    await vi.advanceTimersByTimeAsync(100);
    expect(order).toEqual(["first starts"]); // second is waiting its turn
    release();
    await Promise.all([first, second]);
    expect(order).toEqual(["first starts", "first ends", "second"]);
  });

  it("keeps going after an action fails", async () => {
    const { live } = setup();
    await expect(live.run(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await expect(live.run(() => "still works")).resolves.toBe("still works");
  });

  it("refuses to save a state built from an outdated copy of the room", async () => {
    const { live } = setup();
    const old = live.state;
    await live.run(() => live.commit(ok(joinRoom(live.state, bob, Date.now()))));
    const alsoFromOld = ok(joinRoom(old, { playerId: "carol-id", nickname: "Carol" }, Date.now()));
    expect(() => live.commit(alsoFromOld)).toThrow(/outdated/);
  });
});

describe("broadcasting", () => {
  it("sends at most one snapshot per 50 ms, always the latest", async () => {
    const { live, broadcasts } = setup({ settings: { maxPlayers: 100 } });
    await vi.advanceTimersByTimeAsync(100);
    broadcasts.length = 0;

    // 50 players join in the same instant.
    await live.run(() => {
      for (let i = 0; i < 50; i++) {
        const id = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
        live.commit(ok(joinRoom(live.state, { playerId: id, nickname: `P${i}` }, Date.now())));
      }
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(broadcasts).toHaveLength(1);
    expect(broadcasts[0].players).toHaveLength(51);
    expect(broadcasts[0].version).toBe(live.state.version);

    // Another change right after: it waits until 50 ms after the last broadcast.
    await live.run(() => live.commit(ok(joinRoom(live.state, bob, Date.now()))));
    await vi.advanceTimersByTimeAsync(49);
    expect(broadcasts).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(broadcasts).toHaveLength(2);
  });

  it("includes the server time, so clients can show correct countdowns", async () => {
    const { broadcasts } = setup();
    await vi.advanceTimersByTimeAsync(10);
    expect(broadcasts[0].serverTime).toBe(Date.now() - 10);
  });
});

describe("timers", () => {
  it("moves from the review to the next solve exactly when it's due", async () => {
    const { live } = setup({ settings: { format: "ao5" } });
    await start(live);
    await submit(live, alice.playerId, 10_000);
    expect(live.state.match?.phase).toBe("solve_review");

    await vi.advanceTimersByTimeAsync(timing.solveReviewMs - 1);
    expect(live.state.match?.phase).toBe("solve_review");
    await vi.advanceTimersByTimeAsync(1);
    expect(live.state.match).toMatchObject({ phase: "solving", solveIndex: 1 });
  });

  it("a leftover or extra wake-up never skips a solve", async () => {
    const { live } = setup({ settings: { format: "ao5" } });
    await start(live);
    await submit(live, alice.playerId, 10_000);
    await vi.advanceTimersByTimeAsync(timing.solveReviewMs); // now solving solve 2

    // Lots of extra "check now" calls at random moments: nothing is due, so nothing changes.
    const version = live.state.version;
    for (let i = 0; i < 20; i++) {
      await live.run(() => live.processDue());
      await vi.advanceTimersByTimeAsync(500);
    }
    expect(live.state.version).toBe(version);
    expect(live.state.match).toMatchObject({ phase: "solving", solveIndex: 1 });
    expect(live.state.match?.results[live.state.hostId!][1]).toBeNull();
  });

  it("a player who doesn't come back within 30 s is removed and stops blocking", async () => {
    const { live } = setup({ settings: { format: "ao5" } });
    await live.run(() => live.commit(ok(joinRoom(live.state, bob, Date.now()))));
    await start(live);
    await submit(live, alice.playerId, 10_000);
    await live.run(() => live.commit(markDisconnected(live.state, bob.playerId, Date.now())));

    await vi.advanceTimersByTimeAsync(RECONNECT_GRACE_MS - 1);
    expect(live.state.players).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(live.state.players).toHaveLength(1);
    expect(live.state.match?.phase).toBe("solve_review");
  });

  it("stops every timer when the room is deleted", async () => {
    const { live, broadcasts, deleted } = setup({ settings: { format: "ao5" } });
    await start(live);
    await submit(live, alice.playerId, 10_000);
    await vi.advanceTimersByTimeAsync(100);
    const version = live.state.version;
    const sent = broadcasts.length;

    live.delete();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(deleted).toEqual(["ABC234"]);
    expect(live.state.version).toBe(version);
    expect(broadcasts).toHaveLength(sent);
  });
});

describe("scrambles", () => {
  it("prepares the next set's scrambles in the background during a set", async () => {
    const { live, makeScrambles } = setup({ settings: { format: "single", winCondition: "bo3" } });
    expect(makeScrambles).toHaveBeenCalledTimes(1); // for the first set, while in the lobby
    await start(live);
    expect(makeScrambles).toHaveBeenCalledTimes(2); // the next set's batch, already on its way

    await submit(live, alice.playerId, 10_000);
    await vi.advanceTimersByTimeAsync(timing.solveReviewMs + timing.setResultMs);
    // Set 2 started with the prepared batch, and set 3's batch is being made.
    expect(live.state.match).toMatchObject({ phase: "solving", setIndex: 1 });
    expect(makeScrambles).toHaveBeenCalledTimes(3);
  });

  it("never starts solving without scrambles: it waits on the set result and retries", async () => {
    // Call 1 (first set, made in the lobby) works. Calls 2-4 fail: the background
    // batch for set 2, the fresh try when set 2 is due, and the next background batch.
    let calls = 0;
    const flaky = async (cubeEvent: CubeEventId, count: number) => {
      calls++;
      if (calls >= 2 && calls <= 4) throw new Error("scrambler crashed");
      return fakeScrambles(cubeEvent, count);
    };
    const { live } = setup({ settings: { format: "single", winCondition: "bo3" }, makeScrambles: flaky });
    await start(live);
    await submit(live, alice.playerId, 10_000);
    await vi.advanceTimersByTimeAsync(timing.solveReviewMs + timing.setResultMs);

    // The background batch and one fresh try failed: still on the set result.
    expect(live.state.match?.phase).toBe("set_result");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(live.state.match).toMatchObject({ phase: "solving", setIndex: 1 });
    expect(live.state.match?.scrambles).toHaveLength(1);
  });
});
