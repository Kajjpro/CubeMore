import { io as connect, type Socket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";
import { ClientEvents, SIGN_IN_REFUSED, type CubeEventId, type RoomSnapshot, type Scramble } from "@cube-racing/shared";
import { isOwner, type AccountVerifier } from "./accounts";
import { startServer, type RunningServer } from "./server";

/** Instead of Clerk: "token-anar" is Anar's account; anything else isn't valid. */
const fakeAccounts: AccountVerifier = {
  async verify(token) {
    return token === "token-anar" ? { userId: "user_anar", username: "anar" } : null;
  },
};

async function fakeScrambles(cubeEvent: CubeEventId, count: number): Promise<Scramble[]> {
  return Array.from({ length: count }, (_, i) => ({ cubeEvent, text: `R U F${i}` }));
}

const GUEST = "11111111-1111-4111-8111-111111111111";
const OTHER_DEVICE = "22222222-2222-4222-8222-222222222222";
const timing = { solveReviewMs: 0, setResultMs: 100, submitGraceMs: 0 };

const servers: RunningServer[] = [];
const sockets: Socket[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.disconnect();
  for (const server of servers.splice(0)) await server.close().catch(() => {});
});

async function server(): Promise<RunningServer> {
  const running = await startServer({ port: 0, timing, logs: false, makeScrambles: fakeScrambles, accounts: fakeAccounts });
  servers.push(running);
  return running;
}

/** Connects (with a sign-in token, or as a guest); resolves once connected, or with the refusal. */
function open(running: RunningServer, token?: string): Promise<Socket | Error> {
  const socket = connect(`http://localhost:${running.port}`, {
    transports: ["websocket"],
    reconnection: false,
    auth: token ? { token } : {},
  });
  sockets.push(socket);
  return new Promise((resolve) => {
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", (error) => resolve(error));
  });
}

async function send(socket: Socket, event: string, payload: object) {
  const response = await socket.emitWithAck(event, payload);
  if (!response.ok) throw new Error(response.error);
  return response as { room: RoomSnapshot; youId: string };
}

describe("accounts", () => {
  it("a signed-in player plays as their account, under their username, on every device", async () => {
    const running = await server();
    const laptop = (await open(running, "token-anar")) as Socket;
    const created = await send(laptop, ClientEvents.CREATE_ROOM, { playerId: GUEST, nickname: "whatever" });
    expect(created.room.players[0]).toMatchObject({ nickname: "anar", guest: false });

    // The phone sends another browser id, but it's the same account: the same seat.
    const phone = (await open(running, "token-anar")) as Socket;
    const joined = await send(phone, ClientEvents.JOIN_ROOM, { code: created.room.code, playerId: OTHER_DEVICE, nickname: "x" });
    expect(joined.youId).toBe(created.youId);
    expect(joined.room.players).toHaveLength(1);
  });

  it("guests keep their nickname and are marked as guests", async () => {
    const running = await server();
    const guest = (await open(running)) as Socket;
    const created = await send(guest, ClientEvents.CREATE_ROOM, { playerId: GUEST, nickname: "anar" });
    await send(guest, ClientEvents.OPEN_ROOM, {});
    expect(created.room.players[0]).toMatchObject({ nickname: "anar", guest: true });

    // Same nickname as the account, but a different player.
    const account = (await open(running, "token-anar")) as Socket;
    const joined = await send(account, ClientEvents.JOIN_ROOM, { code: created.room.code, playerId: GUEST, nickname: "anar" });
    expect(joined.youId).not.toBe(created.youId);
  });

  it("a token that isn't valid is refused, so the browser can come back with a fresh one", async () => {
    const running = await server();
    const result = await open(running, "expired");
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe(SIGN_IN_REFUSED);
  });

  it("without accounts set up, a token is ignored and the player is a guest", async () => {
    const running = await startServer({ port: 0, timing, logs: false, makeScrambles: fakeScrambles });
    servers.push(running);
    const socket = (await open(running, "token-anar")) as Socket;
    const created = await send(socket, ClientEvents.CREATE_ROOM, { playerId: GUEST, nickname: "Bat" });
    expect(created.room.players[0]).toMatchObject({ nickname: "Bat", guest: true });
  });
});

describe("the site owner", () => {
  it("is recognized by user id or by a verified email, in any case", () => {
    const owner = { userId: "user_ABC", username: "khaliun", emails: ["owner@example.com"] };
    expect(isOwner(owner, ["user_ABC"])).toBe(true);
    expect(isOwner(owner, ["Owner@Example.com"])).toBe(true);
    expect(isOwner(owner, ["someone@example.com", "user_XYZ"])).toBe(false);
    expect(isOwner({ userId: "user_X", username: "x" }, ["owner@example.com"])).toBe(false);
    expect(isOwner(null, ["owner@example.com"])).toBe(false);
  });
});
