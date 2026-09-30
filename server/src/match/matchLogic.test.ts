import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Penalty, type RoomSettings, type Scramble } from "@cube-racing/shared";
import {
  changePenalty,
  createMatch,
  endMatch,
  needsNextSet,
  removeFromMatch,
  skipPlayer,
  startNextSet,
  submitSolve,
  tickMatch,
  type MatchUpdate,
} from "./matchLogic";
import { solvesPerSet } from "./scoring";
import type { Match, MatchTiming } from "./types";

const timing: MatchTiming = { solveReviewMs: 3_000, setResultMs: 6_000, submitGraceMs: 6_000 };

function scramblesFor(settings: RoomSettings): Scramble[] {
  return Array.from({ length: solvesPerSet(settings.format) }, (_, i) => ({
    cubeEvent: settings.cubeEvent,
    text: `R U R' U${i}`,
  }));
}

function startMatch(roster: string[], overrides: Partial<RoomSettings> = {}): Match {
  const settings = { ...DEFAULT_SETTINGS, ...overrides };
  return createMatch({ matchId: "m1", settings, timing, roster, scrambles: scramblesFor(settings), now: 0 });
}

function ok(update: MatchUpdate): Match {
  if (!update.ok) throw new Error(`Expected ok, got: ${update.error}`);
  return update.match;
}

/** Submits a time for the CURRENT solve. */
function submit(match: Match, id: string, timeMs: number, penalty: Penalty = "OK", now = 1_000): Match {
  const { matchId, setIndex, solveIndex } = match;
  return ok(submitSolve(match, id, { matchId, setIndex, solveIndex, timeMs, penalty }, now));
}

/** Everyone listed submits for the current solve, then the review screen runs out. */
function playSolve(match: Match, times: Record<string, number>, present = Object.keys(times)): Match {
  for (const [id, time] of Object.entries(times)) {
    match = submit(match, id, time);
  }
  expect(match.phase).toBe("solve_review");
  return tickMatch(match, match.phaseEndsAt!, present);
}

/** Plays a whole set: every player gets the same time on every solve. */
function playSet(match: Match, times: Record<string, number>, present = Object.keys(times)): Match {
  const count = solvesPerSet(match.settings.format);
  for (let i = 0; i < count; i++) {
    match = playSolve(match, times, present);
  }
  expect(match.phase).toBe("set_result");
  return match;
}

/** set_result runs out, then the next set starts with `roster`. */
function nextSet(match: Match, roster: string[], present = roster): Match {
  match = tickMatch(match, match.phaseEndsAt!, present);
  expect(needsNextSet(match, match.phaseEndsAt!)).toBe(true);
  return ok(startNextSet(match, roster, scramblesFor(match.settings), match.phaseEndsAt!));
}

describe("a solve", () => {
  it("starts with the first scramble and no results", () => {
    const match = startMatch(["a", "b"]);
    expect(match).toMatchObject({ phase: "solving", setIndex: 0, solveIndex: 0, roster: ["a", "b"] });
    expect(match.results.a).toEqual([null, null, null, null, null]);
  });

  it("only moves on when every roster player has a result", () => {
    let match = startMatch(["a", "b"]);
    match = submit(match, "a", 10_000);
    expect(match.phase).toBe("solving");
    match = submit(match, "b", 11_000);
    expect(match.phase).toBe("solve_review");
  });

  it("shows the review for 3 seconds, then the next solve", () => {
    let match = startMatch(["a"]);
    match = submit(match, "a", 10_000, "OK", 5_000);
    expect(tickMatch(match, 7_999, ["a"])).toBe(match); // not due yet: nothing happens
    match = tickMatch(match, 8_000, ["a"]);
    expect(match).toMatchObject({ phase: "solving", solveIndex: 1 });
  });

  it("ignores a duplicate submission, but still answers ok", () => {
    let match = startMatch(["a", "b"]);
    match = submit(match, "a", 10_000);
    const again = submitSolve(match, "a", { matchId: "m1", setIndex: 0, solveIndex: 0, timeMs: 99_000, penalty: "DNF" }, 2_000);
    expect(again).toEqual({ ok: true, match }); // same object: nothing changed
  });

  it("ignores a duplicate for a solve that has already moved on", () => {
    let match = playSolve(startMatch(["a"]), { a: 10_000 });
    expect(match.solveIndex).toBe(1);
    const late = submitSolve(match, "a", { matchId: "m1", setIndex: 0, solveIndex: 0, timeMs: 10_000, penalty: "OK" }, 9_000);
    expect(late).toEqual({ ok: true, match });
  });

  it("refuses a submission for a solve that isn't current", () => {
    const match = startMatch(["a", "b"]);
    const base = { timeMs: 10_000, penalty: "OK" as const };
    const cases = [
      { matchId: "old-match", setIndex: 0, solveIndex: 0 },
      { matchId: "m1", setIndex: 1, solveIndex: 0 }, // a set that hasn't started
      { matchId: "m1", setIndex: 0, solveIndex: 1 }, // a solve that hasn't started
    ];
    for (const solveId of cases) {
      const result = submitSolve(match, "a", { ...solveId, ...base }, 1_000);
      expect(result).toMatchObject({ ok: false, code: "NOT_CURRENT" });
    }
  });

  it("refuses a submission for a solve from an earlier set", () => {
    let match = playSet(startMatch(["a", "b"], { format: "single", winCondition: "bo3" }), { a: 10_000, b: 11_000 });
    match = nextSet(match, ["a", "b"]);
    const old = submitSolve(match, "a", { matchId: "m1", setIndex: 0, solveIndex: 0, timeMs: 1, penalty: "OK" }, 20_000);
    expect(old).toMatchObject({ ok: false, code: "NOT_CURRENT" });
  });

  it("lets players change the penalty until the set result is shown", () => {
    let match = startMatch(["a", "b"], { format: "single" });
    match = submit(match, "a", 10_000);
    match = ok(changePenalty(match, "a", { matchId: "m1", setIndex: 0, solveIndex: 0, penalty: "+2" }));
    expect(match.results.a[0]).toMatchObject({ penalty: "+2" });

    match = submit(match, "b", 11_000);
    expect(match.phase).toBe("solve_review");
    match = ok(changePenalty(match, "b", { matchId: "m1", setIndex: 0, solveIndex: 0, penalty: "DNF" }));

    match = tickMatch(match, match.phaseEndsAt!, ["a", "b"]);
    expect(match.phase).toBe("set_result");
    const tooLate = changePenalty(match, "a", { matchId: "m1", setIndex: 0, solveIndex: 0, penalty: "OK" });
    expect(tooLate).toMatchObject({ ok: false, code: "NOT_CURRENT" });
  });
});

