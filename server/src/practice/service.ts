/*
 * THE ANALYZER ON THE SERVER: scrambles, keeping solves, the coach, the top solves.
 *
 * Saving: the solve must use a scramble the server gave this connection, pass
 * the smart cube check (shared/smartSolve.ts), and the server analyzes it
 * again itself, so a saved analysis can be trusted (and the coach only ever
 * reads the server's own numbers).
 */

import { randomUUID } from "node:crypto";
import { PRACTICE_SIZE, type PracticeKind, type PracticeSession, type PracticeSessionInfo, type PracticeSolve, type TopSolve } from "@cube-racing/shared";
import { analyzeSolve, summarizeSession } from "@cube-racing/shared/analysis";
import { verifySmartSolve } from "@cube-racing/shared/smartSolve";
import type { HistoryReader } from "../persistence/store";
import type { Coach } from "./coach";
import { sessionResult, type PracticeStore } from "./store";

/** Scrambles a connection may still save a solve for (the newest ones). */
const KEPT_SCRAMBLES = 12;
const LIST_PAGE = 30;
/** Coach summaries per account per day, and for the whole site (under the free AI quota). */
export const COACH_PER_USER_PER_DAY = 15;
export const COACH_PER_DAY = 400;
/** The top solves are analyzed again at most this often. */
const TOP_TTL_MS = 10 * 60_000;

export class PracticeError extends Error {}

/** The scrambles one connection was given, newest last. */
export class IssuedScrambles {
  private list: { id: string; text: string }[] = [];

  issue(text: string): string {
    const id = randomUUID();
    this.list.push({ id, text });
    if (this.list.length > KEPT_SCRAMBLES) this.list.shift();
    return id;
  }

  get(id: string): string | null {
    return this.list.find((s) => s.id === id)?.text ?? null;
  }

  /** A scramble can be used for one saved solve only. */
  use(id: string): void {
    this.list = this.list.filter((s) => s.id !== id);
  }
}

export interface SaveInput {
  scrambleId: string;
  sessionId: string;
  kind: PracticeKind;
  index: number;
  timeMs: number;
  moves: string[];
  times: number[];
}

export class PracticeService {
  private coachCount = new Map<string, number>();
  private coachDay = "";
  private top: { at: number; solves: TopSolve[] } | null = null;

  constructor(
    private readonly store: PracticeStore,
    private readonly reader: HistoryReader | null,
    private readonly coach: Coach | null,
    /** True when the store is a database (kept across restarts). */
    readonly kept: boolean,
    private readonly now: () => number = Date.now,
  ) {}

  get coachAvailable(): boolean {
    return this.coach !== null;
  }

  async save(userId: string, input: SaveInput, scrambles: IssuedScrambles): Promise<{ solve: PracticeSolve; session: PracticeSessionInfo }> {
    const scramble = scrambles.get(input.scrambleId);
    if (!scramble) throw new PracticeError("That scramble has expired. Your solve is still analyzed here, but it can't be kept.");
    if (input.index >= PRACTICE_SIZE[input.kind]) throw new PracticeError("That session is already complete.");
    const verdict = verifySmartSolve(scramble, input.timeMs, { moves: input.moves, times: input.times });
    if (!verdict.ok) throw new PracticeError(`This solve can't be kept: ${verdict.reason}`);
    const analysis = analyzeSolve(scramble, input.moves, input.times);

    const session = await this.store.ensureSession({ id: input.sessionId, userId, kind: input.kind, createdAt: this.now() });
    if (session.userId !== userId || session.kind !== input.kind) throw new PracticeError("That session isn't yours.");
    const solve: PracticeSolve = {
      id: randomUUID(),
      sessionId: input.sessionId,
      index: input.index,
      createdAt: this.now(),
      scramble,
      timeMs: input.timeMs,
      moves: input.moves,
      times: input.times,
      analysis,
    };
    if (!(await this.store.addSolve(solve))) throw new PracticeError("That solve is already kept.");
    scrambles.use(input.scrambleId);
    const stored = await this.store.getSession(userId, input.sessionId);
    const times = stored?.solves.map((s) => s.timeMs) ?? [input.timeMs];
    return { solve, session: { id: session.id, kind: session.kind, createdAt: session.createdAt, times, resultMs: sessionResult(session.kind, times) } };
  }

  list(userId: string, before?: number): Promise<PracticeSessionInfo[]> {
    return this.store.listSessions(userId, before ?? Number.MAX_SAFE_INTEGER, LIST_PAGE);
  }

  async get(userId: string, sessionId: string): Promise<PracticeSession> {
    const found = await this.store.getSession(userId, sessionId);
    if (!found) throw new PracticeError("That session isn't available.");
    const { session, solves } = found;
    return {
      id: session.id,
      kind: session.kind,
      createdAt: session.createdAt,
      solves,
      summary: solves.length > 1 ? summarizeSession(solves.map((s) => s.analysis)) : null,
      coach: session.coach,
    };
  }

  delete(userId: string, sessionId: string): Promise<void> {
    return this.store.deleteSession(userId, sessionId);
  }

  /** The coach's summary of a kept session (made once, then kept with it). */
  async coachSummary(userId: string, sessionId: string): Promise<string> {
    if (!this.coach) throw new PracticeError("The coach isn't available on this site.");
    const session = await this.get(userId, sessionId);
    if (session.coach) return session.coach;
    if (session.solves.length === 0) throw new PracticeError("That session has no solves yet.");
    this.countCoachUse(userId);
    let text: string;
    try {
      text = await this.coach.summarize(
        session.solves.map((s) => s.analysis),
        session.summary,
      );
    } catch (error) {
      console.error("Coach failed:", error instanceof Error ? error.message : error);
      throw new PracticeError("The coach couldn't answer right now. Please try again in a minute.");
    }
    await this.store.setCoach(userId, sessionId, text, this.coach.model);
    return text;
  }

  private countCoachUse(userId: string): void {
    const day = new Date(this.now()).toISOString().slice(0, 10);
    if (day !== this.coachDay) {
      this.coachDay = day;
      this.coachCount.clear();
    }
    const total = [...this.coachCount.values()].reduce((a, b) => a + b, 0);
    if (total >= COACH_PER_DAY) throw new PracticeError("The coach is resting for today. The analysis above still has every suggestion.");
    const mine = this.coachCount.get(userId) ?? 0;
    if (mine >= COACH_PER_USER_PER_DAY) throw new PracticeError(`That's ${COACH_PER_USER_PER_DAY} coach summaries today. More tomorrow.`);
    this.coachCount.set(userId, mine + 1);
  }

  /** The fastest verified 3x3 smart cube singles on CubeMore, analyzed (cached for a few minutes). */
  async topSolves(): Promise<TopSolve[]> {
    if (!this.reader) return [];
    if (this.top && this.now() - this.top.at < TOP_TTL_MS) return this.top.solves;
    const rows = await this.reader.leaderboard("333", 0, 5);
    const solves: TopSolve[] = [];
    for (const row of rows) {
      const replay = await this.reader.replay(row.replayId);
      if (!replay) continue;
      try {
        const analysis = analyzeSolve(replay.scramble, replay.moves, replay.times);
        solves.push({ name: replay.name, timeMs: replay.timeMs, scramble: replay.scramble, moves: replay.moves, times: replay.times, analysis });
      } catch {
        // Not a CFOP-shaped solve the analyzer can split: leave it out.
      }
    }
    this.top = { at: this.now(), solves };
    return solves;
  }
}
