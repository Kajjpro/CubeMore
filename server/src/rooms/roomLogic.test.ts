import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  EMPTY_ROOM_TTL_MS,
  RECONNECT_GRACE_MS,
  type CubeEventId,
  type Scramble,
} from "@cube-racing/shared";
import {
  createRoom,
  joinRoom,
  kickPlayer,
  leaveRoom,
  markDisconnected,
  publicIdFor,
  removeExpiredPlayers,
  shouldDeleteRoom,
  startMatch,
  submitSolve,
  tickRoom,
  toSnapshot,
  updateSettings,
  type LogicResult,
  type MatchStartInfo,
} from "./roomLogic";
import type { ServerRoom } from "./types";

// Fake players. Real playerIds are UUIDs, but any string works for the logic.
const alice = { playerId: "alice-id", nickname: "Alice" };
const bob = { playerId: "bob-id", nickname: "Bob" };
const carol = { playerId: "carol-id", nickname: "Carol" };

const START = 1_000_000; // a made-up "now" so the tests don't depend on the real clock

/** Unwraps a successful result, or fails the test with the error. */
function ok(result: LogicResult): ServerRoom {
  if (!result.ok) throw new Error(`Expected ok, got error: ${result.error}`);
  return result.room;
}

/** A room where Alice is host, then Bob joins, then Carol joins (one second apart). */
function roomWithThreePlayers(): ServerRoom {
  let room = createRoom("ABC234", DEFAULT_SETTINGS, alice, START);
  room = ok(joinRoom(room, bob, START + 1000));
  room = ok(joinRoom(room, carol, START + 2000));
  return room;
}

/** What the server hands to startMatch: an id, one scramble per solve, and timings. */
function matchStart(cubeEvent: CubeEventId = "333", count = 5): MatchStartInfo {
  const scrambles: Scramble[] = Array.from({ length: count }, (_, i) => ({ cubeEvent, text: `R U R' U${i}` }));
  return { matchId: "m1", scrambles, timing: { solveReviewMs: 3000, setResultMs: 6000, submitGraceMs: 6000 } };
}

/** Submits a time for the current solve. */
function submit(room: ServerRoom, playerId: string, timeMs: number, now: number): ServerRoom {
  const match = room.match!;
  return ok(
    submitSolve(room, playerId, { matchId: match.matchId, setIndex: match.setIndex, solveIndex: match.solveIndex, timeMs, penalty: "OK" }, now),
  );
}

function nicknames(room: ServerRoom): string[] {
  return room.players.map((p) => p.nickname);
}

describe("create and join", () => {
  it("makes the creator the host", () => {
    const room = createRoom("ABC234", DEFAULT_SETTINGS, alice, START);
    expect(room.hostId).toBe(publicIdFor(alice.playerId));
    expect(room.match).toBeNull(); // null match = the room is in the lobby
    expect(room.version).toBe(1);
  });

  it("adds a new player and increases the version", () => {
    const room = createRoom("ABC234", DEFAULT_SETTINGS, alice, START);
    const after = ok(joinRoom(room, bob, START + 1000));
    expect(nicknames(after)).toEqual(["Alice", "Bob"]);
    expect(after.version).toBe(room.version + 1);
    expect(after.hostId).toBe(room.hostId); // Bob is not the host
  });

  it("does not change the original room (pure function)", () => {
    const room = createRoom("ABC234", DEFAULT_SETTINGS, alice, START);
    joinRoom(room, bob, START + 1000);
    expect(nicknames(room)).toEqual(["Alice"]);
  });

  it("does nothing if an already-connected player joins again", () => {
    const room = roomWithThreePlayers();
    const after = ok(joinRoom(room, bob, START + 5000));
    expect(after).toBe(room); // same object, same version = nothing to broadcast
  });

  it("refuses to join when the room is full", () => {
    let room = createRoom("ABC234", { ...DEFAULT_SETTINGS, maxPlayers: 2 }, alice, START);
    room = ok(joinRoom(room, bob, START + 1000));
    const result = joinRoom(room, carol, START + 2000);
    expect(result).toEqual({ ok: false, error: "This room is full." });
  });

  it("still lets a player in a full room reconnect", () => {
    let room = createRoom("ABC234", { ...DEFAULT_SETTINGS, maxPlayers: 2 }, alice, START);
    room = ok(joinRoom(room, bob, START + 1000));
    room = markDisconnected(room, bob.playerId, START + 2000);
    expect(joinRoom(room, bob, START + 3000).ok).toBe(true);
  });
});

