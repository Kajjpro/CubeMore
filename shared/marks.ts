/*
 * MARKS: turning solves into scored times and averages, WCA-style. Used by the
 * server for every official result, and by the client to show team times.
 *
 * Whole numbers only (milliseconds and hundredths), never decimals:
 *   - Each time is truncated to hundredths: 12.349 s -> 12.34 s.
 *   - +2 adds 2 seconds. DNF counts as the worst possible time.
 *   - ao5 / ao12: drop 1 best and 1 worst, average the rest.
 *   - More than one DNF in an ao5/ao12 makes the average DNF.
 *   - Averages are rounded to the nearest hundredth, halves go up (10.005 -> 10.01).
 */

import { PLUS_TWO_MS } from "./constants";
import type { Mark, RoomFormat, SetStanding, SolveResult } from "./types";

/** The time used for scoring: truncated to hundredths, plus 2 s for +2, or "DNF". */
export function scoredTime(result: SolveResult): Mark {
  if (result.penalty === "DNF") return "DNF";
  const truncated = Math.floor(result.timeMs / 10) * 10;
  return result.penalty === "+2" ? truncated + PLUS_TWO_MS : truncated;
}

/** For sorting: negative if `a` is better than `b`. DNF is worse than any time. */
export function compareMarks(a: Mark, b: Mark): number {
  if (a === "DNF" && b === "DNF") return 0;
  if (a === "DNF") return 1;
  if (b === "DNF") return -1;
  return a - b;
}

export function bestOf(marks: Mark[]): Mark {
  return [...marks].sort(compareMarks)[0] ?? "DNF";
}

/** `sum / count`, rounded to the nearest whole number with halves going up. Whole-number maths only. */
export function roundHalfUpDivide(sum: number, count: number): number {
  return Math.floor((2 * sum + count) / (2 * count));
}

/** Drops `trim` best and `trim` worst, then averages the rest (in hundredths). */
export function trimmedAverage(marks: Mark[], trim: number): Mark {
  const kept = [...marks].sort(compareMarks).slice(trim, marks.length - trim);
  if (kept.includes("DNF")) return "DNF";

  // Every mark is a multiple of 10 ms, so dividing by 10 gives exact whole hundredths.
  const hundredths = kept.map((mark) => (mark as number) / 10);
  const sum = hundredths.reduce((total, value) => total + value, 0);
  return roundHalfUpDivide(sum, kept.length) * 10;
}

/** A set result from its marks: the single or the average, plus the best single. */
export function standingOfMarks(marks: Mark[], format: RoomFormat): SetStanding {
  const best = bestOf(marks);
  const result = format === "single" ? marks[0] : trimmedAverage(marks, 1);
  return { result, best };
}
