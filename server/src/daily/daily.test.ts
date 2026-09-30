import { newDb } from "pg-mem";
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { DAILY_ATTEMPT_MS } from "@cube-racing/shared";
import { DailyService, dayOf, nextDayAt } from "./daily";
import { MemoryDailyStore, PostgresDailyStore, type DailyStore } from "./store";

const NOON = Date.UTC(2026, 8, 30, 12, 0, 0);
const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];

/** A daily service with a clock the test moves by hand. */
function setup(store: DailyStore) {
  let now = NOON;
  let made = 0;
  const service = new DailyService(
    store,
    async () => ({ cubeEvent: "333", text: `R U R' U' ${++made}` }),
    () => now,
  );
  return {
    service,
    made: () => made,
    at: (ms: number) => (now = ms),
    later: (ms: number) => (now += ms),
  };
}

function ok<T>(result: { ok: true; daily: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(result.error);
  return result.daily;
}

/** A Postgres store on pg-mem (an in-memory Postgres), so the SQL is tested too. */
async function postgres(): Promise<DailyStore> {
  const { Pool: MemPool } = newDb().adapters.createPg();
  return PostgresDailyStore.open(new MemPool() as unknown as Pool);
}

describe("days", () => {
  it("uses the UTC date, and the next one starts at midnight UTC", () => {
    expect(dayOf(NOON)).toBe("2026-09-30");
    expect(nextDayAt(NOON)).toBe(Date.UTC(2026, 9, 1));
  });
});

for (const [name, makeStore] of [
  ["memory", async () => new MemoryDailyStore()],
  ["postgres", postgres],
] as const) {
  describe(`daily scramble (${name} store)`, () => {
    it("hides the scramble until you start, and everyone gets the same one", async () => {
      const t = setup(await makeStore());
      const before = ok(await t.service.status(ids[0]));
      expect(before).toMatchObject({ status: "new", scramble: null, total: 0 });

      const [a, b] = await Promise.all([t.service.start(ids[0], "Nomin"), t.service.start(ids[1], "Anu")]);
      expect(ok(a).status).toBe("started");
      expect(ok(a).scramble).toEqual(ok(b).scramble);
      expect(ok(a).deadline).toBe(NOON + DAILY_ATTEMPT_MS);
      expect(t.made()).toBe(1); // made once, even with two first visitors at once
    });

    it("one attempt: starting again or sending again changes nothing", async () => {
      const t = setup(await makeStore());
      await t.service.start(ids[0], "Nomin");
      t.later(30_000);
      const done = ok(await t.service.submit(ids[0], 9_120, "OK"));
      expect(done).toMatchObject({ status: "done", result: { timeMs: 9_120, penalty: "OK" }, rank: 1, total: 1 });

      t.later(1_000);
      expect(ok(await t.service.start(ids[0], "Nomin"))).toMatchObject({ status: "done", result: { timeMs: 9_120 } });
      expect(ok(await t.service.submit(ids[0], 5_000, "OK")).result?.timeMs).toBe(9_120);
    });

    it("ranks fastest first, +2 counted, DNF last; ties go to who finished first", async () => {
      const t = setup(await makeStore());
      for (const id of ids) await t.service.start(id, id.slice(0, 4));
      t.later(60_000);
      await t.service.submit(ids[0], 9_000, "+2"); // 11.00
      t.later(1_000);
      await t.service.submit(ids[1], 11_000, "OK"); // 11.00, but later
      t.later(1_000);
      await t.service.submit(ids[2], 7_000, "DNF");

      const view = ok(await t.service.status(ids[1]));
      expect(view.leaderboard.map((row) => [row.rank, row.name])).toEqual([
        [1, "1111"],
        [2, "2222"],
        [3, "3333"],
      ]);
      expect(view).toMatchObject({ rank: 2, total: 3 });
      expect(ok(await t.service.status(ids[2])).rank).toBe(3);
    });

    it("refuses a time longer than the attempt has been going", async () => {
      const t = setup(await makeStore());
      await t.service.start(ids[0], "Nomin");
      t.later(5_000);
      expect(await t.service.submit(ids[0], 60_000, "OK")).toMatchObject({ ok: false });
      expect(await t.service.submit(ids[0], 4_000, "OK")).toMatchObject({ ok: true });
    });

    it("counts an attempt as DNF after 10 minutes without a time", async () => {
      const t = setup(await makeStore());
      await t.service.start(ids[0], "Nomin");
      t.later(DAILY_ATTEMPT_MS + 60_000);
      expect(ok(await t.service.status(ids[0]))).toMatchObject({ status: "done", result: { penalty: "DNF" }, rank: 1 });
    });

    it("a new day brings a new scramble and a fresh attempt", async () => {
      const t = setup(await makeStore());
      await t.service.start(ids[0], "Nomin");
      t.at(NOON + 24 * 3_600_000);
      expect(ok(await t.service.status(ids[0]))).toMatchObject({ day: "2026-10-01", status: "new", total: 0 });
      const tomorrow = ok(await t.service.start(ids[0], "Nomin"));
      expect(tomorrow.scramble?.text).toBe("R U R' U' 2");
    });
  });
}