describe("leave", () => {
  it("removes the player", () => {
    const room = leaveRoom(roomWithThreePlayers(), bob.playerId, START + 5000);
    expect(nicknames(room)).toEqual(["Alice", "Carol"]);
  });

  it("marks the room as empty when the last player leaves", () => {
    const room = createRoom("ABC234", DEFAULT_SETTINGS, alice, START);
    const empty = leaveRoom(room, alice.playerId, START + 5000);
    expect(empty.players).toEqual([]);
    expect(empty.hostId).toBeNull();
    expect(empty.emptySince).toBe(START + 5000);
  });
});

describe("reconnect", () => {
  it("keeps the seat and restores the player within 30 seconds", () => {
    let room = roomWithThreePlayers();
    room = markDisconnected(room, alice.playerId, START + 10_000);
    expect(room.players[0].status).toBe("reconnecting");

    // 29 seconds later: the cleanup loop runs, but Alice's seat is still kept.
    room = removeExpiredPlayers(room, START + 10_000 + RECONNECT_GRACE_MS - 1000);
    expect(nicknames(room)).toEqual(["Alice", "Bob", "Carol"]);

    // Alice comes back with the same playerId.
    room = ok(joinRoom(room, alice, START + 10_000 + RECONNECT_GRACE_MS - 500));
    expect(room.players[0]).toMatchObject({ nickname: "Alice", status: "connected", joinedAt: START });
    expect(room.hostId).toBe(publicIdFor(alice.playerId)); // still the host
  });

  it("removes the player after 30 seconds, so they come back as a new player", () => {
    let room = roomWithThreePlayers();
    room = markDisconnected(room, bob.playerId, START + 10_000);
    room = removeExpiredPlayers(room, START + 10_000 + RECONNECT_GRACE_MS);
    expect(nicknames(room)).toEqual(["Alice", "Carol"]);

    // Bob comes back too late: he joins again at the END of the list.
    room = ok(joinRoom(room, bob, START + 50_000));
    expect(nicknames(room)).toEqual(["Alice", "Carol", "Bob"]);
    expect(room.players[2].joinedAt).toBe(START + 50_000);
  });
});

describe("host transfer", () => {
  it("gives host to the longest-present player when the host leaves", () => {
    const room = leaveRoom(roomWithThreePlayers(), alice.playerId, START + 5000);
    expect(room.hostId).toBe(publicIdFor(bob.playerId));
  });

  it("gives host away when the host's 30 seconds run out", () => {
    let room = roomWithThreePlayers();
    room = markDisconnected(room, alice.playerId, START + 5000);
    expect(room.hostId).toBe(publicIdFor(alice.playerId)); // still host while reconnecting
    room = removeExpiredPlayers(room, START + 5000 + RECONNECT_GRACE_MS);
    expect(room.hostId).toBe(publicIdFor(bob.playerId));
  });

  it("prefers a connected player over a reconnecting one", () => {
    let room = roomWithThreePlayers();
    room = markDisconnected(room, bob.playerId, START + 5000);
    room = leaveRoom(room, alice.playerId, START + 6000);
    expect(room.hostId).toBe(publicIdFor(carol.playerId));
  });
});

describe("kick", () => {
  it("lets the host kick a player, who then can't rejoin", () => {
    const room = roomWithThreePlayers();
    const after = ok(kickPlayer(room, alice.playerId, publicIdFor(bob.playerId), START + 5000));
    expect(nicknames(after)).toEqual(["Alice", "Carol"]);
    expect(after.version).toBeGreaterThan(room.version);

    const rejoin = joinRoom(after, bob, START + 6000);
    expect(rejoin.ok).toBe(false);
  });

  it("does not let a non-host kick", () => {
    const room = roomWithThreePlayers();
    const result = kickPlayer(room, bob.playerId, publicIdFor(carol.playerId), START + 5000);
    expect(result).toEqual({ ok: false, error: "Only the host can kick players." });
  });

  it("does not let the host kick themselves", () => {
    const room = roomWithThreePlayers();
    const result = kickPlayer(room, alice.playerId, publicIdFor(alice.playerId), START + 5000);
    expect(result.ok).toBe(false);
  });
});

