// Display-only calculations: which times to put in parentheses, the fastest time
// of a solve, and "Your session" statistics. The official scores (averages,
// winners, points) always come from the server; nothing here changes them.

import { PLUS_TWO_MS, type RoomFormat, type SolveResult } from "@cube-racing/shared";

/** The scored time in ms (truncated to hundredths, +2 added), or null for DNF. */
export function scoredMs(result: SolveResult): number | null {
  if (result.penalty === "DNF") return null;
  return Math.floor(result.timeMs / 10) * 10 + (result.penalty === "+2" ? PLUS_TWO_MS : 0);
}

/** Sort key: DNF is the slowest possible. */
function sortValue(result: SolveResult): number {
  return scoredMs(result) ?? Number.POSITIVE_INFINITY;
}

/**
 * For a complete ao5 / ao12 row: the indexes of the best and worst solve, which
 * are shown in parentheses. Empty for single, or while the row isn't complete.
 */
export function droppedIndexes(row: (SolveResult | null)[] | undefined, format: RoomFormat): number[] {
  if (!row || format === "single" || row.some((r) => r === null)) return [];
  const order = row.map((r, i) => ({ i, v: sortValue(r as SolveResult) })).sort((a, b) => a.v - b.v || a.i - b.i);
  return [order[0].i, order[order.length - 1].i];
}

/** Public ids of the fastest (non-DNF) time in one solve column. */
export function fastestInColumn(results: Record<string, (SolveResult | null)[]>, solveIndex: number): Set<string> {
  let best = Number.POSITIVE_INFINITY;
  let ids: string[] = [];
  for (const [id, row] of Object.entries(results)) {
    const result = row[solveIndex];
    const value = result ? scoredMs(result) : null;
    if (value === null) continue;
    if (value < best) {
      best = value;
      ids = [id];
    } else if (value === best) {
      ids.push(id);
    }
  }
  return new Set(ids);
}

/** Average of `solves` dropping 1 best and 1 worst (ao5 / ao12). null = DNF. Whole-number maths. */
export function trimmedAverage(solves: SolveResult[]): number | null {
  const values = solves.map(sortValue).sort((a, b) => a - b).slice(1, -1);
  if (values.some((v) => !Number.isFinite(v))) return null;
  const sum = values.reduce((total, v) => total + v / 10, 0);
  return Math.floor((2 * sum + values.length) / (2 * values.length)) * 10;
}

/** The best average of any `size` solves in a row. undefined = not enough solves yet. */
export function bestRollingAverage(solves: SolveResult[], size: number): number | null | undefined {
  if (solves.length < size) return undefined;
  let best: number | null = null;
  for (let start = 0; start + size <= solves.length; start++) {
    const average = trimmedAverage(solves.slice(start, start + size));
    if (average !== null && (best === null || average < best)) best = average;
  }
  return best;
}

export interface SessionStats {
  solves: number;
  best: number | null;
  mean: number | null;
  bestAo5: number | null | undefined;
  bestAo12: number | null | undefined;
}

export function sessionStats(solves: SolveResult[]): SessionStats {
  const valid = solves.map(scoredMs).filter((v): v is number => v !== null);
  const mean = valid.length ? Math.floor(valid.reduce((a, b) => a + b, 0) / valid.length / 10) * 10 : null;
  return {
    solves: solves.length,
    best: valid.length ? Math.min(...valid) : null,
    mean,
    bestAo5: bestRollingAverage(solves, 5),
    bestAo12: bestRollingAverage(solves, 12),
  };
}
