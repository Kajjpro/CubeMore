import { describe, expect, it } from "vitest";
import {
  AUTO_START_DELAY_MS,
  DEFAULT_SETTINGS,
  EMPTY_ROOM_TTL_MS,
  RECONNECT_GRACE_MS,
  type CubeEventId,
  type Scramble,
} from "@cube-racing/shared";
import {
  autoStart,
  autoStartDue,
  backToLobby,
  chooseEvent,
  createRoom as createSetupRoom,
  endMatch,
  joinRoom,
  kickPlayer,
  leaveRoom,
  markDisconnected,
  newMatchEvents,
  nextSetEvents,
  publicIdFor,
  removeExpiredPlayers,
  shouldDeleteRoom,
  startMatch,
  nextDeadline,
  quickRaceCode,
  reactionText,
  setTimerStatus,
  roomList,
  rematch,
  openRoom,
  setWatching,
  startNextSet,
  needsNextSet,
  submitSolve,
  tickRoom,
  toSnapshot,
  updateSettings,
  type LogicResult,
  type MatchStartInfo,
} from "./roomLogic";
import type { ServerRoom } from "./types";

/** A room its host has already set up and opened (most tests start there; setup has its own tests). */
const createRoom = (...args: Parameters<typeof createSetupRoom>) => ({ ...createSetupRoom(...args), setup: false });


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
function matchStart(cubeEvent: CubeEventId | CubeEventId[] = "333", count = 5): MatchStartInfo {
  const events = Array.isArray(cubeEvent) ? cubeEvent : [cubeEvent];
  const scrambles = Object.fromEntries(
    events.map((event) => [event, Array.from({ length: count }, (_, i): Scramble => ({ cubeEvent: event, text: `${event} R U R' U${i}` }))]),
  );
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
    expect(toSnapshot(started, START).match?.scrambles).toEqual({ "333": start.scrambles["333"]![0] });

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
    expect(snapshot).toContain(start.scrambles["333"]![0].text);
    for (const future of start.scrambles["333"]!.slice(1)) {
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

describe("public and private rooms", () => {
  const privateSettings = { ...DEFAULT_SETTINGS, visibility: "private" as const };

  it("names a room after its host if no name is given", () => {
    expect(createRoom("ABC234", DEFAULT_SETTINGS, alice, START).settings.name).toBe("Alice's room");
    const named = createRoom("ABC234", { ...DEFAULT_SETTINGS, name: "Sunday OH" }, alice, START);
    expect(named.settings.name).toBe("Sunday OH");
  });

  it("a new player needs the right PIN to join a private room", () => {
    const room = createRoom("ABC234", privateSettings, alice, START, "4821");
    expect(joinRoom(room, bob, START + 1000)).toMatchObject({ ok: false, code: "PIN_REQUIRED" });
    expect(joinRoom(room, bob, START + 1000, "1111")).toMatchObject({ ok: false, code: "PIN_REQUIRED", error: "Wrong PIN. Try again." });
    expect(joinRoom(room, bob, START + 1000, "4821").ok).toBe(true);
  });

  it("someone coming back to their seat doesn't need the PIN again", () => {
    let room = createRoom("ABC234", privateSettings, alice, START, "4821");
    room = ok(joinRoom(room, bob, START + 1000, "4821"));
    room = markDisconnected(room, bob.playerId, START + 2000);
    expect(joinRoom(room, bob, START + 3000).ok).toBe(true);
  });

  it("public rooms have no PIN; everyone in a private room can see its PIN", () => {
    expect(toSnapshot(createRoom("ABC234", DEFAULT_SETTINGS, alice, START, "4821"), START).pin).toBeNull();
    expect(toSnapshot(createRoom("ABC234", privateSettings, alice, START, "4821"), START).pin).toBe("4821");
  });

  it("lists public AND private rooms that have players, never a PIN", () => {
    const open = createRoom("AAAAAA", { ...DEFAULT_SETTINGS, name: "Open" }, alice, START);
    const locked = createRoom("BBBBBB", { ...privateSettings, name: "Locked" }, alice, START, "4821");
    const empty = leaveRoom(createRoom("CCCCCC", DEFAULT_SETTINGS, bob, START), bob.playerId, START);
    const list = roomList([open, locked, empty]);
    expect(list).toEqual([
      expect.objectContaining({ code: "BBBBBB", name: "Locked", visibility: "private" }),
      expect.objectContaining({ code: "AAAAAA", name: "Open", players: 1, racing: false, hostName: "Alice", visibility: "public" }),
    ]);
    expect(JSON.stringify(list)).not.toContain("4821");
  });

  it("the host can rename the room and make it private (with a PIN) or public again", () => {
    let room = createRoom("ABC234", DEFAULT_SETTINGS, alice, START);
    room = ok(updateSettings(room, alice.playerId, { name: "Sunday OH" }));
    expect(room.settings.name).toBe("Sunday OH");
    expect(updateSettings(room, alice.playerId, { visibility: "private" })).toMatchObject({ ok: false });
    room = ok(updateSettings(room, alice.playerId, { visibility: "private" }, "4821"));
    expect(room.pin).toBe("4821");
    room = ok(updateSettings(room, alice.playerId, { format: "ao12" })); // keeps its PIN
    expect(room.pin).toBe("4821");
    room = ok(updateSettings(room, alice.playerId, { visibility: "public" }));
    expect(room.pin).toBeNull();
    room = ok(updateSettings(room, alice.playerId, { name: "" }));
    expect(room.settings.name).toBe("Alice's room");
  });
});

describe("changing the event later", () => {
  it("best of can be changed until the first race starts, then it's fixed", () => {
    let room = roomWithThreePlayers();
    room = ok(updateSettings(room, alice.playerId, { winCondition: "bo5" }));
    expect(toSnapshot(room, START).bestOfLocked).toBe(false);
    room = ok(startMatch(room, alice.playerId, matchStart(), START));
    room = ok(endMatch(room, alice.playerId));
    room = ok(backToLobby(room, alice.playerId));
    expect(toSnapshot(room, START).bestOfLocked).toBe(true);
    expect(updateSettings(room, alice.playerId, { winCondition: "bo3" })).toMatchObject({ ok: false });
    expect(ok(updateSettings(room, alice.playerId, { cubeEvent: "pyram" })).settings.cubeEvent).toBe("pyram");
  });

  it("the host can restart in the middle of a match with another event; points go back to 0", () => {
    let room = ok(startMatch(roomWithThreePlayers(), alice.playerId, matchStart(), START));
    const firstMatch = room.match!.matchId;
    const pyraminx = { ...matchStart("pyram"), matchId: "m2" };

    expect(rematch(room, bob.playerId, pyraminx, START + 1000, { cubeEvent: "pyram" }).ok).toBe(false);
    room = ok(rematch(room, alice.playerId, pyraminx, START + 1000, { cubeEvent: "pyram" }));

    expect(room.settings.cubeEvent).toBe("pyram");
    expect(room.settings.winCondition).toBe(DEFAULT_SETTINGS.winCondition);
    expect(room.match).toMatchObject({ matchId: "m2", phase: "solving", setIndex: 0 });
    expect(room.match!.matchId).not.toBe(firstMatch);
    expect(Object.values(room.match!.points)).toEqual([0, 0, 0]);
  });

  it("there is nothing to restart in the lobby", () => {
    expect(rematch(roomWithThreePlayers(), alice.playerId, matchStart(), START).ok).toBe(false);
  });
});

describe("the race starts by itself", () => {
  it("counts down when a second player joins, then starts for everyone", () => {
    let room = createRoom("ABC234", DEFAULT_SETTINGS, alice, START);
    expect(room.autoStartAt).toBeNull();
    room = ok(joinRoom(room, bob, START + 1000));
    expect(room.autoStartAt).toBe(START + 1000 + AUTO_START_DELAY_MS);
    expect(nextDeadline(room)).toBe(room.autoStartAt);
    expect(toSnapshot(room, START).autoStartAt).toBe(room.autoStartAt);

    // A third player joining doesn't push the start back.
    room = ok(joinRoom(room, carol, START + 2000));
    expect(room.autoStartAt).toBe(START + 1000 + AUTO_START_DELAY_MS);

    const at = room.autoStartAt!;
    expect(autoStartDue(room, at - 1)).toBe(false);
    expect(autoStartDue(room, at)).toBe(true);
    room = ok(autoStart(room, matchStart(), at));
    expect(room.match).toMatchObject({ phase: "solving", setIndex: 0 });
    expect(room.match!.roster).toHaveLength(3);
    expect(room.autoStartAt).toBeNull();
    expect(room.hasRaced).toBe(true);
  });

  it("stops the countdown if the other player leaves", () => {
    let room = ok(joinRoom(createRoom("ABC234", DEFAULT_SETTINGS, alice, START), bob, START + 1000));
    room = leaveRoom(room, bob.playerId, START + 2000);
    expect(room.autoStartAt).toBeNull();
    expect(autoStartDue(room, START + 60_000)).toBe(false);
  });

  it("the host can still start right away (alone to practise, or during the countdown)", () => {
    const alone = ok(startMatch(createRoom("ABC234", DEFAULT_SETTINGS, alice, START), alice.playerId, matchStart(), START));
    expect(alone.match?.phase).toBe("solving");
    const counting = ok(joinRoom(createRoom("ABC234", DEFAULT_SETTINGS, alice, START), bob, START + 1000));
    const started = ok(startMatch(counting, alice.playerId, matchStart(), START + 1500));
    expect(started.autoStartAt).toBeNull();
    expect(autoStartDue(started, START + 60_000)).toBe(false);
  });

  it("someone joining during a match doesn't start a countdown", () => {
    let room = ok(startMatch(roomWithThreePlayers(), alice.playerId, matchStart(), START));
    room = ok(joinRoom(room, { playerId: "dan-id", nickname: "Dan" }, START + 1000));
    expect(room.autoStartAt).toBeNull();
  });
});

describe("race now", () => {
  it("prefers a public lobby for the event (fullest first), then a racing room, never private or full ones", () => {
    const lobbyOne = createRoom("AAAAAA", DEFAULT_SETTINGS, alice, START);
    const lobbyTwo = ok(joinRoom(createRoom("BBBBBB", DEFAULT_SETTINGS, bob, START), carol, START));
    const racing = ok(startMatch(createRoom("CCCCCC", DEFAULT_SETTINGS, carol, START), carol.playerId, matchStart(), START));
    const locked = createRoom("DDDDDD", { ...DEFAULT_SETTINGS, visibility: "private" }, alice, START, "1234");
    const pyra = createRoom("EEEEEE", { ...DEFAULT_SETTINGS, cubeEvent: "pyram" }, alice, START);
    const full = createRoom("FFFFFF", { ...DEFAULT_SETTINGS, maxPlayers: 2 }, alice, START);
    const fullRoom = ok(joinRoom(full, bob, START));

    expect(quickRaceCode([lobbyOne, lobbyTwo, racing, locked, pyra, fullRoom], "333", null)).toBe("BBBBBB");
    expect(quickRaceCode([racing, locked, fullRoom], "333", null)).toBe("CCCCCC");
    expect(quickRaceCode([lobbyTwo], "333", "BBBBBB")).toBeNull(); // not the room you're already in
    expect(quickRaceCode([locked, pyra], "333", null)).toBeNull();
    // Everyone's connection dropped: not a room to send someone into.
    const ghost = markDisconnected(createRoom("GGGGGG", DEFAULT_SETTINGS, alice, START), alice.playerId, START);
    expect(quickRaceCode([ghost], "333", null)).toBeNull();
  });
});

describe("reactions and live clocks", () => {
  it("a reaction names the player and their latest time", () => {
    let room = ok(startMatch(roomWithThreePlayers(), alice.playerId, matchStart(), START));
    const bobId = publicIdFor(bob.playerId);
    expect(reactionText(room, bobId, "🔥")).toBe("🔥 Bob");
    room = submit(room, bob.playerId, 9120, START + 10_000);
    expect(reactionText(room, bobId, "🔥")).toBe("🔥 Bob's 9.12");
    expect(reactionText(room, "nobody", "🔥")).toBeNull();
  });

  it("remembers when a player's timer started, and forgets it when they submit", () => {
    let room = ok(startMatch(roomWithThreePlayers(), alice.playerId, matchStart(), START));
    room = setTimerStatus(room, bob.playerId, "solving", START + 500);
    const bobRow = () => toSnapshot(room, START).players.find((p) => p.nickname === "Bob")!;
    expect(bobRow().solvingSince).toBe(START + 500);
    room = submit(room, bob.playerId, 9120, START + 9_700);
    expect(bobRow()).toMatchObject({ timerStatus: "idle", solvingSince: null });
  });
});

describe("mixed events", () => {
  const MIXED = { ...DEFAULT_SETTINGS, cubeEvent: "222" as const, mixedEvents: true };
  const id = (player: { playerId: string }) => publicIdFor(player.playerId);

  /** Alice (pyra) hosts a mixed room; Bob joins with 2x2, Carol hasn't picked. */
  function mixedRoom(format: "single" | "ao5" = "ao5"): ServerRoom {
    let room = createRoom("ABC234", { ...MIXED, format }, { ...alice, cubeEvent: "pyram" }, START);
    room = ok(joinRoom(room, { ...bob, cubeEvent: "222" }, START + 1000));
    return ok(joinRoom(room, carol, START + 2000));
  }

  it("only goes with the mixed events, and never with smart cubes only", () => {
    const room = roomWithThreePlayers();
    expect(updateSettings(room, alice.playerId, { mixedEvents: true }).ok).toBe(false); // the room's event is 3x3
    expect(updateSettings(room, alice.playerId, { mixedEvents: true, cubeEvent: "skewb" }).ok).toBe(true);
    expect(updateSettings(room, alice.playerId, { mixedEvents: true, cubeEvent: "222", smartOnly: true }).ok).toBe(false);
  });

  it("everyone picks their own event; someone who hasn't picked races the room's event", () => {
    const room = mixedRoom();
    expect(toSnapshot(room, START).players.map((p) => p.cubeEvent)).toEqual(["pyram", "222", "222"]);
    const picked = ok(chooseEvent(room, carol.playerId, "clock"));
    expect(toSnapshot(picked, START).players.map((p) => p.cubeEvent)).toEqual(["pyram", "222", "clock"]);
    expect(newMatchEvents(picked)).toEqual(["222", "clock", "pyram"]);
  });

  it("refuses events outside the list, and picks in a one-event room", () => {
    expect(chooseEvent(mixedRoom(), bob.playerId, "333").ok).toBe(false);
    expect(chooseEvent(roomWithThreePlayers(), bob.playerId, "pyram").ok).toBe(false);
  });

  it("a pick in a one-event room is kept but ignored", () => {
    const room = ok(joinRoom(createRoom("ABC234", DEFAULT_SETTINGS, alice, START), { ...bob, cubeEvent: "pyram" }, START));
    expect(toSnapshot(room, START).players.map((p) => p.cubeEvent)).toEqual(["333", "333"]);
  });

  it("each event gets its own scrambles, and only the current one of each is sent", () => {
    const start = matchStart(["222", "pyram"]);
    const room = ok(startMatch(mixedRoom(), alice.playerId, start, START));
    const snapshot = toSnapshot(room, START).match!;
    expect(snapshot.events).toEqual({ [id(alice)]: "pyram", [id(bob)]: "222", [id(carol)]: "222" });
    expect(snapshot.scrambles).toEqual({ "222": start.scrambles["222"]![0], pyram: start.scrambles.pyram![0] });
    expect(JSON.stringify(snapshot)).not.toContain(start.scrambles.pyram![1].text);
  });

  it("refuses to start without scrambles for every event someone races", () => {
    expect(startMatch(mixedRoom(), alice.playerId, matchStart("222"), START).ok).toBe(false);
  });

  it("your event is fixed during the match; it changes for the next one", () => {
    let room = ok(startMatch(mixedRoom(), alice.playerId, matchStart(["222", "pyram"]), START));
    expect(chooseEvent(room, alice.playerId, "skewb").ok).toBe(false);
    room = ok(endMatch(room, alice.playerId));
    room = ok(chooseEvent(room, alice.playerId, "skewb"));
    expect(newMatchEvents(room)).toEqual(["222", "skewb"]);
    room = ok(rematch(room, alice.playerId, matchStart(["222", "skewb"]), START + 5000));
    expect(room.match!.events[id(alice)]).toBe("skewb");
  });

  it("someone who joins mid-match can pick before their first set", () => {
    let room = ok(startMatch(mixedRoom("single"), alice.playerId, matchStart(["222", "pyram"], 1), START));
    const dave = { playerId: "dave-id", nickname: "Dave" };
    room = ok(joinRoom(room, dave, START + 100));
    room = ok(chooseEvent(room, dave.playerId, "clock"));
    expect(nextSetEvents(room)).toEqual(["222", "clock", "pyram"]);

    for (const player of [alice, bob, carol]) room = submit(room, player.playerId, 3000, START + 3000);
    room = tickRoom(room, START + 3000 + 3000 + 6000);
    room = ok(startNextSet(room, matchStart(["222", "clock", "pyram"], 1).scrambles, START + 12_000));
    expect(room.match!.events[publicIdFor(dave.playerId)]).toBe("clock");
  });

  it("is listed as mixed, and Race now finds it for any of its events", () => {
    const room = mixedRoom();
    expect(roomList([room])[0]).toMatchObject({ mixedEvents: true });
    expect(quickRaceCode([room], "skewb", null)).toBe("ABC234");
    expect(quickRaceCode([room], "333", null)).toBeNull();
  });
});

describe("stepping away to watch", () => {
  const id = (player: { playerId: string }) => publicIdFor(player.playerId);
  const single = { ...DEFAULT_SETTINGS, format: "single" as const, winCondition: "bo5" as const };

  /** Alice, Bob and Carol racing singles (best of 5). */
  function racing(): ServerRoom {
    let room = createRoom("ABC234", single, alice, START);
    room = ok(joinRoom(room, bob, START + 1));
    room = ok(joinRoom(room, carol, START + 2));
    return ok(startMatch(room, alice.playerId, matchStart("333", 1), START + 10));
  }

  it("mid-set, the rest of your set is a DNF and nobody waits for you; your points stay", () => {
    let room = racing();
    room = submit(room, alice.playerId, 9000, START + 100);
    room = submit(room, bob.playerId, 9500, START + 200);
    expect(room.match!.phase).toBe("solving"); // waiting for Carol
    room = ok(setWatching(room, carol.playerId, true, START + 300));
    expect(room.match!.results[id(carol)][0]).toMatchObject({ penalty: "DNF", source: "away" });
    expect(room.match!.phase).not.toBe("solving"); // the set went on without her
    expect(toSnapshot(room, START).players.find((p) => p.id === id(carol))).toMatchObject({ watching: true });
  });

  it("isn't in the next set; back, races from the one after", () => {
    let room = ok(setWatching(racing(), carol.playerId, true, START + 50));
    for (const p of [alice, bob]) room = submit(room, p.playerId, 9000, START + 100);
    const nextAt = room.match!.phaseEndsAt!;
    room = tickRoom(room, nextAt);
    room = ok(startNextSet(room, matchStart("333", 1).scrambles, nextAt));
    expect(room.match!.roster).toEqual([id(alice), id(bob)]);

    room = ok(setWatching(room, carol.playerId, false, nextAt + 10));
    expect(room.match!.roster).not.toContain(id(carol)); // this set is already running
    for (const p of [alice, bob]) room = submit(room, p.playerId, 9000, nextAt + 100);
    const third = room.match!.phaseEndsAt!;
    room = ok(startNextSet(tickRoom(room, third), matchStart("333", 1).scrambles, third));
    expect(room.match!.roster).toContain(id(carol));
  });

  it("everyone watching: the match waits on the set result (no busy loop) until someone is back", () => {
    let room = racing();
    for (const p of [alice, bob, carol]) room = submit(room, p.playerId, 9000, START + 100);
    room = tickRoom(room, room.match!.phaseEndsAt!); // the review screen ends: the set result
    expect(room.match!.phase).toBe("set_result");
    for (const p of [alice, bob, carol]) room = ok(setWatching(room, p.playerId, true, START + 200));
    const due = room.match!.phaseEndsAt!;
    room = tickRoom(room, due + 1);
    expect(room.match!.phase).toBe("set_result");
    expect(needsNextSet(room, due + 1)).toBe(false);
    expect(nextDeadline(room)).toBeNull();
    room = ok(setWatching(room, bob.playerId, false, due + 5000));
    expect(needsNextSet(room, due + 5000)).toBe(true);
  });

  it("in the lobby: watchers don't count for the countdown or the race", () => {
    let room = createRoom("ABC234", DEFAULT_SETTINGS, alice, START);
    room = ok(setWatching(room, alice.playerId, true, START));
    room = ok(joinRoom(room, bob, START + 1000));
    expect(room.autoStartAt).toBeNull(); // only one racer
    room = ok(joinRoom(room, carol, START + 2000));
    expect(room.autoStartAt).not.toBeNull();
    room = ok(setWatching(room, carol.playerId, true, START + 2500));
    expect(room.autoStartAt).toBeNull(); // back to one racer
    const started = ok(startMatch(room, alice.playerId, matchStart(), START + 3000));
    expect(started.match!.roster).toEqual([id(bob)]);

    room = ok(setWatching(room, bob.playerId, true, START + 3000));
    expect(startMatch(room, alice.playerId, matchStart(), START + 3000).ok).toBe(false); // nobody races
  });
});

describe("creating a room: setup, then waiting alone", () => {
  it("while the host sets it up: not listed, nobody else can join; the host can come back", () => {
    let room = createSetupRoom("ABC234", DEFAULT_SETTINGS, alice, START);
    expect(toSnapshot(room, START).setup).toBe(true);
    expect(roomList([room])).toEqual([]);
    expect(quickRaceCode([room], "333", null)).toBeNull();
    expect(joinRoom(room, bob, START + 1).ok).toBe(false);
    room = ok(joinRoom(markDisconnected(room, alice.playerId, START + 2), alice, START + 3)); // a refresh
    expect(openRoom(room, bob.playerId).ok).toBe(false);

    room = ok(openRoom(room, alice.playerId));
    expect(room.setup).toBe(false);
    expect(roomList([room])).toHaveLength(1);
    expect(joinRoom(room, bob, START + 4).ok).toBe(true);
  });

  it("someone joins the host waiting alone: the countdown starts", () => {
    const room = ok(joinRoom(ok(openRoom(createSetupRoom("ABC234", DEFAULT_SETTINGS, alice, START), alice.playerId)), bob, START + 1000));
    expect(room.autoStartAt).toBe(START + 1000 + AUTO_START_DELAY_MS);
  });

  it("people already together in the lobby (after a race): a newcomer doesn't start it, the host does", () => {
    let room = roomWithThreePlayers();
    room = { ...room, autoStartAt: null }; // e.g. back in the lobby after a match
    room = ok(joinRoom(room, { playerId: "dave-id", nickname: "Dave" }, START + 5000));
    expect(room.autoStartAt).toBeNull();
  });

  it("a warm-up solve holds the start back until the timer stops, then the full 3 seconds", () => {
    let room = ok(openRoom(createSetupRoom("ABC234", DEFAULT_SETTINGS, alice, START), alice.playerId));
    room = setTimerStatus(room, alice.playerId, "solving", START + 100); // warming up
    room = ok(joinRoom(room, bob, START + 200));
    const due = room.autoStartAt!;
    expect(autoStartDue(room, due + 10_000)).toBe(false); // still solving
    expect(nextDeadline(room, due)).toBe(START + 100 + 2 * 60_000); // checks again when the warm-up stops counting

    room = setTimerStatus(room, alice.playerId, "idle", due + 10_000);
    expect(room.autoStartAt).toBe(due + 10_000 + AUTO_START_DELAY_MS);
    expect(autoStartDue(room, due + 10_000 + AUTO_START_DELAY_MS)).toBe(true);
  });

  it("a warm-up left running doesn't hold the race forever", () => {
    let room = ok(openRoom(createSetupRoom("ABC234", DEFAULT_SETTINGS, alice, START), alice.playerId));
    room = setTimerStatus(room, alice.playerId, "solving", START);
    room = ok(joinRoom(room, bob, START + 100));
    expect(autoStartDue(room, START + 2 * 60_000 + 1)).toBe(true);
  });
});

describe("mixed rooms: a newcomer picks their event before the race starts", () => {
  const MIXED = { ...DEFAULT_SETTINGS, cubeEvent: "222" as const, mixedEvents: true };
  /** Anar opened a mixed room and waits alone; Bilguun joins. */
  function joined(): ServerRoom {
    const room = ok(openRoom(createSetupRoom("ABC234", MIXED, { ...alice, cubeEvent: "pyram" }, START), alice.playerId));
    return ok(joinRoom(room, { ...bob, cubeEvent: "222" }, START + 1000));
  }
  const bobId = publicIdFor(bob.playerId);

  it("the countdown waits while they pick", () => {
    const room = joined();
    expect(toSnapshot(room, START).players.find((p) => p.id === bobId)).toMatchObject({ pickingEvent: true });
    expect(autoStartDue(room, room.autoStartAt! + 5000)).toBe(false);
    expect(nextDeadline(room, START + 2000)).toBe(START + 1000 + 30_000);
  });

  it("picking (or keeping their last pick) makes them ready: the countdown starts again from 3", () => {
    let room = joined();
    room = ok(chooseEvent(room, bob.playerId, "skewb", START + 9000));
    expect(toSnapshot(room, START).players.find((p) => p.id === bobId)).toMatchObject({ pickingEvent: false, cubeEvent: "skewb" });
    expect(room.autoStartAt).toBe(START + 9000 + AUTO_START_DELAY_MS);
    expect(autoStartDue(room, START + 9000 + AUTO_START_DELAY_MS)).toBe(true);

    const kept = ok(chooseEvent(joined(), bob.playerId, "222", START + 4000)); // "Ready" with the event they had
    expect(kept.players.find((p) => p.publicId === bobId)!.pickingEvent).toBe(false);
  });

  it("someone who never picks doesn't hold the race for more than 30 seconds", () => {
    expect(autoStartDue(joined(), START + 1000 + 30_000)).toBe(true);
  });

  it("one-event rooms don't wait", () => {
    const room = ok(joinRoom(ok(openRoom(createSetupRoom("ABC234", DEFAULT_SETTINGS, alice, START), alice.playerId)), bob, START + 1000));
    expect(autoStartDue(room, room.autoStartAt!)).toBe(true);
  });
});
