/*
 * CHAOS TEST: 20 bots race in one room while things go wrong on purpose.
 *
 *   npm run chaos -w server                     (20 runs, seeds 1..20)
 *   npm run chaos -w server -- --runs 5 --seed 100
 *
 * Each run starts a fresh server, and 20 bots play an ao5, best-of-3 match:
 *   - every bot submits a random time and penalty after a random delay,
 *   - 10% of the bots are "flaky": they disconnect and reconnect mid-solve,
 *   - some submissions are sent twice,
 *   - some bots "refresh" (a brand new connection, same playerId) while a
 *     solve is still waiting in their outbox, like a real page refresh.
 *
 * Then it checks:
 *   1. every bot solve is recorded exactly once: none lost, none duplicated,
 *   2. all bots end on the same final snapshot version with identical state,
 *   3. set winners, points and the match winner match an INDEPENDENT
 *      recalculation (written separately below, not using the server's code),
 *   4. the room never gets stuck: the match always finishes.
 */

import { randomUUID } from "node:crypto";
import { io, type Socket } from "socket.io-client";
import type { Penalty, RoomSnapshot } from "@cube-racing/shared";
import { startServer, type RunningServer } from "../src/server";

const BOT_COUNT = 20;
const FLAKY_SHARE = 0.1; // 10% of bots disconnect and reconnect mid-solve
const REFRESH_CHANCE = 0.05; // per bot, per solve
const DUPLICATE_CHANCE = 0.2; // per submission
let RUN_TIMEOUT_MS = 120_000; // change with --timeout <seconds>

// ---------------------------------------------------------------------------
// Seeded randomness, so a failing seed can be replayed
// ---------------------------------------------------------------------------

function makeRandom(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    chance: (p: number) => next() < p,
  };
}
type Random = ReturnType<typeof makeRandom>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// A bot = one player with its own "localStorage" (outbox) that survives refreshes
// ---------------------------------------------------------------------------

interface Submission {
  matchId: string;
  setIndex: number;
  solveIndex: number;
  timeMs: number;
  penalty: Penalty;
}

const keyOf = (s: { matchId: string; setIndex: number; solveIndex: number }) =>
  `${s.matchId}/${s.setIndex}/${s.solveIndex}`;

class Bot {
  readonly playerId = randomUUID();
  socket!: Socket;
  latest: RoomSnapshot | null = null;
  youId: string | null = null;
  joined = false;
  stopped = false;

  /** What this bot decided for each solve: exactly one entry per solve it played. */
  readonly ledger = new Map<string, Submission>();
  /** Like the browser outbox: kept until the server acks it. Survives "refreshes". */
  readonly outbox = new Map<string, Submission>();

  readonly stats = { duplicates: 0, disconnects: 0, refreshes: 0, notCurrent: 0 };
  private sending = false;
  private closed = false;
  private readonly timers = new Set<NodeJS.Timeout>();

  constructor(
    readonly nickname: string,
    private readonly url: string,
    private readonly random: Random,
    readonly flaky: boolean,
    private code: string | null,
  ) {
    this.connect();
  }

  get connected(): boolean {
    return this.socket.connected;
  }

