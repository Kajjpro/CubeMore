/*
 * THE WEEKLY RACE's schedule (pure date math).
 *
 * Once a week, at a fixed UTC day and hour, everyone races the same smart-cube
 * 3x3 ao5. The room opens 30 minutes before; the race starts on the minute for
 * whoever is there. For a day after the start, "this week's race" is that race
 * (its results show on the home page); after that it's next week's.
 */

import { DEFAULT_SETTINGS, type RoomSettings } from "@cube-racing/shared";

export interface WeeklySchedule {
  /** 0 = Sunday ... 6 = Saturday (UTC). */
  day: number;
  /** 0-23, UTC. */
  hourUtc: number;
}

export const WEEKLY_OPENS_BEFORE_MS = 30 * 60_000;
const RESULTS_SHOWN_MS = 24 * 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
const WEEK_MS = 7 * DAY_MS;

export interface WeeklyRace {
  /** The race's date, "2026-10-10" (UTC). */
  weeklyId: string;
  startsAt: number;
  opensAt: number;
}

function race(startsAt: number): WeeklyRace {
  return { weeklyId: new Date(startsAt).toISOString().slice(0, 10), startsAt, opensAt: startsAt - WEEKLY_OPENS_BEFORE_MS };
}

/** The most recent start at or before `now`. */
function lastStart(now: number, schedule: WeeklySchedule): number {
  const today = new Date(now);
  const midnight = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const daysBack = (today.getUTCDay() - schedule.day + 7) % 7;
  const start = midnight - daysBack * DAY_MS + schedule.hourUtc * 60 * 60_000;
  return start <= now ? start : start - WEEK_MS;
}

/** This week's race: the one that just happened (for a day), otherwise the next one. */
export function currentWeeklyRace(now: number, schedule: WeeklySchedule): WeeklyRace {
  const last = lastStart(now, schedule);
  return now < last + RESULTS_SHOWN_MS ? race(last) : race(last + WEEK_MS);
}

/** The race before `current` (for "last week's results"). */
export function previousWeeklyRace(current: WeeklyRace): WeeklyRace {
  return race(current.startsAt - WEEK_MS);
}

/** The weekly race's room: smart cubes only, 3x3, one ao5. */
export const WEEKLY_SETTINGS: RoomSettings = {
  ...DEFAULT_SETTINGS,
  name: "Weekly race",
  visibility: "public",
  cubeEvent: "333",
  format: "ao5",
  winCondition: "bo1",
  maxPlayers: 50,
  // Nobody can hold everyone up: 2 minutes per solve.
  solveTimeLimit: 2,
  scoring: "fastest",
  smartOnly: true,
};
