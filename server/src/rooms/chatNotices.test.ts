import { describe, expect, it, vi } from "vitest";
import { CHAT_HISTORY_LENGTH, DEFAULT_SETTINGS, type ChatMessage } from "@cube-racing/shared";
import { chatNotices } from "./chatNotices";
import { LiveRoom } from "./liveRoom";
import { createRoom as createSetupRoom, joinRoom, leaveRoom, startMatch, submitSolve, tickRoom, type LogicResult } from "./roomLogic";
import type { ServerRoom } from "./types";

/** A room its host has already set up and opened (most tests start there; setup has its own tests). */
const createRoom = (...args: Parameters<typeof createSetupRoom>) => ({ ...createSetupRoom(...args), setup: false });


const alice = { playerId: "alice-id", nickname: "Alice" };
const bob = { playerId: "bob-id", nickname: "Bob" };
const timing = { solveReviewMs: 3000, setResultMs: 6000, submitGraceMs: 6000 };

function ok(result: LogicResult): ServerRoom {
  if (!result.ok) throw new Error(result.error);
  return result.room;
}

/** Alice and Bob in a single-solve, best-of-1 match. */
function started(): ServerRoom {
  let room = createRoom("ABC234", { ...DEFAULT_SETTINGS, format: "single", winCondition: "bo1" }, alice, 0);
  room = ok(joinRoom(room, bob, 1));
  const scrambles = { "333": [{ cubeEvent: "333" as const, text: "R U R' U'" }] };
  return ok(startMatch(room, alice.playerId, { matchId: "m1", scrambles, timing }, 2));
}

function submit(room: ServerRoom, playerId: string, timeMs: number, penalty: "OK" | "+2" | "DNF" = "OK"): ServerRoom {
  const m = room.match!;
  return ok(submitSolve(room, playerId, { matchId: m.matchId, setIndex: m.setIndex, solveIndex: m.solveIndex, timeMs, penalty }, 10));
}

describe("chat notices", () => {
  it("announces players joining and leaving, but not coming back to their seat", () => {
    const room = createRoom("ABC234", DEFAULT_SETTINGS, alice, 0);
    const joined = ok(joinRoom(room, bob, 1));
    expect(chatNotices(room, joined)).toEqual(["Bob joined the room"]);
    expect(chatNotices(joined, leaveRoom(joined, bob.playerId, 2))).toEqual(["Bob left the room"]);
  });

  it("announces the match start with its settings", () => {
    let room = createRoom("ABC234", { ...DEFAULT_SETTINGS, format: "single", winCondition: "bo1" }, alice, 0);
    room = ok(joinRoom(room, bob, 1));
    expect(chatNotices(room, started())).toEqual(["Match started: 3x3x3, single, Best of 1"]);
  });

  it("announces submitted times like cubers write them", () => {
    const room = started();
    const plusTwo = submit(room, alice.playerId, 9870, "+2");
    expect(chatNotices(room, plusTwo)).toEqual(["Alice submitted 11.87+"]);
    const dnf = submit(plusTwo, bob.playerId, 0, "DNF");
    expect(chatNotices(plusTwo, dnf)).toEqual(["Bob submitted DNF"]);
  });

  it("announces the set winner and the match winner", () => {
    let room = submit(submit(started(), alice.playerId, 9000), bob.playerId, 10000);
    const review = room;
    room = tickRoom(room, review.match!.phaseEndsAt!); // review over -> set result
    expect(chatNotices(review, room)).toEqual(["Alice wins set 1"]);
    const setResult = room;
    room = tickRoom(room, setResult.match!.phaseEndsAt!); // Alice reached 1 point in a best of 1
    expect(chatNotices(setResult, room)).toEqual(["Alice wins the match"]);
  });

  it("says nothing when nothing worth announcing changed", () => {
    const room = started();
    expect(chatNotices(room, room)).toEqual([]);
  });
});

describe("room chat", () => {
  function live() {
    const sent: ChatMessage[] = [];
    const room = new LiveRoom(createRoom("ABC234", DEFAULT_SETTINGS, alice, Date.now()), {
      broadcast: () => {},
      makeScrambles: async () => [],
      onDelete: () => {},
      log: () => {},
      timing,
      broadcastIntervalMs: 50,
      sendChat: (message) => sent.push(message),
    });
    return { room, sent };
  }

  it("sends each line to the room and keeps it for people who join later", () => {
    const { room, sent } = live();
    room.addChat("user", "hi", { name: "Alice", publicId: "a" });
    expect(sent).toEqual([expect.objectContaining({ kind: "user", name: "Alice", senderId: "a", text: "hi" })]);
    expect(room.chatHistory()).toEqual(sent);
  });

  it("adds a notice when the room changes (here: someone joins)", async () => {
    vi.useFakeTimers();
    const { room, sent } = live();
    await room.run(() => room.commit(ok(joinRoom(room.state, bob, Date.now()))));
    expect(sent.map((m) => m.text)).toEqual(["Bob joined the room"]);
    expect(sent[0].kind).toBe("system");
    room.delete();
    vi.useRealTimers();
  });

  it(`keeps only the last ${CHAT_HISTORY_LENGTH} lines`, () => {
    const { room } = live();
    for (let i = 0; i < CHAT_HISTORY_LENGTH + 20; i++) room.addChat("user", `message ${i}`, { name: "Alice", publicId: "a" });
    const history = room.chatHistory();
    expect(history).toHaveLength(CHAT_HISTORY_LENGTH);
    expect(history[0].text).toBe("message 20");
    expect(new Set(history.map((m) => m.id)).size).toBe(CHAT_HISTORY_LENGTH); // ids are unique
  });
});