describe("settings and start", () => {
  it("lets only the host change settings", () => {
    const room = roomWithThreePlayers();
    expect(updateSettings(room, bob.playerId, { format: "ao12" }).ok).toBe(false);
    const after = ok(updateSettings(room, alice.playerId, { format: "ao12" }));
    expect(after.settings.format).toBe("ao12");
    expect(after.version).toBe(room.version + 1);
  });

  it("refuses a max players value lower than the current player count", () => {
    const room = roomWithThreePlayers();
    expect(updateSettings(room, alice.playerId, { maxPlayers: 2 }).ok).toBe(false);
  });

  it("moves the room from lobby into a match with the first scramble, host only, once", () => {
    const room = roomWithThreePlayers();
    const start = matchStart();
    expect(startMatch(room, bob.playerId, start, START).ok).toBe(false);

    const started = ok(startMatch(room, alice.playerId, start, START));
    expect(started.match).toMatchObject({ phase: "solving", setIndex: 0, solveIndex: 0 });
    expect(toSnapshot(started, START).match?.scramble).toEqual(start.scrambles[0]);

    expect(startMatch(started, alice.playerId, start, START).ok).toBe(false);
    expect(updateSettings(started, alice.playerId, { format: "single" }).ok).toBe(false);
  });

  it("refuses scrambles made for a different event", () => {
    // e.g. the host switched to Pyraminx while 3x3x3 scrambles were being made
    const room = ok(updateSettings(roomWithThreePlayers(), alice.playerId, { cubeEvent: "pyram" }));
    const result = startMatch(room, alice.playerId, matchStart("333"), START);
    expect(result.ok).toBe(false);
  });
});

describe("rooms during a match", () => {
  it("never sends future scrambles, only the current one", () => {
    const start = matchStart();
    const room = ok(startMatch(roomWithThreePlayers(), alice.playerId, start, START));
    const snapshot = JSON.stringify(toSnapshot(room, START));
    expect(snapshot).toContain(start.scrambles[0].text);
    for (const future of start.scrambles.slice(1)) {
      expect(snapshot).not.toContain(future.text);
    }
  });

  it("shows a player who joins mid-set as a spectator", () => {
    let room = createRoom("ABC234", DEFAULT_SETTINGS, alice, START);
    room = ok(startMatch(room, alice.playerId, matchStart(), START));
    room = ok(joinRoom(room, bob, START + 1000));
    const players = toSnapshot(room, START + 1000).players;
    expect(players.map((p) => p.spectator)).toEqual([false, true]);
  });

  it("a player who drops out for good doesn't block the others", () => {
    let room = ok(startMatch(roomWithThreePlayers(), alice.playerId, matchStart(), START));
    room = submit(room, alice.playerId, 10_000, START + 1000);
    room = markDisconnected(room, bob.playerId, START + 2000);
    room = submit(room, carol.playerId, 12_000, START + 3000);
    expect(room.match?.phase).toBe("solving"); // Bob still has his 30 seconds

    room = tickRoom(room, START + 2000 + RECONNECT_GRACE_MS);
    expect(nicknames(room)).toEqual(["Alice", "Carol"]);
    expect(room.match?.phase).toBe("solve_review");
    expect(room.match?.results[publicIdFor(bob.playerId)][0]).toMatchObject({ penalty: "DNF", source: "removed" });
  });

  it("a player who reconnects in time keeps their place in the set", () => {
    let room = ok(startMatch(roomWithThreePlayers(), alice.playerId, matchStart(), START));
    room = markDisconnected(room, bob.playerId, START + 1000);
    room = ok(joinRoom(room, bob, START + 20_000));
    room = submit(room, bob.playerId, 11_000, START + 21_000);
    expect(room.match?.results[publicIdFor(bob.playerId)][0]).toMatchObject({ timeMs: 11_000 });
  });
});

describe("empty room cleanup", () => {
  it("deletes a room only after it has been empty for 10 minutes", () => {
    const room = leaveRoom(createRoom("ABC234", DEFAULT_SETTINGS, alice, START), alice.playerId, START);
    expect(shouldDeleteRoom(room, START + EMPTY_ROOM_TTL_MS - 1)).toBe(false);
    expect(shouldDeleteRoom(room, START + EMPTY_ROOM_TTL_MS)).toBe(true);
  });

  it("makes the next person to join an empty room the host", () => {
    const empty = leaveRoom(createRoom("ABC234", DEFAULT_SETTINGS, alice, START), alice.playerId, START);
    const room = ok(joinRoom(empty, bob, START + 1000));
    expect(room.hostId).toBe(publicIdFor(bob.playerId));
    expect(room.emptySince).toBeNull();
  });
});
