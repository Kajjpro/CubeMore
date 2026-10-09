/*
 * THE SITE STATS for /admin: who's online now, visitors per day, accounts,
 * races and analyzer use. Visits are written at most once per browser per day
 * (a set in memory remembers who was already counted today).
 */

import type { Pool } from "pg";
import type { SiteStats } from "@cube-racing/shared";
import { dayOf, visitorKey, type VisitStore } from "./visits";

const DAY_MS = 24 * 60 * 60_000;
/** A browser id is a UUID; anything else isn't counted. */
const VISITOR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Activity = NonNullable<SiteStats["activity"]>;

export class SiteStatsService {
  /** Connected sockets -> their visitor key (online now = the different keys). */
  private online = new Map<string, string>();
  private countedDay = "";
  private countedToday = new Set<string>();

  constructor(
    private readonly visits: VisitStore,
    private readonly options: {
      /** True when visits are kept in a database. */
      kept: boolean;
      /** Accounts made, or null without accounts. */
      accounts?: () => Promise<number | null>;
      /** Races, solves and analyzer sessions, or null without a database. */
      activity?: () => Promise<Activity | null>;
      now?: () => number;
    },
  ) {}

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  /** A browser connected. `visitorId` is what it sent (ignored if it isn't a UUID). */
  connected(socketId: string, visitorId: unknown, signedIn: boolean): void {
    if (typeof visitorId !== "string" || !VISITOR_ID.test(visitorId)) return;
    const key = visitorKey(visitorId);
    this.online.set(socketId, key);
    const day = dayOf(this.now());
    if (day !== this.countedDay) {
      this.countedDay = day;
      this.countedToday.clear();
    }
    // Signing in later the same day counts as signed in.
    const mark = `${key}:${signedIn}`;
    if (this.countedToday.has(mark) || (!signedIn && this.countedToday.has(`${key}:true`))) return;
    this.countedToday.add(mark);
    void this.visits.record(day, key, signedIn).catch((error: Error) => console.error("Couldn't count a visit:", error.message));
  }

  disconnected(socketId: string): void {
    this.online.delete(socketId);
  }

  async stats(rooms: { total: number; racing: number }): Promise<SiteStats> {
    const now = this.now();
    const today = dayOf(now);
    const daysAgo = (n: number) => dayOf(now - n * DAY_MS);
    const [daily, last7, last30, total, accounts, activity] = await Promise.all([
      this.visits.daily(daysAgo(29), today),
      this.visits.distinctSince(daysAgo(6)),
      this.visits.distinctSince(daysAgo(29)),
      this.visits.total(),
      this.options.accounts?.().catch(() => null) ?? Promise.resolve(null),
      this.options.activity?.().catch(() => null) ?? Promise.resolve(null),
    ]);
    // Every day of the last 30, also the ones nobody came.
    const byDay = new Map(daily.map((d) => [d.day, d]));
    const days = Array.from({ length: 30 }, (_, i) => daysAgo(29 - i)).map((day) => byDay.get(day) ?? { day, visitors: 0, newVisitors: 0, signedIn: 0 });
    const todayRow = byDay.get(today);
    return {
      onlineNow: new Set(this.online.values()).size,
      roomsNow: rooms.total,
      racingNow: rooms.racing,
      visitors: { today: todayRow?.visitors ?? 0, last7, last30, allTime: total.visitors, newToday: todayRow?.newVisitors ?? 0 },
      daily: days,
      since: total.since,
      accounts,
      activity,
      kept: this.options.kept,
    };
  }
}

/** Races, solves and analyzer sessions from the database (the tables the history and the analyzer keep). */
export function databaseActivity(pool: Pool, now: () => number = Date.now): () => Promise<Activity> {
  const count = async (sql: string, params: unknown[] = []): Promise<number> => {
    try {
      const { rows } = await pool.query<{ n: string | number }>(sql, params);
      return Number(rows[0]?.n ?? 0);
    } catch {
      return 0; // a table that isn't there yet
    }
  };
  return async () => {
    const [racesLast7, racesAll, solvesAll, analyzerSessions] = await Promise.all([
      count("SELECT COUNT(*) AS n FROM matches WHERE started_at >= $1", [now() - 7 * DAY_MS]),
      count("SELECT COUNT(*) AS n FROM matches"),
      count("SELECT COUNT(*) AS n FROM solves"),
      count("SELECT COUNT(*) AS n FROM practice_sessions"),
    ]);
    return { racesLast7, racesAll, solvesAll, analyzerSessions };
  };
}
