import type { SetStanding, WeeklyRow } from "@cube-racing/shared";
import { compareMarks } from "../match/scoring";

/** A weekly race's ranking from its (only) set: best average first, then best single. Ties share a rank. */
export function rankWeekly(standings: Record<string, SetStanding>, names: Record<string, string>): WeeklyRow[] {
  const sorted = Object.entries(standings)
    .map(([playerId, s]) => ({ playerId, name: names[playerId] ?? "Player", average: s.result, best: s.best }))
    .sort((a, b) => compareMarks(a.average, b.average) || compareMarks(a.best, b.best));
  const ranked: WeeklyRow[] = [];
  sorted.forEach((row, i) => {
    const previous = ranked[i - 1];
    const tied = previous && compareMarks(previous.average, row.average) === 0 && compareMarks(previous.best, row.best) === 0;
    ranked.push({ ...row, rank: tied ? previous.rank : i + 1 });
  });
  return ranked;
}
