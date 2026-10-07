/*
 * MATCH LOGIC: the race itself, as pure functions (match in, new match out).
 *
 * A match is a series of SETS. A set has 1 solve (single), 5 (ao5) or 12 (ao12).
 *
 *   solving ──(everyone in the set has a result)──> solve_review (0 s = skipped)
 *      ^                                                  │
 *      └──────────── next solve of the set ───────────────┤
 *                                                         │ (last solve)
 *                                                         v
 *   solving of the next set <──(6 s, nobody has won)── set_result
 *                                                         │ (someone won)
 *                                                         v
 *                                                     match_over
 *
 * "Everyone has a result" = they submitted, OR the time limit gave them a DNF,
 * OR the host skipped them, OR they left the room. So nobody can block the room.
 *
 * Time is always passed in as `now`, and timed steps happen in tickMatch(),
 * which only acts on deadlines stored IN the match. So calling it too early,
 * too late or twice is harmless: it can never skip a solve.
 */

import type { CubeEventId, ErrorCode, RoomSettings, SetStanding, SolveResult } from "@cube-racing/shared";
import {
  findMatchWinner,
  handicapWinners,
  paceOf,
  pointLeaders,
  setStanding,
  setWinners,
  solvesPerSet,
  targetPoints,
} from "./scoring";
import { verifySmartSolve } from "@cube-racing/shared/smartSolve";
import { replayKey, type Match, type MatchTiming, type PenaltyChange, type SetScrambles, type SolveSubmission } from "./types";

export type MatchUpdate =
  | { ok: true; match: Match }
  | { ok: false; error: string; code?: ErrorCode };

function ok(match: Match): MatchUpdate {
  return { ok: true, match };
}

function fail(error: string): MatchUpdate {
  return { ok: false, error };
}

/** "Rejected": this solve will never count, so the client stops sending it. */
function rejected(error: string): MatchUpdate {
  return { ok: false, error, code: "REJECTED" };
}

/** "Not current" tells the client to drop this request and trust the latest snapshot. */
function notCurrent(error: string): MatchUpdate {
  return { ok: false, error, code: "NOT_CURRENT" };
}

// ---------------------------------------------------------------------------
// Starting
// ---------------------------------------------------------------------------

export interface NewMatch {
  matchId: string;
  settings: RoomSettings;
  timing: MatchTiming;
  roster: string[];
  /** The event each roster player picked (see setEvents). */
  picks: Record<string, CubeEventId>;
  scrambles: SetScrambles;
  now: number;
}

export function createMatch({ matchId, settings, timing, roster, picks, scrambles, now }: NewMatch): Match {
  const empty: Match = {
    matchId,
    phase: "solving",
    settings,
    timing,
    setIndex: 0,
    solveIndex: 0,
    roster: [],
    scrambles: {},
    events: {},
    results: {},
    points: {},
    finishedSets: [],
    phaseEndsAt: null,
    solveDeadline: null,
    winnerIds: [],
    replays: {},
  };
  return beginSet(empty, 0, roster, picks, scrambles, now);
}

/** Starts the next set (after set_result). The roster is whoever is in the room right now. */
export function startNextSet(
  match: Match,
  roster: string[],
  picks: Record<string, CubeEventId>,
  scrambles: SetScrambles,
  now: number,
): MatchUpdate {
  if (match.phase !== "set_result") {
    return fail("The next set can only start after a set result.");
  }
  return ok(beginSet(match, match.setIndex + 1, roster, picks, scrambles, now));
}

/**
 * Who races which event in a set. Players keep their event for the whole
 * match; someone new in the match brings their pick. (`picks` = the event each
 * player in the room picked; the room's event unless the room is mixed.)
 */
export function setEvents(
  match: Pick<Match, "events"> | null,
  roster: string[],
  picks: Record<string, CubeEventId>,
): Record<string, CubeEventId> {
  const events: Record<string, CubeEventId> = {};
  for (const id of roster) {
    const event = match?.events[id] ?? picks[id];
    if (event) events[id] = event;
  }
  return events;
}

/** The events a set needs scrambles for, each once. */
export function eventsNeeded(events: Record<string, CubeEventId>): CubeEventId[] {
  return [...new Set(Object.values(events))].sort();
}