  /** setTimeout that is cancelled when the bot is closed. */
  private later(ms: number, action: () => void): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (!this.closed) action();
    }, ms);
    this.timers.add(timer);
  }

  /** A new connection (first load, or a "refresh"). */
  connect(): void {
    if (this.closed) return;
    this.joined = false;
    this.socket = io(this.url, { transports: ["websocket"], reconnection: false, forceNew: true });
    this.socket.on("connect", () => void this.join());
    this.socket.on("room:state", (snapshot: RoomSnapshot) => this.apply(snapshot));
  }

  async create(settings: object): Promise<string> {
    await this.waitConnected();
    const response = await this.socket.timeout(5000).emitWithAck("room:create", {
      playerId: this.playerId,
      nickname: this.nickname,
      settings,
    });
    if (!response.ok) throw new Error(`create failed: ${response.error}`);
    this.code = response.room.code;
    this.youId = response.youId;
    this.joined = true;
    this.apply(response.room);
    // A new room starts in setup (nobody can join yet): the host opens it.
    const opened = await this.socket.timeout(5000).emitWithAck("room:open", {});
    if (!opened.ok) throw new Error(`open failed: ${opened.error}`);
    return response.room.code;
  }

  private async join(): Promise<void> {
    if (!this.code) return;
    const socket = this.socket;
    try {
      const response = await socket.timeout(3000).emitWithAck("room:join", {
        playerId: this.playerId,
        nickname: this.nickname,
        code: this.code,
      });
      if (socket !== this.socket) return; // this connection was replaced meanwhile
      if (!response.ok) throw new Error(response.error);
      this.youId = response.youId;
      this.joined = true;
      this.apply(response.room);
      void this.flush();
    } catch (error) {
      if (socket === this.socket && socket.connected) {
        this.later(200, () => void this.join());
      }
    }
  }

  private apply(snapshot: RoomSnapshot): void {
    if (this.latest && snapshot.version < this.latest.version) return;
    this.latest = snapshot;
    this.maybeSolve();
  }

  /** When a new solve appears that this bot must do, decide a time and submit it later. */
  private maybeSolve(): void {
    const match = this.latest?.match;
    if (this.stopped || !match || !this.youId || match.phase !== "solving") return;
    const row = match.results[this.youId];
    if (!row) return; // spectating this set
    const solve = { matchId: match.matchId, setIndex: match.setIndex, solveIndex: match.solveIndex };
    const key = keyOf(solve);
    if (this.ledger.has(key) || row[match.solveIndex] !== null) return;

    const roll = this.random.next();
    const penalty: Penalty = roll < 0.1 ? "DNF" : roll < 0.2 ? "+2" : "OK";
    const submission: Submission = { ...solve, timeMs: this.random.int(5_000, 30_000), penalty };
    this.ledger.set(key, submission);

    if (this.random.chance(0.5)) this.socket.emit("match:timer_status", { status: "solving" }, () => {});

    const flakyNow = this.flaky && this.random.chance(0.5);
    const refreshNow = this.random.chance(REFRESH_CHANCE);
    const delay = this.random.int(10, 250);

    if (flakyNow) {
      // Disconnect mid-solve, come back a bit later (well within the 30 s grace).
      this.stats.disconnects++;
      this.socket.disconnect();
      this.later(this.random.int(50, 800), () => this.socket.connect());
    }

    this.later(delay, () => {
      // The timer stopped: into the outbox first, then send.
      this.outbox.set(key, submission);
      void this.flush();
      if (refreshNow) {
        // "Refresh the page" right after, with the solve maybe still unacked.
        this.stats.refreshes++;
        const old = this.socket;
        this.connect();
        this.later(this.random.int(0, 100), () => old.disconnect());
      }
    });
  }

  /** Sends everything in the outbox until the server acks it. */
  private async flush(): Promise<void> {
    if (this.sending || !this.joined || !this.socket.connected) return;
    this.sending = true;
    const socket = this.socket;
    try {
      for (const [key, submission] of [...this.outbox]) {
        const copies = this.random.chance(DUPLICATE_CHANCE) ? 2 : 1;
        if (copies === 2) this.stats.duplicates++;
        const answers = await Promise.all(
          Array.from({ length: copies }, () =>
            socket
              .timeout(2000)
              .emitWithAck("match:submit_solve", submission)
              .catch(() => ({ ok: false, error: "timeout" })),
          ),
        );
        if (answers.some((a) => a.ok)) {
          this.outbox.delete(key);
        } else if (answers.some((a) => a.code === "NOT_CURRENT")) {
          this.stats.notCurrent++;
          this.outbox.delete(key);
        }
      }
    } finally {
      this.sending = false;
    }
    if (this.outbox.size > 0) {
      this.later(200, () => void this.flush());
    }
  }

  async waitConnected(): Promise<void> {
    while (!this.socket.connected) await sleep(10);
  }

  close(): void {
    this.stopped = true;
    this.closed = true;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.socket.disconnect();
  }
}

// ---------------------------------------------------------------------------
// Independent scoring (deliberately NOT using the server's scoring code)
// ---------------------------------------------------------------------------

/** In hundredths of a second; DNF = Infinity. */
function hundredths(s: Submission): number {
  if (s.penalty === "DNF") return Infinity;
  return Math.trunc(s.timeMs / 10) + (s.penalty === "+2" ? 200 : 0);
}