describe("nobody can block the room", () => {
  it("a player removed mid-set doesn't block the solve, and their earlier times still count", () => {
    let match = startMatch(["a", "b", "c"]);
    match = playSolve(match, { a: 10_000, b: 11_000, c: 12_000 });

    match = submit(match, "a", 10_000);
    match = removeFromMatch(match, "b", 5_000); // b leaves during solve 2
    match = submit(match, "c", 12_000);
    expect(match.phase).toBe("solve_review");

    expect(match.results.b[0]).toMatchObject({ timeMs: 11_000, source: "submitted" }); // still counts
    expect(match.results.b.slice(1)).toEqual(
      Array(4).fill({ timeMs: 0, penalty: "DNF", source: "removed" }),
    );
  });

  it("the time limit gives a DNF to everyone still solving", () => {
    let match = startMatch(["a", "b"], { solveTimeLimit: 1 });
    expect(match.solveDeadline).toBe(60_000);
    match = submit(match, "a", 10_000);

    // During the grace period nothing happens (a stopped time may still be on its way).
    expect(tickMatch(match, 60_000 + timing.submitGraceMs - 1, ["a", "b"])).toBe(match);

    match = tickMatch(match, 60_000 + timing.submitGraceMs, ["a", "b"]);
    expect(match.results.b[0]).toMatchObject({ penalty: "DNF", source: "timeout" });
    expect(match.phase).toBe("solve_review");
  });

  it("the host can skip a player", () => {
    let match = startMatch(["a", "b"]);
    match = submit(match, "a", 10_000);
    match = ok(skipPlayer(match, "b", 2_000));
    expect(match.results.b[0]).toMatchObject({ penalty: "DNF", source: "skipped" });
    expect(match.phase).toBe("solve_review");
  });

  it("a player who got an automatic DNF can't overwrite it", () => {
    let match = startMatch(["a", "b"]);
    match = ok(skipPlayer(match, "b", 2_000));
    const late = submitSolve(match, "b", { matchId: "m1", setIndex: 0, solveIndex: 0, timeMs: 9_000, penalty: "OK" }, 3_000);
    expect(late).toMatchObject({ ok: false, code: "NOT_CURRENT" });
  });
});

