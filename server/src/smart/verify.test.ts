import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Scramble } from "@cube-racing/shared";
import { invertMoves, parseMoves } from "@cube-racing/shared/cube3";
import { verifySmartSolve, type SmartSolveData } from "@cube-racing/shared/smartSolve";
import { createMatch, submitSolve } from "../match/matchLogic";
import type { MatchTiming } from "../match/types";

const SCRAMBLE = "D2 F' U2 L2 F' R2 B U2 F2 U2 L' D' R B' U L' F2 D' F' R'";
/** R U R' U' six times does nothing, so this solves the scramble without being "the scramble undone". */
const SOLUTION = [...Array(6).fill(parseMoves("R U R' U'")).flat(), ...invertMoves(parseMoves(SCRAMBLE))];

/** Moves evenly spread over `timeMs`. */
function solve(moves: string[], timeMs: number): SmartSolveData {
  return { moves, times: moves.map((_, i) => Math.round(((i + 1) / moves.length) * timeMs)) };
}

describe("verifying a smart cube solve", () => {
  it("accepts moves that really solve the scramble, with the move count and TPS", () => {
    const data = solve(SOLUTION, 9_000);
    expect(verifySmartSolve(SCRAMBLE, 9_000, data)).toEqual({ ok: true, moveCount: 44, tps: 4.89 });
  });

  it("refuses moves that don't solve it", () => {
    const data = solve([...SOLUTION.slice(0, -1), "U"], 9_000);
    expect(verifySmartSolve(SCRAMBLE, 9_000, data)).toMatchObject({ ok: false, reason: "These moves don't solve the scramble." });
  });

  it("refuses extra moves after the cube was solved (the timer must stop at the solve)", () => {
    const data = solve([...SOLUTION, "U", "U'"], 9_000);
    expect(verifySmartSolve(SCRAMBLE, 9_000, data)).toMatchObject({ ok: false, reason: "The cube was solved before the last move." });
  });

  it("refuses a time that isn't the last move's time, and times out of order", () => {
    expect(verifySmartSolve(SCRAMBLE, 8_000, solve(SOLUTION, 9_000))).toMatchObject({ ok: false });
    const shuffled = solve(SOLUTION, 9_000);
    [shuffled.times[3], shuffled.times[4]] = [shuffled.times[4], shuffled.times[3]];
    expect(verifySmartSolve(SCRAMBLE, 9_000, shuffled)).toMatchObject({ ok: false, reason: "The move times are out of order." });
  });

  it("refuses the scramble undone, too few moves, and inhuman speed", () => {
    const undone = invertMoves(parseMoves(SCRAMBLE));
    expect(verifySmartSolve(SCRAMBLE, 9_000, solve(undone, 9_000))).toMatchObject({ ok: false, reason: "That's the scramble undone, not a solve." });
    expect(verifySmartSolve("R U", 2_000, solve(["U'", "R'"], 2_000))).toMatchObject({ ok: false, reason: "Too few moves for a real solve." });
    expect(verifySmartSolve(SCRAMBLE, 2_000, solve(SOLUTION, 2_000))).toMatchObject({ ok: false, reason: "Faster than humanly possible." });
  });
});

describe("smart solves in a match", () => {
  const timing: MatchTiming = { solveReviewMs: 0, setResultMs: 6_000, submitGraceMs: 6_000 };
  const scrambles = { "333": [{ cubeEvent: "333", text: SCRAMBLE } satisfies Scramble] };
  const match = (smartOnly: boolean) =>
    createMatch({
      matchId: "m1",
      settings: { ...DEFAULT_SETTINGS, format: "single", smartOnly },
      timing,
      roster: ["alice", "bob"],
      picks: { alice: "333", bob: "333" },
      scrambles,
      now: 0,
    });
  const solveId = { matchId: "m1", setIndex: 0, solveIndex: 0 };

  it("a verified solve gets its mark, and its moves are kept for the replay", () => {
    const smart = solve(SOLUTION, 9_000);
    const update = submitSolve(match(false), "alice", { ...solveId, timeMs: 9_000, penalty: "OK", smart }, 1);
    if (!update.ok) throw new Error(update.error);
    expect(update.match.results.alice[0]).toEqual({ timeMs: 9_000, penalty: "OK", source: "submitted", verified: { moves: 44, tps: 4.89 } });
    expect(update.match.replays["alice/0"]).toEqual(smart);
  });

  it("smart-cube rooms refuse times without a verified solve (a DNF is fine)", () => {
    const plain = submitSolve(match(true), "alice", { ...solveId, timeMs: 9_000, penalty: "OK" }, 1);
    expect(plain).toMatchObject({ ok: false, error: expect.stringContaining("smart cubes only") });

    const fake = submitSolve(match(true), "alice", { ...solveId, timeMs: 9_000, penalty: "OK", smart: solve(["R", ...SOLUTION], 9_000) }, 1);
    expect(fake).toMatchObject({ ok: false, error: expect.stringContaining("couldn't be verified") });

    expect(submitSolve(match(true), "alice", { ...solveId, timeMs: 0, penalty: "DNF" }, 1).ok).toBe(true);
  });

  it("in a normal room a solve that fails the check still counts, just without the mark", () => {
    const update = submitSolve(match(false), "alice", { ...solveId, timeMs: 9_000, penalty: "OK", smart: solve(["R", ...SOLUTION], 9_000) }, 1);
    if (!update.ok) throw new Error(update.error);
    expect(update.match.results.alice[0]?.verified).toBeUndefined();
    expect(update.match.replays).toEqual({});
  });
});