/**
 * Checks the scrambles fit this set: one per solve for every event someone
 * races, each made for that event. We never start solving without a proper scramble.
 */
export function scramblesFit(settings: RoomSettings, events: Record<string, CubeEventId>, scrambles: SetScrambles): boolean {
  const count = solvesPerSet(settings.format);
  return eventsNeeded(events).every((event) => {
    const list = scrambles[event];
    return list !== undefined && list.length === count && list.every((s) => s.cubeEvent === event && s.text.length > 0);
  });
}

function beginSet(
  match: Match,
  setIndex: number,
  roster: string[],
  picks: Record<string, CubeEventId>,
  scrambles: SetScrambles,
  now: number,
): Match {
  const thisSet = setEvents(match, roster, picks);
  if (roster.some((id) => !thisSet[id]) || !scramblesFit(match.settings, thisSet, scrambles)) {
    throw new Error("A set can't start without one scramble per solve for the right event.");
  }
  const count = solvesPerSet(match.settings.format);

  const points = { ...match.points };
  for (const id of roster) {
    points[id] ??= 0;
  }

  const results: Match["results"] = {};
  for (const id of roster) {
    results[id] = new Array<SolveResult | null>(count).fill(null);
  }

  const events = { ...match.events, ...thisSet };
  return startSolve({ ...match, setIndex, roster: [...roster], scrambles, events, results, points, replays: {} }, 0, now);
}

