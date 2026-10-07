import { newDb } from "pg-mem";
import type { Pool } from "pg";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";
import { ClientEvents, type ContactMessage } from "@cube-racing/shared";
import type { AccountVerifier } from "./accounts";
import { MemoryContactStore, PostgresContactStore, newContactMessage } from "./contact";
import { startServer, type RunningServer } from "./server";

/** "token-owner" is the site owner's account, "token-anar" a player's. */
const fakeAccounts: AccountVerifier = {
  async verify(token) {
    if (token === "token-owner") return { userId: "user_owner", username: "owner" };
    if (token === "token-anar") return { userId: "user_anar", username: "anar" };
    return null;
  },
};

const timing = { solveReviewMs: 0, setResultMs: 100, submitGraceMs: 0 };
const servers: RunningServer[] = [];
const sockets: Socket[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.disconnect();
  for (const server of servers.splice(0)) await server.close().catch(() => {});
});

async function setup() {
  const contactStore = new MemoryContactStore();
  const running = await startServer({ port: 0, timing, logs: false, accounts: fakeAccounts, contactStore, adminUserIds: ["user_owner"] });
  servers.push(running);
  const open = (token?: string) =>
    new Promise<Socket>((resolve, reject) => {
      const socket = connect(`http://localhost:${running.port}`, { transports: ["websocket"], reconnection: false, auth: token ? { token } : {} });
      sockets.push(socket);
      socket.on("connect", () => resolve(socket));
      socket.on("connect_error", reject);
    });
  return { contactStore, open };
}

const message = { name: "Anu", email: "anu@example.com", message: "Could you add a 3x3 blindfolded mode?" };

describe("the contact form", () => {
  it("keeps the message (with the username if signed in); only the owner can read and delete it", async () => {
    const { contactStore, open } = await setup();
    const player = await open("token-anar");
    expect(await player.emitWithAck(ClientEvents.CONTACT_SEND, message)).toEqual({ ok: true });
    const [saved] = await contactStore.list(10);
    expect(saved).toMatchObject({ ...message, username: "anar" });

    // A player and a guest can't read them.
    expect((await player.emitWithAck(ClientEvents.ADMIN_MESSAGES, {})).ok).toBe(false);
    expect((await (await open()).emitWithAck(ClientEvents.ADMIN_MESSAGES, {})).ok).toBe(false);

    const owner = await open("token-owner");
    const listed = await owner.emitWithAck(ClientEvents.ADMIN_MESSAGES, {});
    expect(listed.messages.map((m: ContactMessage) => m.message)).toEqual([message.message]);
    expect((await player.emitWithAck(ClientEvents.ADMIN_DELETE_MESSAGE, { id: saved.id })).ok).toBe(false);
    expect((await owner.emitWithAck(ClientEvents.ADMIN_DELETE_MESSAGE, { id: saved.id })).ok).toBe(true);
    expect(await contactStore.list(10)).toEqual([]);
  });

  it("checks the fields", async () => {
    const { open } = await setup();
    const guest = await open();
    expect((await guest.emitWithAck(ClientEvents.CONTACT_SEND, { ...message, email: "not an email" })).error).toMatch(/email/);
    expect((await guest.emitWithAck(ClientEvents.CONTACT_SEND, { ...message, message: "hi" })).error).toMatch(/10 to 2000/);
  });

  it("bots that fill the hidden field get a thank-you and nothing is kept", async () => {
    const { contactStore, open } = await setup();
    const bot = await open();
    expect(await bot.emitWithAck(ClientEvents.CONTACT_SEND, { ...message, website: "http://spam.example" })).toEqual({ ok: true });
    expect(await contactStore.list(10)).toEqual([]);
  });

  it("3 messages, then wait, even from a new connection", async () => {
    const { open } = await setup();
    for (let i = 0; i < 3; i++) expect((await (await open()).emitWithAck(ClientEvents.CONTACT_SEND, message)).ok).toBe(true);
    expect((await (await open()).emitWithAck(ClientEvents.CONTACT_SEND, message)).code).toBe("RATE_LIMITED");
  });

  it("the Postgres store keeps them, newest first", async () => {
    const { Pool: MemPool } = newDb().adapters.createPg();
    const store = await PostgresContactStore.open(new MemPool() as unknown as Pool);
    await store.add(newContactMessage({ ...message, username: null }, 1000));
    await store.add(newContactMessage({ ...message, message: "A second message here.", username: "anar" }, 2000));
    const listed = await store.list(10);
    expect(listed.map((m) => [m.at, m.username])).toEqual([[2000, "anar"], [1000, null]]);
    await store.remove(listed[0].id);
    expect(await store.list(10)).toHaveLength(1);
  });
});