describe("sets and rosters", () => {
  it("a late joiner is not in the roster until the next set", () => {
    let match = startMatch(["a", "b"], { format: "single" });
    const late = submitSolve(match, "d", { matchId: "m1", setIndex: 0, solveIndex: 0, timeMs: 9_000, penalty: "OK" }, 1_000);
    expect(late).toMatchObject({ ok: false, code: "NOT_CURRENT" });

    match = playSet(match, { a: 10_000, b: 11_000 });
    match = nextSet(match, ["a", "b", "d"]);
    expect(match.roster).toEqual(["a", "b", "d"]);
    expect(match.points.d).toBe(0);
    expect(submit(match, "d", 9_000).results.d[0]).toMatchObject({ timeMs: 9_000 });
  });

  it("gives the set winner a point", () => {
    const match = playSet(startMatch(["a", "b"]), { a: 10_000, b: 11_000 });
    expect(match.points).toEqual({ a: 1, b: 0 });
    expect(match.finishedSets[0]).toMatchObject({
      winnerIds: ["a"],
      standings: { a: { result: 10_000, best: 10_000 }, b: { result: 11_000, best: 11_000 } },
    });
  });

  it("gives nobody a point when everyone's set result is DNF", () => {
    let match = startMatch(["a", "b"], { format: "single" });
    match = submit(match, "a", 0, "DNF");
    match = submit(match, "b", 0, "DNF");
    match = tickMatch(match, match.phaseEndsAt!, ["a", "b"]);
    expect(match.phase).toBe("set_result");
    expect(match.points).toEqual({ a: 0, b: 0 });
  });
});

describe("winning the match", () => {
  it("bo3 ends when a player reaches 2 points", () => {
    let match = playSet(startMatch(["a", "b"], { format: "single", winCondition: "bo3" }), { a: 10_000, b: 11_000 });
    match = nextSet(match, ["a", "b"]);
    match = playSet(match, { a: 10_000, b: 11_000 });
    expect(match.points).toEqual({ a: 2, b: 0 });

    // The set result is shown for 6 seconds first...
    expect(match.phase).toBe("set_result");
    match = tickMatch(match, match.phaseEndsAt!, ["a", "b"]);
    expect(match).toMatchObject({ phase: "match_over", winnerIds: ["a"] });
  });

  it("keeps playing sets while players are tied at the target", () => {
    // bo1: target 1. A tie on the set gives both a point: 1-1, so play on.
    let match = playSet(startMatch(["a", "b"], { format: "single", winCondition: "bo1" }), { a: 10_000, b: 10_000 });
    expect(match.points).toEqual({ a: 1, b: 1 });
    match = tickMatch(match, match.phaseEndsAt!, ["a", "b"]);
    expect(match.phase).toBe("set_result");
    expect(needsNextSet(match, match.phaseEndsAt!)).toBe(true);

    match = ok(startNextSet(match, ["a", "b"], scramblesFor(match.settings), match.phaseEndsAt!));
    match = playSet(match, { a: 12_000, b: 10_000 });
    match = tickMatch(match, match.phaseEndsAt!, ["a", "b"]);
    expect(match).toMatchObject({ phase: "match_over", winnerIds: ["b"] });
  });

  it("unlimited never ends by itself; the host ends it and the leader wins", () => {
    let match = playSet(startMatch(["a", "b"], { format: "single", winCondition: "unlimited" }), { a: 10_000, b: 11_000 });
    match = tickMatch(match, match.phaseEndsAt!, ["a", "b"]);
    expect(match.phase).toBe("set_result");
    match = ok(endMatch(match, ["a", "b"]));
    expect(match).toMatchObject({ phase: "match_over", winnerIds: ["a"] });
  });

  it("a player who left can't win; the match ends if nobody is left", () => {
    let match = playSet(startMatch(["a"], { format: "single", winCondition: "bo1" }), { a: 10_000 });
    match = tickMatch(match, match.phaseEndsAt!, []);
    expect(match).toMatchObject({ phase: "match_over", winnerIds: [] });
  });
});

describe("handicap scoring", () => {
  it("set 1 sets everyone's pace (no points); then the biggest gain over your own pace wins", () => {
    let match = startMatch(["fast", "slow"], { format: "ao5", scoring: "handicap" });
    match = playSet(match, { fast: 10_000, slow: 25_000 });
    expect(match.finishedSets[0].winnerIds).toEqual([]); // the pace set
    expect(match.finishedSets[0].paces).toEqual({ fast: null, slow: null });
    expect(match.points).toEqual({ fast: 0, slow: 0 });

    match = nextSet(match, ["fast", "slow"]);
    // fast is 5% under their pace, slow 12% under theirs: slow wins set 2.
    match = playSet(match, { fast: 9_500, slow: 22_000 });
    expect(match.finishedSets[1].paces).toEqual({ fast: 10_000, slow: 25_000 });
    expect(match.finishedSets[1].winnerIds).toEqual(["slow"]);
    expect(match.points).toEqual({ fast: 0, slow: 1 });
  });

  it("normal rooms keep fastest-wins scoring", () => {
    const match = playSet(startMatch(["fast", "slow"]), { fast: 10_000, slow: 25_000 });
    expect(match.finishedSets[0]).toMatchObject({ winnerIds: ["fast"], paces: null });
  });
});
