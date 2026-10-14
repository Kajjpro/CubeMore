/*
 * TEAM MATCHES: 2 vs 2, 3 vs 3... Two teams race on the same scrambles, and
 * each solve gets ONE team time:
 *
 *   "all"      everyone counts: the team time is the mean of its members' times
 *              (a DNF makes it DNF, like a DNF in a relay).
 *   "fastest"  the fastest member's time counts.
 *
 * A teammate who left the room, or stepped away to watch, isn't counted (the
 * rest of the team plays on); with nobody left, the team's solve is a DNF.
 * The team times then make the team's single or average for the set, with the
 * usual rules, and the better team wins the set (a point for the team).
 */

import { bestOf, compareMarks, roundHalfUpDivide, scoredTime, standingOfMarks } from "./marks";
import type { Mark, RoomFormat, SetStanding, SolveResult } from "./types";

export const TEAM_IDS = ["A", "B"] as const;
export type TeamId = (typeof TEAM_IDS)[number];

/** "off" = everyone for themselves. */
export const TEAM_MODES = ["off", "all", "fastest"] as const;
export type TeamMode = (typeof TEAM_MODES)[number];

/** The teams' names: two cube colours. */
export const TEAM_NAMES: Record<TeamId, string> = { A: "Blue", B: "Red" };

/** "Blue team". */
export function teamName(team: TeamId): string {
  return `${TEAM_NAMES[team]} team`;
}

export function otherTeam(team: TeamId): TeamId {
  return team === "A" ? "B" : "A";
}

/** Results that don't count for the team: the player wasn't there for that solve. */
function absent(result: SolveResult): boolean {
  return result.source === "removed" || result.source === "away";
}

/**
 * The team's time for one solve, from its members' results for that solve, or
 * null while a counted member still has to solve.
 */
export function teamSolveMark(mode: Exclude<TeamMode, "off">, results: (SolveResult | null)[]): Mark | null {
  if (results.some((r) => r === null)) return null;
  const counted = (results as SolveResult[]).filter((r) => !absent(r));
  if (counted.length === 0) return "DNF";
  const marks = counted.map(scoredTime);
  if (mode === "fastest") return bestOf(marks);
  if (marks.includes("DNF")) return "DNF";
  // Every mark is a multiple of 10 ms: the mean in whole hundredths, halves up.
  const hundredths = (marks as number[]).reduce((sum, mark) => sum + mark / 10, 0);
  return roundHalfUpDivide(hundredths, marks.length) * 10;
}

/** The members of `team` in this set's roster. */
export function teamMembers(team: TeamId, roster: string[], teamOf: Record<string, TeamId>): string[] {
  return roster.filter((id) => teamOf[id] === team);
}

/** A team's time for each solve of the set (null = not in yet). Empty when the team has nobody in the set. */
export function teamSolveMarks(
  mode: Exclude<TeamMode, "off">,
  members: string[],
  results: Record<string, (SolveResult | null)[]>,
  solves: number,
): (Mark | null)[] {
  if (members.length === 0) return [];
  return Array.from({ length: solves }, (_, i) => teamSolveMark(mode, members.map((id) => results[id]?.[i] ?? null)));
}

/**
 * Each team's set result (single or average of its team times), or null while
 * the set isn't done for it. A team with nobody in the set has no entry.
 */
export function teamStandings(
  mode: Exclude<TeamMode, "off">,
  format: RoomFormat,
  roster: string[],
  teamOf: Record<string, TeamId>,
  results: Record<string, (SolveResult | null)[]>,
  solves: number,
): Partial<Record<TeamId, SetStanding | null>> {
  const standings: Partial<Record<TeamId, SetStanding | null>> = {};
  for (const team of TEAM_IDS) {
    const marks = teamSolveMarks(mode, teamMembers(team, roster, teamOf), results, solves);
    if (marks.length === 0) continue;
    standings[team] = marks.every((m) => m !== null) ? standingOfMarks(marks as Mark[], format) : null;
  }
  return standings;
}

/**
 * The team(s) that win a set: the better result, then the better best single;
 * still tied, both. Nobody if both are DNF. (The same rule as for players.)
 */
export function setWinnersOfTeams(standings: Partial<Record<TeamId, SetStanding>>): TeamId[] {
  let tied = TEAM_IDS.filter((t) => standings[t] && standings[t]!.result !== "DNF");
  if (tied.length === 0) return [];
  const best = bestOf(tied.map((t) => standings[t]!.result));
  tied = tied.filter((t) => compareMarks(standings[t]!.result, best) === 0);
  const single = bestOf(tied.map((t) => standings[t]!.best));
  return tied.filter((t) => compareMarks(standings[t]!.best, single) === 0);
}

/**
 * Splits players into two teams of (nearly) the same size and speed. Players
 * come fastest first (`paceMs`, null = unknown, placed last) and are dealt like
 * a snake draft: Blue, Red, Red, Blue, Blue, Red... The ones without a time
 * fill up whichever team is smaller.
 */
export function balanceTeams(players: { id: string; paceMs: number | null }[]): Record<string, TeamId> {
  const known = players.filter((p) => p.paceMs !== null).sort((a, b) => a.paceMs! - b.paceMs!);
  const unknown = players.filter((p) => p.paceMs === null);
  const teams: Record<string, TeamId> = {};
  const size = { A: 0, B: 0 };
  known.forEach((p, i) => {
    const team: TeamId = i % 4 === 0 || i % 4 === 3 ? "A" : "B";
    teams[p.id] = team;
    size[team]++;
  });
  for (const p of unknown) {
    const team: TeamId = size.A <= size.B ? "A" : "B";
    teams[p.id] = team;
    size[team]++;
  }
  return teams;
}