function referenceAo5(solves: Submission[]): { average: number; best: number } {
  const times = solves.map(hundredths).sort((a, b) => a - b);
  const middle = times.slice(1, 4);
  // A sum of 3 whole numbers / 3 is never exactly x.5, so Math.round is safe here.
  const average = middle.includes(Infinity) ? Infinity : Math.round((middle[0] + middle[1] + middle[2]) / 3);
  return { average, best: times[0] };
}

function referenceSetWinners(results: Map<string, { average: number; best: number }>): string[] {
  const valid = [...results].filter(([, r]) => r.average !== Infinity);
  if (valid.length === 0) return [];
  const bestAverage = Math.min(...valid.map(([, r]) => r.average));
  const tied = valid.filter(([, r]) => r.average === bestAverage);
  const bestSingle = Math.min(...tied.map(([, r]) => r.best));
  return tied.filter(([, r]) => r.best === bestSingle).map(([id]) => id).sort();
}

// ---------------------------------------------------------------------------
// One run
// ---------------------------------------------------------------------------

async function runOnce(seed: number): Promise<{ ok: boolean; problems: string[]; summary: string }> {
  const random = makeRandom(seed);
  const problems: string[] = [];
  const server: RunningServer = await startServer({
    port: 0,
    timing: { solveReviewMs: 150, setResultMs: 300, submitGraceMs: 0 },
    logs: false,
  });
  const url = `http://localhost:${server.port}`;
  const bots: Bot[] = [];

  try {
    // Create the room and let everyone join.
    const host = new Bot("Bot0", url, random, false, null);
    bots.push(host);
    const code = await host.create({ cubeEvent: "333", format: "ao5", winCondition: "bo3" });
    const flakyCount = Math.round(BOT_COUNT * FLAKY_SHARE);
    for (let i = 1; i < BOT_COUNT; i++) {
      bots.push(new Bot(`Bot${i}`, url, random, i <= flakyCount, code));
    }
    const started = Date.now();
    while (host.latest?.players.length !== BOT_COUNT) {
      if (Date.now() - started > 10_000) throw new Error("bots could not all join");
      await sleep(20);
    }

    // Start (retry if the host's first attempt fails for any reason).
    let start = await host.socket.timeout(5000).emitWithAck("room:start", {});
    while (!start.ok) {
      await sleep(100);
      start = await host.socket.timeout(5000).emitWithAck("room:start", {});
    }

    // Play until the match is over, or give up (= the room got stuck).
    const live = server.rooms.get(code)!;
    while (live.state.match?.phase !== "match_over") {
      if (Date.now() - started > RUN_TIMEOUT_MS) {
        const m = live.state.match;
        throw new Error(`STUCK in ${m?.phase} set ${m?.setIndex} solve ${m?.solveIndex}`);
      }
      await sleep(50);
    }

    // Stop the chaos; make sure every bot is back and its outbox is empty.
    for (const bot of bots) bot.stopped = true;
    const settleStart = Date.now();
    while (bots.some((b) => !b.connected || !b.joined || b.outbox.size > 0)) {
      if (Date.now() - settleStart > 10_000) throw new Error("bots did not settle after the match");
      await sleep(20);
    }
    await sleep(300); // let the last snapshots arrive

    const match = live.state.match!;
    const idOf = new Map(bots.map((b) => [b.youId!, b]));

    // ---- 1. Every solve recorded exactly once ----
    let recorded = 0;
    const ledgerKeys = new Set(bots.flatMap((b) => [...b.ledger.keys()].map((k) => `${b.youId}|${k}`)));
    for (const set of match.finishedSets) {
      for (const id of set.roster) {
        const bot = idOf.get(id);
        set.results[id].forEach((result, solveIndex) => {
          const key = keyOf({ matchId: match.matchId, setIndex: set.setIndex, solveIndex });
          const intended = bot?.ledger.get(key);
          recorded++;
          ledgerKeys.delete(`${id}|${key}`);
          if (!intended) {
            problems.push(`${bot?.nickname} has a result for ${key} it never submitted (${result.source})`);
          } else if (
            result.source !== "submitted" ||
            result.timeMs !== intended.timeMs ||
            result.penalty !== intended.penalty
          ) {
            problems.push(`${bot?.nickname} ${key}: recorded ${JSON.stringify(result)}, submitted ${JSON.stringify(intended)}`);
          }
        });
      }
    }
    if (ledgerKeys.size > 0) problems.push(`${ledgerKeys.size} submitted solves are missing (lost)`);

    // ---- 2. Everyone ends on the same version with identical state ----
    const strip = (s: RoomSnapshot | null) => JSON.stringify({ ...s, serverTime: 0 });
    const versions = new Set(bots.map((b) => b.latest?.version));
    if (versions.size !== 1) problems.push(`bots ended on different versions: ${[...versions].join(", ")}`);
    if (bots[0].latest?.version !== live.state.version) problems.push("bots are not on the server's latest version");
    if (new Set(bots.map((b) => strip(b.latest))).size !== 1) problems.push("bots ended with different states");

    // ---- 3. Independent recalculation of winners and points ----
    const points = new Map(bots.map((b) => [b.youId!, 0]));
    let referenceWinner: string | null = null;
    let setsNeeded = 0;
    for (let setIndex = 0; referenceWinner === null; setIndex++) {
      const results = new Map<string, { average: number; best: number }>();
      for (const bot of bots) {
        const solves = [0, 1, 2, 3, 4].map((i) => bot.ledger.get(keyOf({ matchId: match.matchId, setIndex, solveIndex: i })));
        if (solves.some((s) => !s)) throw new Error(`reference: ${bot.nickname} has no solves for set ${setIndex}`);
        results.set(bot.youId!, referenceAo5(solves as Submission[]));
      }
      const winners = referenceSetWinners(results);
      for (const id of winners) points.set(id, points.get(id)! + 1);
      const serverWinners = [...(match.finishedSets[setIndex]?.winnerIds ?? [])].sort();
      if (JSON.stringify(serverWinners) !== JSON.stringify(winners)) {
        problems.push(`set ${setIndex + 1}: server winners ${serverWinners} but reference says ${winners}`);
      }
      setsNeeded = setIndex + 1;
      const [top, second] = [...points.values()].sort((a, b) => b - a);
      if (top >= 2 && top > second) referenceWinner = [...points].find(([, p]) => p === top)![0];
      if (setIndex > 50) throw new Error("reference: match never ends");
    }
    if (match.finishedSets.length !== setsNeeded) {
      problems.push(`server played ${match.finishedSets.length} sets, reference needed ${setsNeeded}`);
    }
    for (const [id, p] of points) {
      if ((match.points[id] ?? 0) !== p) problems.push(`points of ${idOf.get(id)?.nickname}: server ${match.points[id]}, reference ${p}`);
    }
    if (JSON.stringify(match.winnerIds) !== JSON.stringify([referenceWinner])) {
      problems.push(`match winner: server ${match.winnerIds}, reference ${referenceWinner}`);
    }

    const totals = bots.reduce(
      (t, b) => ({
        duplicates: t.duplicates + b.stats.duplicates,
        disconnects: t.disconnects + b.stats.disconnects,
        refreshes: t.refreshes + b.stats.refreshes,
      }),
      { duplicates: 0, disconnects: 0, refreshes: 0 },
    );
    const summary =
      `${match.finishedSets.length} sets, ${recorded} solves, winner ${idOf.get(match.winnerIds[0])?.nickname} ` +
      `(${totals.duplicates} duplicate sends, ${totals.disconnects} disconnects, ${totals.refreshes} refreshes, ` +
      `final version ${live.state.version})`;
    return { ok: problems.length === 0, problems, summary };
  } catch (error) {
    problems.push(String(error));
    return { ok: false, problems, summary: "crashed" };
  } finally {
    for (const bot of bots) bot.close();
    await server.close();
  }
}

// ---------------------------------------------------------------------------

function argument(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? Number(process.argv[index + 1]) : fallback;
}

RUN_TIMEOUT_MS = argument("timeout", RUN_TIMEOUT_MS / 1000) * 1000;
const runs = argument("runs", 20);
const firstSeed = argument("seed", 1);
let failures = 0;

for (let i = 0; i < runs; i++) {
  const seed = firstSeed + i;
  const started = Date.now();
  const result = await runOnce(seed);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`${result.ok ? "PASS" : "FAIL"}  seed ${seed}  ${seconds}s  ${result.summary}`);
  for (const problem of result.problems.slice(0, 10)) console.log(`      - ${problem}`);
  if (!result.ok) failures++;
}

console.log(failures === 0 ? `\nAll ${runs} runs passed.` : `\n${failures} of ${runs} runs FAILED.`);
process.exit(failures === 0 ? 0 : 1);
