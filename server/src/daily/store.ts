/*
 * DAILY STORE: where the daily scramble and everyone's attempts are kept.
 *
 * Two versions with the same methods:
 *   - MemoryDailyStore: in the server's memory. Nothing to set up, but it's
 *     empty again after every restart (fine for trying things out).
 *   - PostgresDailyStore: in a Postgres database (set DATABASE_URL). Survives
 *     restarts and deploys. The tables are created on first start.
 *
 * One attempt per player per day is guaranteed by the (day, player_id) key.
 */

import type { Pool } from "pg";
import type { Penalty, Scramble } from "@cube-racing/shared";

export interface DailyAttempt {
  /** The secret player id (never sent to other players). */
  playerId: string;
  publicId: string;
  nickname: string;
  startedAt: number;
  /** null while the attempt is still going. */
  finishedAt: number | null;
  timeMs: number | null;
  penalty: Penalty | null;
  /** The time that counts (with +2), or null for a DNF / an attempt still going. */
  scoredMs: number | null;
}

export interface DailyStore {
  /** Today's scramble, or null if it hasn't been made yet. */
  getScramble(day: string): Promise<Scramble | null>;
  /** Saves the day's scramble unless one is already saved; returns the one that counts. */
  saveScramble(day: string, scramble: Scramble): Promise<Scramble>;
  getAttempt(day: string, playerId: string): Promise<DailyAttempt | null>;
  /** Starts an attempt unless the player already has one; returns the one that counts. */
  startAttempt(day: string, attempt: DailyAttempt): Promise<DailyAttempt>;
  /** Saves the result of an attempt that is still going; returns the attempt as stored. */
  finishAttempt(day: string, playerId: string, result: Pick<DailyAttempt, "finishedAt" | "timeMs" | "penalty" | "scoredMs">): Promise<DailyAttempt | null>;
  /** Finished attempts, best first (DNFs last, then by who finished first). */
  leaderboard(day: string, limit: number): Promise<DailyAttempt[]>;
  /** How many finished today, and how many of them rank above this attempt. */
  countFinished(day: string): Promise<number>;
  countBetter(day: string, attempt: DailyAttempt): Promise<number>;
}

/** Sorts finished attempts: fastest first, DNFs last, ties by who finished first. */
export function compareAttempts(a: DailyAttempt, b: DailyAttempt): number {
  const score = (x: DailyAttempt) => x.scoredMs ?? Infinity;
  return score(a) - score(b) || (a.finishedAt ?? 0) - (b.finishedAt ?? 0);
}

// ---------------------------------------------------------------------------

export class MemoryDailyStore implements DailyStore {
  private scrambles = new Map<string, Scramble>();
  private attempts = new Map<string, Map<string, DailyAttempt>>();

  async getScramble(day: string): Promise<Scramble | null> {
    return this.scrambles.get(day) ?? null;
  }

  async saveScramble(day: string, scramble: Scramble): Promise<Scramble> {
    if (!this.scrambles.has(day)) this.scrambles.set(day, scramble);
    // Only today's scramble matters: forget older days, so memory doesn't grow.
    for (const old of this.scrambles.keys()) if (old < day) this.scrambles.delete(old);
    for (const old of this.attempts.keys()) if (old < day) this.attempts.delete(old);
    return this.scrambles.get(day)!;
  }

  async getAttempt(day: string, playerId: string): Promise<DailyAttempt | null> {
    return this.attempts.get(day)?.get(playerId) ?? null;
  }

  async startAttempt(day: string, attempt: DailyAttempt): Promise<DailyAttempt> {
    const today = this.attempts.get(day) ?? new Map<string, DailyAttempt>();
    this.attempts.set(day, today);
    if (!today.has(attempt.playerId)) today.set(attempt.playerId, attempt);
    return today.get(attempt.playerId)!;
  }

  async finishAttempt(day: string, playerId: string, result: Pick<DailyAttempt, "finishedAt" | "timeMs" | "penalty" | "scoredMs">): Promise<DailyAttempt | null> {
    const attempt = this.attempts.get(day)?.get(playerId);
    if (!attempt) return null;
    if (attempt.finishedAt === null) Object.assign(attempt, result);
    return attempt;
  }

  private finished(day: string): DailyAttempt[] {
    return [...(this.attempts.get(day)?.values() ?? [])].filter((a) => a.finishedAt !== null);
  }

  async leaderboard(day: string, limit: number): Promise<DailyAttempt[]> {
    return this.finished(day).sort(compareAttempts).slice(0, limit);
  }

  async countFinished(day: string): Promise<number> {
    return this.finished(day).length;
  }

  async countBetter(day: string, attempt: DailyAttempt): Promise<number> {
    return this.finished(day).filter((other) => compareAttempts(other, attempt) < 0).length;
  }
}

