/*
 * THE DAILY SCRAMBLE: one 3x3 scramble per day (UTC) for everyone in the world.
 *
 *   - Nobody sees the scramble before they start their own attempt.
 *   - One attempt per player: "Start" shows the scramble and starts a
 *     10-minute window to send a time. After that it counts as a DNF.
 *   - A time longer than the attempt has been going is refused (it can't be real).
 *   - Leaderboard: fastest first, DNFs last, ties by who finished first.
 */

import {
  DAILY_ATTEMPT_MS,
  DAILY_LEADERBOARD_SIZE,
  type DailyStatus,
  type Penalty,
  type Scramble,
  type SolveResult,
} from "@cube-racing/shared";
import { scoredTime } from "../match/scoring";
import { publicIdFor } from "../rooms/roomLogic";
import type { DailyAttempt, DailyStore } from "./store";

/** Extra time after the 10 minutes to send a time that was stopped in time. */
const SUBMIT_GRACE_MS = 6_000;
/** The timer on the phone and the server's clock can differ a little. */
const CLOCK_SLACK_MS = 2_000;

export type DailyResult = { ok: true; daily: DailyStatus } | { ok: false; error: string };

/** "2026-09-30": the day (in UTC) for a time. */
export function dayOf(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Midnight UTC after `now`: when the next daily scramble comes out. */
export function nextDayAt(now: number): number {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
}

function resultOf(attempt: DailyAttempt): SolveResult | null {
  if (attempt.finishedAt === null || attempt.penalty === null) return null;
  return { timeMs: attempt.timeMs ?? 0, penalty: attempt.penalty, source: attempt.timeMs === null ? "timeout" : "submitted" };
}

export class DailyService {
  /** The scramble being made for a day, so two first visitors don't make two. */
  private making = new Map<string, Promise<Scramble>>();

  constructor(
    private readonly store: DailyStore,
    private readonly makeScramble: () => Promise<Scramble>,
    private readonly clock: () => number = Date.now,
  ) {}

  /** Your status for today (and the leaderboard). */
  async status(playerId: string): Promise<DailyResult> {
    const day = dayOf(this.clock());
    return { ok: true, daily: await this.build(day, playerId) };
  }

  /** Starts your one attempt for today: the scramble shows, the 10 minutes start. */
  async start(playerId: string, nickname: string): Promise<DailyResult> {
    const now = this.clock();
    const day = dayOf(now);
    await this.scrambleFor(day);
    await this.store.startAttempt(day, {
      playerId,
      publicId: publicIdFor(playerId),
      nickname,
      startedAt: now,
      finishedAt: null,
      timeMs: null,
      penalty: null,
      scoredMs: null,
    });
    return { ok: true, daily: await this.build(day, playerId) };
  }

  /** Sends your time for today's attempt. */
  async submit(playerId: string, timeMs: number, penalty: Penalty): Promise<DailyResult> {
    const now = this.clock();
    const day = dayOf(now);
    const attempt = await this.store.getAttempt(day, playerId);
    if (!attempt) return { ok: false, error: "Start today's attempt first." };
    if (attempt.finishedAt !== null) return { ok: true, daily: await this.build(day, playerId) }; // already in (a resend)

    if (now > attempt.startedAt + DAILY_ATTEMPT_MS + SUBMIT_GRACE_MS) {
      await this.timeOut(day, attempt, now);
    } else if (timeMs > now - attempt.startedAt + CLOCK_SLACK_MS) {
      return { ok: false, error: "That time is longer than your attempt has been going." };
    } else {
      const scored = scoredTime({ timeMs, penalty, source: "submitted" });
      await this.store.finishAttempt(day, playerId, {
        finishedAt: now,
        timeMs,
        penalty,
        scoredMs: scored === "DNF" ? null : scored,
      });
    }
    return { ok: true, daily: await this.build(day, playerId) };
  }

  // -------------------------------------------------------------------------

  /** Today's scramble: the saved one, or a new one (made once, even if many ask at once). */
  private async scrambleFor(day: string): Promise<Scramble> {
    const saved = await this.store.getScramble(day);
    if (saved) return saved;
    let making = this.making.get(day);
    if (!making) {
      making = this.makeScramble().then((scramble) => this.store.saveScramble(day, scramble));
      this.making.set(day, making);
      making.finally(() => this.making.delete(day)).catch(() => {});
    }
    return making;
  }

  private async timeOut(day: string, attempt: DailyAttempt, now: number): Promise<void> {
    await this.store.finishAttempt(day, attempt.playerId, { finishedAt: now, timeMs: null, penalty: "DNF", scoredMs: null });
  }

  private async build(day: string, playerId: string): Promise<DailyStatus> {
    const now = this.clock();
    let attempt = await this.store.getAttempt(day, playerId);
    // Ran out of time without sending anything: a DNF.
    if (attempt && attempt.finishedAt === null && now > attempt.startedAt + DAILY_ATTEMPT_MS + SUBMIT_GRACE_MS) {
      await this.timeOut(day, attempt, now);
      attempt = await this.store.getAttempt(day, playerId);
    }

    const [top, total] = await Promise.all([this.store.leaderboard(day, DAILY_LEADERBOARD_SIZE), this.store.countFinished(day)]);
    const done = attempt?.finishedAt != null;
    const rank = done ? (await this.store.countBetter(day, attempt!)) + 1 : null;
    return {
      day,
      serverTime: now,
      nextAt: nextDayAt(now),
      status: !attempt ? "new" : done ? "done" : "started",
      scramble: attempt ? await this.scrambleFor(day) : null,
      deadline: attempt && !done ? attempt.startedAt + DAILY_ATTEMPT_MS : null,
      result: attempt ? resultOf(attempt) : null,
      rank,
      total,
      leaderboard: top.map((a, i) => ({ rank: i + 1, name: a.nickname, playerId: a.publicId, result: resultOf(a)! })),
      youId: publicIdFor(playerId),
    };
  }
}
