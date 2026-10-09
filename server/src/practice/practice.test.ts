import { newDb } from "pg-mem";
import type { Pool } from "pg";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";
import { ClientEvents, type LeaderboardRow, type Replay } from "@cube-racing/shared";
import { buildSolve } from "../analysis/fixtures";
import { startServer, type RunningServer } from "../server";
import type { HistoryReader } from "../persistence/store";
import { cleanCoachText, coachFacts, geminiCoach, type Coach } from "./coach";
import { COACH_PER_USER_PER_DAY, IssuedScrambles, PracticeService } from "./service";
import { MemoryPracticeStore, PostgresPracticeStore, type PracticeStore } from "./store";

const SESSION = "33333333-3333-4333-8333-333333333333";
const OTHER_SESSION = "44444444-4444-4444-8444-444444444444";

async function postgresStore(): Promise<PracticeStore> {
  const { Pool: MemPool } = newDb().adapters.createPg();
  return PostgresPracticeStore.open(new MemPool() as unknown as Pool);
}

/** A built solve with its scramble issued to a connection. */
function issued(seed: number, scrambles = new IssuedScrambles()) {
  const built = buildSolve(seed, "D");
  const scrambleId = scrambles.issue(built.scramble);
  const timeMs = built.times[built.times.length - 1];
  return { scrambles, input: { scrambleId, timeMs, moves: built.moves, times: built.times } };
}

const fakeCoach = (answer = "You did well.\n- Plan the cross.\n- Look ahead.\n- Learn OLL 27."): Coach & { calls: number } => {
  const coach = {
    model: "fake",
    calls: 0,
    async summarize() {
      coach.calls++;
      return answer;
    },
  };
  return coach;
};