// ---------------------------------------------------------------------------

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS daily_scrambles (
    day TEXT PRIMARY KEY,
    cube_event TEXT NOT NULL,
    scramble TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS daily_attempts (
    day TEXT NOT NULL,
    player_id TEXT NOT NULL,
    public_id TEXT NOT NULL,
    nickname TEXT NOT NULL,
    started_at BIGINT NOT NULL,
    finished_at BIGINT,
    time_ms INTEGER,
    penalty TEXT,
    scored_ms INTEGER,
    PRIMARY KEY (day, player_id)
  );
  CREATE INDEX IF NOT EXISTS daily_attempts_rank ON daily_attempts (day, scored_ms, finished_at);
`;

interface AttemptRow {
  player_id: string;
  public_id: string;
  nickname: string;
  started_at: string | number;
  finished_at: string | number | null;
  time_ms: number | null;
  penalty: string | null;
  scored_ms: number | null;
}

function toAttempt(row: AttemptRow): DailyAttempt {
  return {
    playerId: row.player_id,
    publicId: row.public_id,
    nickname: row.nickname,
    // BIGINT comes back as a string from Postgres.
    startedAt: Number(row.started_at),
    finishedAt: row.finished_at === null ? null : Number(row.finished_at),
    timeMs: row.time_ms,
    penalty: row.penalty as Penalty | null,
    scoredMs: row.scored_ms,
  };
}

export class PostgresDailyStore implements DailyStore {
  private constructor(private readonly pool: Pool) {}

  /** Connects and creates the tables if they don't exist yet. */
  static async open(pool: Pool): Promise<PostgresDailyStore> {
    await pool.query(SCHEMA);
    return new PostgresDailyStore(pool);
  }

  async getScramble(day: string): Promise<Scramble | null> {
    const { rows } = await this.pool.query("SELECT cube_event, scramble FROM daily_scrambles WHERE day = $1", [day]);
    return rows[0] ? { cubeEvent: rows[0].cube_event, text: rows[0].scramble } : null;
  }

  async saveScramble(day: string, scramble: Scramble): Promise<Scramble> {
    await this.pool.query(
      "INSERT INTO daily_scrambles (day, cube_event, scramble) VALUES ($1, $2, $3) ON CONFLICT (day) DO NOTHING",
      [day, scramble.cubeEvent, scramble.text],
    );
    return (await this.getScramble(day))!;
  }

  async getAttempt(day: string, playerId: string): Promise<DailyAttempt | null> {
    const { rows } = await this.pool.query<AttemptRow>("SELECT * FROM daily_attempts WHERE day = $1 AND player_id = $2", [day, playerId]);
    return rows[0] ? toAttempt(rows[0]) : null;
  }

  async startAttempt(day: string, a: DailyAttempt): Promise<DailyAttempt> {
    await this.pool.query(
      `INSERT INTO daily_attempts (day, player_id, public_id, nickname, started_at)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (day, player_id) DO NOTHING`,
      [day, a.playerId, a.publicId, a.nickname, a.startedAt],
    );
    return (await this.getAttempt(day, a.playerId))!;
  }

  async finishAttempt(day: string, playerId: string, r: Pick<DailyAttempt, "finishedAt" | "timeMs" | "penalty" | "scoredMs">): Promise<DailyAttempt | null> {
    await this.pool.query(
      `UPDATE daily_attempts SET finished_at = $3, time_ms = $4, penalty = $5, scored_ms = $6
       WHERE day = $1 AND player_id = $2 AND finished_at IS NULL`,
      [day, playerId, r.finishedAt, r.timeMs, r.penalty, r.scoredMs],
    );
    return this.getAttempt(day, playerId);
  }

  async leaderboard(day: string, limit: number): Promise<DailyAttempt[]> {
    const { rows } = await this.pool.query<AttemptRow>(
      `SELECT * FROM daily_attempts WHERE day = $1 AND finished_at IS NOT NULL
       ORDER BY scored_ms ASC NULLS LAST, finished_at ASC LIMIT $2`,
      [day, limit],
    );
    return rows.map(toAttempt);
  }

  async countFinished(day: string): Promise<number> {
    const { rows } = await this.pool.query("SELECT COUNT(*) AS n FROM daily_attempts WHERE day = $1 AND finished_at IS NOT NULL", [day]);
    return Number(rows[0].n);
  }

  async countBetter(day: string, attempt: DailyAttempt): Promise<number> {
    // Better = a faster time, or the same time finished earlier. For a DNF:
    // every timed result, and DNFs that finished earlier.
    const query =
      attempt.scoredMs === null
        ? `SELECT COUNT(*) AS n FROM daily_attempts WHERE day = $1 AND finished_at IS NOT NULL
             AND (scored_ms IS NOT NULL OR finished_at < $2)`
        : `SELECT COUNT(*) AS n FROM daily_attempts WHERE day = $1 AND finished_at IS NOT NULL
             AND scored_ms IS NOT NULL AND (scored_ms < $3 OR (scored_ms = $3 AND finished_at < $2))`;
    const params = attempt.scoredMs === null ? [day, attempt.finishedAt] : [day, attempt.finishedAt, attempt.scoredMs];
    const { rows } = await this.pool.query(query, params);
    return Number(rows[0].n);
  }
}
