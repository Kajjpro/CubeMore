import { newDb } from "pg-mem";
import type { Pool } from "pg";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";
import { ClientEvents } from "@cube-racing/shared";
import { startServer, type RunningServer } from "../server";
import { SiteStatsService } from "./stats";
import { MemoryVisitStore, PostgresVisitStore, visitorKey, type VisitStore } from "./visits";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const DAY = 24 * 60 * 60_000;
const OCT_10 = Date.UTC(2026, 9, 10, 12);

async function postgres(): Promise<VisitStore> {
  const { Pool: MemPool } = newDb().adapters.createPg();
  return PostgresVisitStore.open(new MemPool() as unknown as Pool);
}

/** Lets the visits be written (they're saved in the background). */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

for (const [name, makeStore] of [
  ["in memory", async () => new MemoryVisitStore()],
  ["in Postgres", postgres],
] as const) {
  describe(`counting visitors (${name})`, () => {
    it("counts each browser once a day, and new ones", async () => {
      let now = OCT_10 - 2 * DAY;
      const stats = new SiteStatsService(await makeStore(), { kept: true, now: () => now });
      stats.connected("s1", A, false);
      stats.connected("s2", A, false); // the same browser, another tab
      await settle();
      now = OCT_10;
      stats.connected("s3", A, false);
      stats.connected("s4", B, true);
      stats.connected("s5", C, false);
      await settle();

      const result = await stats.stats({ total: 2, racing: 1 });
      expect(result.visitors).toEqual({ today: 3, last7: 3, last30: 3, allTime: 3, newToday: 2 });
      expect(result.daily).toHaveLength(30);
      expect(result.daily[29]).toEqual({ day: "2026-10-10", visitors: 3, newVisitors: 2, signedIn: 1 });
      expect(result.daily[27]).toEqual({ day: "2026-10-08", visitors: 1, newVisitors: 1, signedIn: 0 });
      expect(result.since).toBe("2026-10-08");
      expect(result.roomsNow).toBe(2);
      expect(result.racingNow).toBe(1);
    });

    it("signing in later the same day counts as signed in", async () => {
      const stats = new SiteStatsService(await makeStore(), { kept: true, now: () => OCT_10 });
      stats.connected("s1", A, false);
      await settle();
      stats.connected("s2", A, true);
      await settle();
      const today = (await stats.stats({ total: 0, racing: 0 })).daily[29];
      expect(today).toMatchObject({ visitors: 1, signedIn: 1 });
    });
  });
}

describe("site stats", () => {
  it("online now is different browsers, and only real ids count", async () => {
    const stats = new SiteStatsService(new MemoryVisitStore(), { kept: false, now: () => OCT_10 });
    stats.connected("s1", A, false);
    stats.connected("s2", A, false);
    stats.connected("s3", B, false);
    stats.connected("s4", "not-a-uuid", false);
    stats.connected("s5", undefined, false);
    expect((await stats.stats({ total: 0, racing: 0 })).onlineNow).toBe(2);
    stats.disconnected("s3");
    expect((await stats.stats({ total: 0, racing: 0 })).onlineNow).toBe(1);
  });

  it("keeps only a scrambled form of the browser id", async () => {
    const store = new MemoryVisitStore();
    const stats = new SiteStatsService(store, { kept: true, now: () => OCT_10 });
    stats.connected("s1", A, false);
    await settle();
    expect(JSON.stringify([...((store as unknown as { firstDay: Map<string, string> }).firstDay.keys())])).not.toContain(A);
    expect(visitorKey(A)).toHaveLength(32);
  });

  it("accounts and activity come from their sources, and their failures don't break the stats", async () => {
    const stats = new SiteStatsService(new MemoryVisitStore(), {
      kept: true,
      accounts: async () => 42,
      activity: async () => Promise.reject(new Error("down")),
    });
    const result = await stats.stats({ total: 0, racing: 0 });
    expect(result.accounts).toBe(42);
    expect(result.activity).toBeNull();
  });
});

describe("over the socket", () => {
  const servers: RunningServer[] = [];
  const sockets: Socket[] = [];
  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.disconnect();
    for (const server of servers.splice(0)) await server.close().catch(() => {});
  });

  it("counts a browser when it connects, and only the owner can read the stats", async () => {
    const server = await startServer({ port: 0, timing: { solveReviewMs: 0, setResultMs: 100, submitGraceMs: 0 }, logs: false });
    servers.push(server);
    const socket = connect(`http://localhost:${server.port}`, { transports: ["websocket"], auth: { visitor: A } });
    sockets.push(socket);
    const answer = await new Promise<{ ok: boolean; error?: string }>((resolve) => socket.emit(ClientEvents.ADMIN_STATS, {}, resolve));
    expect(answer).toMatchObject({ ok: false, error: expect.stringContaining("site owner") });
  });
});
