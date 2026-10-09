/*
 * COUNTING VISITORS, without tracking anyone.
 *
 * Each browser keeps a random id of its own (made by the website, nothing to do
 * with the player id) and sends it when it connects. The server only stores a
 * scrambled (SHA-256) form of it and the days it was seen: enough to count
 * "how many different browsers today, this week, ever", not to know who they are.
 * No addresses, no names, no pages.
 *
 * Two versions with the same methods (like the contact store): in memory, or
 * in Postgres (DATABASE_URL).
 */

import { createHash } from "node:crypto";
import type { Pool } from "pg";
import type { DailyVisitors } from "@cube-racing/shared";

export interface VisitStore {
  /** A browser was here today (counted once per day). */
  record(day: string, visitor: string, signedIn: boolean): Promise<void>;
  /** Visitors per day from `from` to `to` (inclusive, "YYYY-MM-DD"). */
  daily(from: string, to: string): Promise<DailyVisitors[]>;
  /** Different browsers seen on or after `from`. */
  distinctSince(from: string): Promise<number>;
  /** Every browser ever seen, and the first day of counting. */
  total(): Promise<{ visitors: number; since: string | null }>;
}

/** The scrambled form of a browser's id: the same browser always gives the same text. */
export function visitorKey(id: string): string {
  return createHash("sha256").update(`cubemore-visitor:${id}`).digest("hex").slice(0, 32);
}

export function dayOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export class MemoryVisitStore implements VisitStore {
  private visits = new Map<string, Map<string, boolean>>();
  private firstDay = new Map<string, string>();

  async record(day: string, visitor: string, signedIn: boolean): Promise<void> {
    let today = this.visits.get(day);
    if (!today) this.visits.set(day, (today = new Map()));
    today.set(visitor, (today.get(visitor) ?? false) || signedIn);
    if (!this.firstDay.has(visitor)) this.firstDay.set(visitor, day);
  }

  async daily(from: string, to: string): Promise<DailyVisitors[]> {
    return [...this.visits.entries()]
      .filter(([day]) => day >= from && day <= to)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, visitors]) => ({
        day,
        visitors: visitors.size,
        newVisitors: [...visitors.keys()].filter((v) => this.firstDay.get(v) === day).length,
        signedIn: [...visitors.values()].filter(Boolean).length,
      }));
  }

  async distinctSince(from: string): Promise<number> {
    const seen = new Set<string>();
    for (const [day, visitors] of this.visits) if (day >= from) for (const v of visitors.keys()) seen.add(v);
    return seen.size;
  }

  async total(): Promise<{ visitors: number; since: string | null }> {
    const days = [...this.visits.keys()].sort();
    return { visitors: this.firstDay.size, since: days[0] ?? null };
  }
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS site_visits (
    day TEXT NOT NULL,
    visitor TEXT NOT NULL,
    signed_in BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (day, visitor)
  );
  CREATE TABLE IF NOT EXISTS site_visitors (
    visitor TEXT PRIMARY KEY,
    first_day TEXT NOT NULL
  );
`;

export class PostgresVisitStore implements VisitStore {
  private constructor(private readonly pool: Pool) {}

  static async open(pool: Pool): Promise<PostgresVisitStore> {
    await pool.query(SCHEMA);
    return new PostgresVisitStore(pool);
  }

  async record(day: string, visitor: string, signedIn: boolean): Promise<void> {
    await this.pool.query(
      `INSERT INTO site_visits (day, visitor, signed_in) VALUES ($1, $2, $3)
       ON CONFLICT (day, visitor) DO UPDATE SET signed_in = site_visits.signed_in OR EXCLUDED.signed_in`,
      [day, visitor, signedIn],
    );
    await this.pool.query("INSERT INTO site_visitors (visitor, first_day) VALUES ($1, $2) ON CONFLICT (visitor) DO NOTHING", [visitor, day]);
  }

  async daily(from: string, to: string): Promise<DailyVisitors[]> {
    const { rows } = await this.pool.query<{ day: string; visitors: string | number; new_visitors: string | number; signed_in: string | number }>(
      `SELECT v.day,
              COUNT(*) AS visitors,
              SUM(CASE WHEN s.first_day = v.day THEN 1 ELSE 0 END) AS new_visitors,
              SUM(CASE WHEN v.signed_in THEN 1 ELSE 0 END) AS signed_in
       FROM site_visits v JOIN site_visitors s ON s.visitor = v.visitor
       WHERE v.day >= $1 AND v.day <= $2
       GROUP BY v.day ORDER BY v.day`,
      [from, to],
    );
    return rows.map((r) => ({ day: r.day, visitors: Number(r.visitors), newVisitors: Number(r.new_visitors), signedIn: Number(r.signed_in) }));
  }

  async distinctSince(from: string): Promise<number> {
    const { rows } = await this.pool.query<{ n: string | number }>("SELECT COUNT(DISTINCT visitor) AS n FROM site_visits WHERE day >= $1", [from]);
    return Number(rows[0]?.n ?? 0);
  }

  async total(): Promise<{ visitors: number; since: string | null }> {
    const { rows } = await this.pool.query<{ n: string | number; since: string | null }>("SELECT COUNT(*) AS n, MIN(first_day) AS since FROM site_visitors");
    return { visitors: Number(rows[0]?.n ?? 0), since: rows[0]?.since ?? null };
  }
}
