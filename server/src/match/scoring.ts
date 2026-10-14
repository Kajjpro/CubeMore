/*
 * SCORING: turning solves into averages, set winners and a match winner.
 *
 * All the maths uses WHOLE NUMBERS only (milliseconds and hundredths of a
 * second), never decimals, so there are no floating-point rounding surprises.
 *
 * WCA-style rules:
 *   - Each time is truncated to hundredths: 12.349 s -> 12.34 s.
 *   - +2 adds 2 seconds. DNF counts as the worst possible time.
 *   - ao5: drop the best and the worst, average the middle 3.
 *   - ao12: drop 1 best and 1 worst, average the middle 10.
 *   - More than one DNF in an ao5/ao12 makes the average DNF.
 *   - Averages are rounded to the nearest hundredth, halves go up (10.005 -> 10.01).
 */

import {
  bestOf,
  compareMarks,
  standingOfMarks,
  scoredTime,
  type RoomFormat,
  type SetStanding,
  type SolveResult,
  type WinCondition,
} from "@cube-racing/shared";

// The mark maths itself lives in shared/marks.ts (the client shows team times with it).
export { bestOf, compareMarks, roundHalfUpDivide, scoredTime, trimmedAverage } from "@cube-racing/shared";

export function solvesPerSet(format: RoomFormat): number {
  return { single: 1, ao5: 5, ao12: 12 }[format];
}

/** Points needed to win the match, or null for unlimited (the host ends it). */
export function targetPoints(winCondition: WinCondition): number | null {
  return { bo1: 1, bo3: 2, bo5: 3, unlimited: null }[winCondition];
}

/** A player's result for a finished set: the single or the average, plus their best single. */
export function setStanding(results: SolveResult[], format: RoomFormat): SetStanding {
  return standingOfMarks(results.map(scoredTime), format);
}

/**
 * Who wins the set (gets a point):
 *   1. The best set result wins. Any real result beats DNF.
 *   2. Tied? The better best single wins.
 *   3. Still tied? Everyone tied gets a point.
 *   If everyone's set result is DNF, nobody gets a point.
 */
export function setWinners(standings: Record<string, SetStanding>): string[] {
  let tied = Object.entries(standings).filter(([, standing]) => standing.result !== "DNF");
  if (tied.length === 0) return [];

  const bestResult = bestOf(tied.map(([, s]) => s.result));
  tied = tied.filter(([, s]) => compareMarks(s.result, bestResult) === 0);

  const bestSingle = bestOf(tied.map(([, s]) => s.best));
  tied = tied.filter(([, s]) => compareMarks(s.best, bestSingle) === 0);

  return tied.map(([id]) => id);
}

/**
 * Handicap: a player's pace is the mean of their set results (not DNF) in the
 * earlier sets of this match, in whole ms. null until they have finished a set.
 */
export function paceOf(finishedSets: { standings: Record<string, SetStanding> }[], playerId: string): number | null {
  const marks = finishedSets
    .map((set) => set.standings[playerId]?.result)
    .filter((mark): mark is number => typeof mark === "number");
  if (marks.length === 0) return null;
  return Math.round(marks.reduce((sum, mark) => sum + mark, 0) / marks.length);
}

/**
 * Handicap: the set winners are whoever beat their own pace by the most
 * (smallest result / pace). Players without a pace, and DNFs, can't win.
 * Compared with whole numbers (a * pb vs b * pa), so ties are exact.
 */
export function handicapWinners(standings: Record<string, SetStanding>, paces: Record<string, number | null>): string[] {
  const contenders = Object.entries(standings)
    .filter(([id, s]) => s.result !== "DNF" && paces[id] != null)
    .map(([id, s]) => ({ id, result: s.result as number, pace: paces[id]! }));
  if (contenders.length === 0) return [];
  // "a beat their pace by more than b": a.result / a.pace < b.result / b.pace.
  const better = (a: (typeof contenders)[0], b: (typeof contenders)[0]) => a.result * b.pace - b.result * a.pace;
  const best = contenders.reduce((top, c) => (better(c, top) < 0 ? c : top));
  return contenders.filter((c) => better(c, best) === 0).map((c) => c.id);
}

/**
 * The match winner: someone with at least `target` points AND strictly more
 * points than every other contender. null if nobody has won yet (for example
 * two players tied at the target: they keep playing until one leads).
 */
export function findMatchWinner(
  points: Record<string, number>,
  contenderIds: string[],
  target: number | null,
): string | null {
  if (target === null) return null;
  for (const id of contenderIds) {
    const mine = points[id] ?? 0;
    const leadsEveryone = contenderIds.every((other) => other === id || (points[other] ?? 0) < mine);
    if (mine >= target && leadsEveryone) return id;
  }
  return null;
}

/** Everyone with the most points (used when the host ends the match early). Nobody if all have 0. */
export function pointLeaders(points: Record<string, number>, contenderIds: string[]): string[] {
  const most = Math.max(0, ...contenderIds.map((id) => points[id] ?? 0));
  if (most === 0) return [];
  return contenderIds.filter((id) => (points[id] ?? 0) === most);
}