for (const [name, makeStore] of [
  ["in memory", async () => new MemoryPracticeStore()],
  ["in Postgres", postgresStore],
] as const) {
  describe(`keeping analyzer solves (${name})`, () => {
    it("saves a solve with the server's own analysis, and lists it", async () => {
      const service = new PracticeService(await makeStore(), null, null, true);
      const { scrambles, input } = issued(1);
      const { solve, session } = await service.save("user_a", { ...input, sessionId: SESSION, kind: "single", index: 0 }, scrambles);
      expect(solve.analysis.timeMs).toBe(input.timeMs);
      expect(solve.analysis.stages).toHaveLength(7);
      expect(session.resultMs).toBe(input.timeMs);

      const list = await service.list("user_a");
      expect(list.map((s) => s.id)).toEqual([SESSION]);
      expect((await service.get("user_a", SESSION)).solves[0].moves).toEqual(input.moves);
    });

    it("an ao5 gets its average and summary once it has 5 solves", async () => {
      const service = new PracticeService(await makeStore(), null, null, true);
      const scrambles = new IssuedScrambles();
      const times: number[] = [];
      for (let i = 0; i < 5; i++) {
        const { input } = issued(10 + i, scrambles);
        times.push(input.timeMs);
        const { session } = await service.save("user_a", { ...input, sessionId: SESSION, kind: "ao5", index: i }, scrambles);
        expect(session.resultMs === null).toBe(i < 4);
      }
      const full = await service.get("user_a", SESSION);
      expect(full.solves).toHaveLength(5);
      expect(full.summary?.count).toBe(5);
      const sorted = [...times].sort((a, b) => a - b);
      expect(full.summary?.averageMs).toBe(Math.round((sorted[1] + sorted[2] + sorted[3]) / 3));
    });

    it("refuses scrambles it didn't give, used twice, or a solve that doesn't solve it", async () => {
      const service = new PracticeService(await makeStore(), null, null, true);
      const { scrambles, input } = issued(2);
      await expect(service.save("user_a", { ...input, scrambleId: SESSION, sessionId: SESSION, kind: "single", index: 0 }, scrambles)).rejects.toThrow(/expired/);
      await expect(
        service.save("user_a", { ...input, moves: input.moves.slice(0, -2), times: input.times.slice(0, -2), sessionId: SESSION, kind: "single", index: 0 }, scrambles),
      ).rejects.toThrow(/can't be kept/);
      await service.save("user_a", { ...input, sessionId: SESSION, kind: "single", index: 0 }, scrambles);
      await expect(service.save("user_a", { ...input, sessionId: OTHER_SESSION, kind: "single", index: 0 }, scrambles)).rejects.toThrow(/expired/);
    });

    it("nobody can see, add to or delete another player's session", async () => {
      const service = new PracticeService(await makeStore(), null, null, true);
      const { scrambles, input } = issued(3);
      await service.save("user_a", { ...input, sessionId: SESSION, kind: "ao5", index: 0 }, scrambles);
      const other = issued(4, scrambles);
      await expect(service.save("user_b", { ...other.input, sessionId: SESSION, kind: "ao5", index: 1 }, scrambles)).rejects.toThrow(/isn't yours/);
      await expect(service.get("user_b", SESSION)).rejects.toThrow(/isn't available/);
      await service.delete("user_b", SESSION);
      expect(await service.list("user_a")).toHaveLength(1);
      expect(await service.list("user_b")).toHaveLength(0);
      await service.delete("user_a", SESSION);
      expect(await service.list("user_a")).toHaveLength(0);
    });

    it("the coach writes once per session, then it's kept", async () => {
      const coach = fakeCoach();
      const service = new PracticeService(await makeStore(), null, coach, true);
      const { scrambles, input } = issued(5);
      await service.save("user_a", { ...input, sessionId: SESSION, kind: "single", index: 0 }, scrambles);
      expect(await service.coachSummary("user_a", SESSION)).toContain("Plan the cross");
      expect(await service.coachSummary("user_a", SESSION)).toContain("Plan the cross");
      expect(coach.calls).toBe(1);
      expect((await service.get("user_a", SESSION)).coach).toContain("Look ahead");
    });
  });
}

describe("the coach", () => {
  it("is limited per player per day", async () => {
    const service = new PracticeService(new MemoryPracticeStore(), null, fakeCoach(), true, () => Date.UTC(2026, 9, 10));
    const scrambles = new IssuedScrambles();
    for (let i = 0; i < COACH_PER_USER_PER_DAY + 1; i++) {
      const sessionId = `55555555-5555-4555-8555-${String(i).padStart(12, "0")}`;
      const { input } = issued(20 + i, scrambles);
      await service.save("user_a", { ...input, sessionId, kind: "single", index: 0 }, scrambles);
      const ask = service.coachSummary("user_a", sessionId);
      if (i < COACH_PER_USER_PER_DAY) await ask;
      else await expect(ask).rejects.toThrow(/today/);
    }
  });

  it("gets only the analysis numbers, and its answer is cleaned", async () => {
    const built = buildSolve(6, "D");
    const service = new PracticeService(new MemoryPracticeStore(), null, null, true);
    const scrambles = new IssuedScrambles();
    const id = scrambles.issue(built.scramble);
    const { solve } = await service.save(
      "user_a",
      { scrambleId: id, sessionId: SESSION, kind: "single", index: 0, timeMs: built.times[built.times.length - 1], moves: built.moves, times: built.times },
      scrambles,
    );
    const facts = coachFacts([solve.analysis], null);
    expect(facts).toContain("Solve 1:");
    expect(facts).not.toContain("user_a");
    expect(cleanCoachText("**Great** job 🎉\n- Plan the cross ✅")).toBe("Great job\n- Plan the cross");
  });

  it("calls Gemini with the facts and reads its answer", async () => {
    let sent: { url: string; body: { contents: { parts: { text: string }[] }[] }; key: string } | null = null;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      sent = { url, body: JSON.parse(init.body as string), key: (init.headers as Record<string, string>)["x-goog-api-key"] };
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Your cross is the place to start." }] } }] }), { status: 200 });
    }) as typeof fetch;
    const coach = geminiCoach("test-key", "gemini-test", fakeFetch);
    const built = buildSolve(7, "D");
    const service = new PracticeService(new MemoryPracticeStore(), null, coach, true);
    const scrambles = new IssuedScrambles();
    const id = scrambles.issue(built.scramble);
    await service.save("user_a", { scrambleId: id, sessionId: SESSION, kind: "single", index: 0, timeMs: built.times[built.times.length - 1], moves: built.moves, times: built.times }, scrambles);
    expect(await service.coachSummary("user_a", SESSION)).toBe("Your cross is the place to start.");
    expect(sent!.url).toContain("models/gemini-test:generateContent");
    expect(sent!.key).toBe("test-key");
    expect(sent!.body.contents[0].parts[0].text).toContain("Solve 1:");
  });

  it("a failing AI gives a friendly error and nothing is kept", async () => {
    const coach: Coach = { model: "fake", summarize: async () => Promise.reject(new Error("429")) };
    const service = new PracticeService(new MemoryPracticeStore(), null, coach, true);
    const { scrambles, input } = issued(8);
    await service.save("user_a", { ...input, sessionId: SESSION, kind: "single", index: 0 }, scrambles);
    await expect(service.coachSummary("user_a", SESSION)).rejects.toThrow(/couldn't answer/);
    expect((await service.get("user_a", SESSION)).coach).toBeNull();
  });
});

describe("the top solves", () => {
  it("are the leaderboard's solves, analyzed", async () => {
    const built = buildSolve(9, "D");
    const replay: Replay = { name: "Anu", scramble: built.scramble, moves: built.moves, times: built.times, timeMs: built.times[built.times.length - 1], penalty: "OK", tps: 5 };
    const row: LeaderboardRow = { rank: 1, name: "Anu", playerId: "p", timeMs: replay.timeMs, moves: 60, tps: 5, at: 0, replayId: "m/0/0/p" };
    const reader = { leaderboard: async () => [row], replay: async () => replay, weeklyResults: async () => [] } as HistoryReader;
    const service = new PracticeService(new MemoryPracticeStore(), reader, null, true);
    const top = await service.topSolves();
    expect(top).toHaveLength(1);
    expect(top[0].analysis.stages).toHaveLength(7);
  });
});

describe("over the socket", () => {
  const servers: RunningServer[] = [];
  const sockets: Socket[] = [];
  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.disconnect();
    for (const server of servers.splice(0)) await server.close().catch(() => {});
  });

  it("anyone gets scrambles; guests are asked to sign in to keep solves", async () => {
    const server = await startServer({ port: 0, timing: { solveReviewMs: 0, setResultMs: 100, submitGraceMs: 0 }, logs: false });
    servers.push(server);
    const socket = connect(`http://localhost:${server.port}`, { transports: ["websocket"] });
    sockets.push(socket);
    const ask = <T>(event: string, payload: object) => new Promise<T>((resolve) => socket.emit(event, payload, resolve));

    const scramble = await ask<{ ok: true; scramble: string; scrambleId: string }>(ClientEvents.PRACTICE_SCRAMBLE, {});
    expect(scramble.ok).toBe(true);
    expect(scramble.scramble.split(" ").length).toBeGreaterThan(10);

    const save = await ask<{ ok: boolean; error?: string }>(ClientEvents.PRACTICE_SAVE, {
      scrambleId: scramble.scrambleId,
      sessionId: SESSION,
      kind: "single",
      index: 0,
      timeMs: 1000,
      moves: ["R"],
      times: [1000],
    });
    expect(save).toMatchObject({ ok: false, error: expect.stringContaining("Sign in") });

    const list = await ask<{ ok: true; sessions: unknown[]; coach: boolean; kept: boolean }>(ClientEvents.PRACTICE_LIST, {});
    expect(list).toMatchObject({ ok: true, sessions: [], coach: false, kept: false });
  });
});
