import { io as connect, type Socket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";
import { ClientEvents, MAX_CALL_SIZE, ServerEvents, type CallParticipant } from "@cube-racing/shared";
import { CallRegistry } from "./calls";
import { startServer, type RunningServer } from "./server";

const timing = { solveReviewMs: 0, setResultMs: 100, submitGraceMs: 0 };
const servers: RunningServer[] = [];
const sockets: Socket[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.disconnect();
  for (const server of servers.splice(0)) await server.close().catch(() => {});
});

async function until<T>(check: () => T, what: string): Promise<NonNullable<T>> {
  for (let i = 0; i < 200; i++) {
    const value = check();
    if (value) return value as NonNullable<T>;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

/** A browser tab: remembers the latest call list and the signals it got. */
function tab(server: RunningServer) {
  const socket = connect(`http://localhost:${server.port}`, { transports: ["websocket"], reconnection: false });
  sockets.push(socket);
  const seen = { call: null as CallParticipant[] | null, signals: [] as { from: string; candidate?: unknown }[] };
  socket.on(ServerEvents.CALL_STATE, (state: { participants: CallParticipant[] }) => (seen.call = state.participants));
  socket.on(ServerEvents.CALL_SIGNAL, (signal: { from: string }) => seen.signals.push(signal));
  const ask = (event: string, payload: object = {}) => socket.emitWithAck(event, payload);
  return { socket, seen, ask };
}

const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];

/** A host with an open room, and a second player in it. */
async function roomWithTwo() {
  const server = await startServer({ port: 0, timing, logs: false, makeScrambles: async (cubeEvent, n) => Array.from({ length: n }, () => ({ cubeEvent, text: "R U" })) });
  servers.push(server);
  const host = tab(server);
  const guest = tab(server);
  const created = await host.ask(ClientEvents.CREATE_ROOM, { playerId: ids[0], nickname: "Anu", settings: {} });
  await host.ask(ClientEvents.OPEN_ROOM, {});
  await guest.ask(ClientEvents.JOIN_ROOM, { playerId: ids[1], nickname: "Bat", code: created.room.code });
  return { server, host, guest, code: created.room.code as string };
}

describe("voice and video calls", () => {
  it("joining, mic and camera, and leaving are seen by the whole room", async () => {
    const { host, guest } = await roomWithTwo();
    const joined = await host.ask(ClientEvents.CALL_JOIN, { audio: true, video: false });
    expect(joined.ok).toBe(true);
    expect(joined.iceServers.length).toBeGreaterThan(0);
    await until(() => guest.seen.call?.length === 1, "the guest to see the host in the call");
    expect(guest.seen.call![0]).toMatchObject({ name: "Anu", audio: true, video: false, peerId: joined.peerId });

    await host.ask(ClientEvents.CALL_MEDIA, { audio: false, video: true });
    await until(() => guest.seen.call?.[0]?.video === true, "the camera to show");
    await host.ask(ClientEvents.CALL_LEAVE);
    await until(() => guest.seen.call?.length === 0, "the host to leave the call");
  });

  it("passes connection messages only between two people in the same call", async () => {
    const { host, guest } = await roomWithTwo();
    const a = await host.ask(ClientEvents.CALL_JOIN, { audio: true, video: false });
    // The guest isn't in the call yet: nothing reaches them, and they can't send.
    expect((await guest.ask(ClientEvents.CALL_SIGNAL, { to: a.peerId, candidate: null })).ok).toBe(false);
    const b = await guest.ask(ClientEvents.CALL_JOIN, { audio: true, video: false });
    const sent = await guest.ask(ClientEvents.CALL_SIGNAL, { to: a.peerId, description: { type: "offer", sdp: "v=0" } });
    expect(sent.ok).toBe(true);
    const got = await until(() => host.seen.signals[0], "the offer");
    expect(got).toMatchObject({ from: b.peerId, description: { type: "offer", sdp: "v=0" } });
  });

  it("someone who leaves the room (or drops) leaves the call", async () => {
    const { host, guest } = await roomWithTwo();
    await guest.ask(ClientEvents.CALL_JOIN, { audio: true, video: true });
    await until(() => host.seen.call?.length === 1, "the guest in the call");
    guest.socket.disconnect();
    await until(() => host.seen.call?.length === 0, "the guest to drop out of the call");
  });

  it("you need to be in a room, and a call holds at most 8", async () => {
    const server = await startServer({ port: 0, timing, logs: false });
    servers.push(server);
    const outsider = tab(server);
    expect((await outsider.ask(ClientEvents.CALL_JOIN, { audio: true, video: false })).ok).toBe(false);

    const calls = new CallRegistry();
    for (let i = 0; i < MAX_CALL_SIZE; i++) expect(calls.join("R", { peerId: `p${i}`, playerId: `x${i}`, name: "n", audio: true, video: false })).toBe(true);
    expect(calls.join("R", { peerId: "late", playerId: "y", name: "n", audio: true, video: false })).toBe(false);
    expect(calls.together("R", "p0", "p1")).toBe(true);
    expect(calls.together("R", "p0", "late")).toBe(false);
  });
});
