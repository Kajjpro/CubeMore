/*
 * SITE STATS for the owner's /admin page: how many people use CubeMore.
 * A "visitor" is one browser (a random id it keeps), counted once a day.
 */

export interface DailyVisitors {
  /** "2026-10-09" (UTC). */
  day: string;
  visitors: number;
  /** Browsers seen for the first time that day. */
  newVisitors: number;
  /** Of them, signed in to an account. */
  signedIn: number;
}

export interface SiteStats {
  /** Browsers connected right now. */
  onlineNow: number;
  /** Open rooms right now, and how many are racing. */
  roomsNow: number;
  racingNow: number;
  visitors: { today: number; last7: number; last30: number; allTime: number; newToday: number };
  /** The last 30 days, oldest first. */
  daily: DailyVisitors[];
  /** The first day visits were counted, or null before any. */
  since: string | null;
  /** Accounts made (from Clerk), or null without accounts. */
  accounts: number | null;
  /** From the history (null without a database). */
  activity: { racesLast7: number; racesAll: number; solvesAll: number; analyzerSessions: number } | null;
  /** False: counted in memory only, so the numbers restart with the server. */
  kept: boolean;
}