function startSolve(match: Match, solveIndex: number, now: number): Match {
  const limitMinutes = match.settings.solveTimeLimit;
  const started: Match = {
    ...match,
    phase: "solving",
    solveIndex,
    phaseEndsAt: null,
    solveDeadline: limitMinutes === "off" ? null : now + limitMinutes * 60_000,
  };
  // Players who already left have DNFs filled in, so the solve might be done already.
  return finishSolveIfEveryoneDone(started, now);
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/**
 * A player sends their time.
 * - Sending the same solve again is fine: it's ignored, but still answered ok
 *   (the client retries until it hears back, so duplicates are normal).
 * - A time for a solve that isn't current anymore is refused as "not current".
 */
export function submitSolve(match: Match, playerId: string, submission: SolveSubmission, now: number): MatchUpdate {
  if (submission.matchId !== match.matchId || submission.setIndex !== match.setIndex) {
    return notCurrent("That solve is from an earlier set or match.");
  }
  const row = match.results[playerId];
  if (!row) {
    return notCurrent("You're watching this set. You'll join in the next one.");
  }
  if (submission.solveIndex < 0 || submission.solveIndex >= row.length) {
    return notCurrent("That solve doesn't exist.");
  }

  const existing = row[submission.solveIndex];
  if (existing?.source === "submitted") {
    return ok(match); // duplicate: already have it
  }
  if (existing) {
    return notCurrent("This solve was already counted as a DNF.");
  }
  if (match.phase !== "solving" || submission.solveIndex !== match.solveIndex) {
    return notCurrent("That solve is no longer current.");
  }

  const result: SolveResult = { timeMs: submission.timeMs, penalty: submission.penalty, source: "submitted" };
  let updated = match;

  // A smart cube solve: replay it on the scramble. Verified ones get a mark and keep their moves.
  if (submission.smart) {
    const scramble = match.scrambles[match.events[playerId]]?.[submission.solveIndex]?.text ?? "";
    const verdict = verifySmartSolve(scramble, submission.timeMs, submission.smart);
    if (verdict.ok) {
      result.verified = { moves: verdict.moveCount, tps: verdict.tps };
      updated = { ...match, replays: { ...match.replays, [replayKey(playerId, submission.solveIndex)]: submission.smart } };
    } else if (match.settings.smartOnly) {
      return rejected(`This solve couldn't be verified: ${verdict.reason}`);
    }
  } else if (match.settings.smartOnly && submission.penalty !== "DNF") {
    return rejected("This room is for smart cubes only. Connect your smart cube to race here.");
  }

  return ok(finishSolveIfEveryoneDone(setResult(updated, playerId, submission.solveIndex, result), now));
}

/** A player changes OK/+2/DNF on one of their own solves, until the set result is shown. */
export function changePenalty(match: Match, playerId: string, change: PenaltyChange): MatchUpdate {
  if (change.matchId !== match.matchId || change.setIndex !== match.setIndex) {
    return notCurrent("That solve is from an earlier set or match.");
  }
  if (match.phase !== "solving" && match.phase !== "solve_review") {
    return notCurrent("The set is finished, so penalties can't be changed anymore.");
  }
  const existing = match.results[playerId]?.[change.solveIndex];
  if (!existing || existing.source !== "submitted") {
    return fail("You can only change penalties of times you submitted.");
  }
  if (existing.penalty === change.penalty) {
    return ok(match);
  }
  return ok(setResult(match, playerId, change.solveIndex, { ...existing, penalty: change.penalty }));
}

/** The host gives a player a DNF for the current solve (e.g. they went AFK). */
export function skipPlayer(match: Match, targetId: string, now: number): MatchUpdate {
  if (match.phase !== "solving") {
    return fail("You can only skip a player while everyone is solving.");
  }
  const row = match.results[targetId];
  if (!row) {
    return fail("That player isn't in this set.");
  }
  if (row[match.solveIndex]) {
    return fail("That player already has a result for this solve.");
  }
  const dnf: SolveResult = { timeMs: 0, penalty: "DNF", source: "skipped" };
  return ok(finishSolveIfEveryoneDone(setResult(match, targetId, match.solveIndex, dnf), now));
}

/**
 * A player left for good (or switched to watching: source "away"). Their times
 * so far still count; every solve they haven't done in this set becomes a DNF,
 * so they never block the others.
 */
export function removeFromMatch(match: Match, playerId: string, now: number, source: "removed" | "away" = "removed"): Match {
  const row = match.results[playerId];
  if (!row || (match.phase !== "solving" && match.phase !== "solve_review")) {
    return match;
  }
  if (row.every((result) => result !== null)) {
    return match;
  }
  const filled = row.map((result) => result ?? { timeMs: 0, penalty: "DNF" as const, source });
  const updated: Match = { ...match, results: { ...match.results, [playerId]: filled } };
  return finishSolveIfEveryoneDone(updated, now);
}

function setResult(match: Match, playerId: string, solveIndex: number, result: SolveResult): Match {
  const row = [...match.results[playerId]];
  row[solveIndex] = result;
  return { ...match, results: { ...match.results, [playerId]: row } };
}

/**
 * If every roster player has a result for the current solve, move on: to the
 * review screen, or (review time 0, the default) straight to the next scramble.
 */
function finishSolveIfEveryoneDone(match: Match, now: number): Match {
  if (match.phase !== "solving") return match;
  const everyoneDone = match.roster.every((id) => match.results[id][match.solveIndex] !== null);
  if (!everyoneDone) return match;
  if (match.timing.solveReviewMs <= 0) return finishSolve(match, now);
  return {
    ...match,
    phase: "solve_review",
    phaseEndsAt: now + match.timing.solveReviewMs,
    solveDeadline: null,
  };
}

// ---------------------------------------------------------------------------
// Time passing
// ---------------------------------------------------------------------------

/**
 * Applies everything that is due at `now`: time-limit DNFs, the end of the
 * review screen, the end of the set result. `presentIds` = players in the room.
 * Returns the SAME match if nothing was due.
 */
export function tickMatch(match: Match, now: number, presentIds: string[]): Match {
  let current = match;
  // A few steps can be due at once (e.g. a review ends and the next solve is already done).
  for (let step = 0; step < 20; step++) {
    const next = tickOnce(current, now, presentIds);
    if (next === current) break;
    current = next;
  }
  return current;
}

function tickOnce(match: Match, now: number, presentIds: string[]): Match {
  switch (match.phase) {
    case "solving": {
      if (match.solveDeadline === null || now < match.solveDeadline + match.timing.submitGraceMs) {
        return match;
      }
      // Time limit reached: everyone still missing a result gets a DNF.
      let updated = match;
      for (const id of match.roster) {
        if (updated.results[id][match.solveIndex] === null) {
          updated = setResult(updated, id, match.solveIndex, { timeMs: 0, penalty: "DNF", source: "timeout" });
        }
      }
      return finishSolveIfEveryoneDone(updated, now);
    }

    case "solve_review": {
      if (match.phaseEndsAt === null || now < match.phaseEndsAt) return match;
      return finishSolve(match, now);
    }

    case "set_result": {
      if (match.phaseEndsAt === null || now < match.phaseEndsAt) return match;
      const winner = findMatchWinner(match.points, presentIds, targetPoints(match.settings.winCondition));
      if (winner) return finishMatch(match, [winner]);
      if (presentIds.length === 0) return finishMatch(match, []);
      // Otherwise: the next set starts. That needs new scrambles, so the
      // server does it with startNextSet() (see needsNextSet()).
      return match;
    }

    case "match_over":
      return match;
  }
}

/** The current solve is over: the next scramble, or the set result after the last one. */
function finishSolve(match: Match, now: number): Match {
  const isLastSolve = match.solveIndex + 1 >= solvesPerSet(match.settings.format);
  return isLastSolve ? finishSet(match, now) : startSolve(match, match.solveIndex + 1, now);
}

/** True when set_result is over and nobody has won yet: time to start the next set. */
export function needsNextSet(match: Match, now: number): boolean {
  return match.phase === "set_result" && match.phaseEndsAt !== null && now >= match.phaseEndsAt;
}

/** The next moment something becomes due (so the server knows when to call tickMatch). */
export function nextMatchDeadline(match: Match): number | null {
  if (match.phase === "solving") {
    return match.solveDeadline === null ? null : match.solveDeadline + match.timing.submitGraceMs;
  }
  if (match.phase === "solve_review" || match.phase === "set_result") {
    return match.phaseEndsAt;
  }
  return null;
}

function finishSet(match: Match, now: number): Match {
  const standings: Record<string, SetStanding> = {};
  const results: Record<string, SolveResult[]> = {};
  for (const id of match.roster) {
    // The last solve is done, so every slot has a result.
    results[id] = match.results[id] as SolveResult[];
    standings[id] = setStanding(results[id], match.settings.format);
  }

  // Handicap: each player's pace going into this set; whoever beats theirs by the most wins.
  const paces = match.settings.scoring === "handicap" ? currentPaces(match) : null;
  const winnerIds = paces ? handicapWinners(standings, paces) : setWinners(standings);
  const points = { ...match.points };
  for (const id of winnerIds) {
    points[id] += 1;
  }

  return {
    ...match,
    phase: "set_result",
    points,
    finishedSets: [
      ...match.finishedSets,
      { setIndex: match.setIndex, roster: match.roster, results, standings, winnerIds, paces },
    ],
    phaseEndsAt: now + match.timing.setResultMs,
    solveDeadline: null,
  };
}

// ---------------------------------------------------------------------------
// Ending
// ---------------------------------------------------------------------------

/** The host ends the match now (e.g. in unlimited mode). The point leaders win. */
export function endMatch(match: Match, presentIds: string[]): MatchUpdate {
  if (match.phase === "match_over") {
    return fail("The match is already over.");
  }
  return ok(finishMatch(match, pointLeaders(match.points, presentIds)));
}

function finishMatch(match: Match, winnerIds: string[]): Match {
  return { ...match, phase: "match_over", winnerIds, phaseEndsAt: null, solveDeadline: null };
}

// ---------------------------------------------------------------------------
// For snapshots
// ---------------------------------------------------------------------------

/** Each roster player's set result so far (null until all their solves in this set are in). */
export function currentStandings(match: Match): Record<string, SetStanding | null> {
  const standings: Record<string, SetStanding | null> = {};
  for (const id of match.roster) {
    const row = match.results[id];
    standings[id] = row.every((r) => r !== null) ? setStanding(row as SolveResult[], match.settings.format) : null;
  }
  return standings;
}

/** Handicap: each roster player's pace for the current set (null = no finished set yet). */
export function currentPaces(match: Match): Record<string, number | null> {
  const paces: Record<string, number | null> = {};
  for (const id of match.roster) paces[id] = paceOf(match.finishedSets, id);
  return paces;
}

/** A label for "where the match is". It changes exactly when the phase, solve or set changes. */
export function phaseKey(match: Match | null): string {
  return match ? `${match.matchId}/${match.setIndex}/${match.solveIndex}/${match.phase}` : "lobby";
}
