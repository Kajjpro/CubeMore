import { describe, expect, it } from "vitest";
import { FACES, SOLVED_FACELETS, applyMoves, isSolved } from "@cube-racing/shared/cube3";
import { analyzeSolve, summarizeSession, type SolveAnalysis } from "@cube-racing/shared/analysis";
import { OLL_CASES, PLL_CASES } from "@cube-racing/shared/analysis/algs";
import { aufOnly, recognizePll } from "@cube-racing/shared/analysis/cases";
import { applyAlg, invertAlg, toFaceTurns } from "@cube-racing/shared/analysis/notation";
import { crossSolved } from "@cube-racing/shared/analysis/state";
import { buildSolve } from "./fixtures";

describe("full notation as smart cube turns", () => {
  it("every OLL and PLL algorithm, turned into face turns, still solves its case", () => {
    for (const c of [...OLL_CASES, ...PLL_CASES]) {
      const state = applyAlg(SOLVED_FACELETS, invertAlg(c.alg));
      expect(isSolved(applyMoves(state, toFaceTurns(c.alg))), c.id).toBe(true);
    }
  });

  it("wide turns, slices and rotations in any order", () => {
    for (const alg of ["u R u'", "d' F d", "b L' b'", "E R E'", "y R U R' y'", "z U z'", "x' M2 x", "S2 F S2"]) {
      const viaNotation = applyAlg(SOLVED_FACELETS, alg);
      const viaTurns = applyMoves(SOLVED_FACELETS, toFaceTurns(alg));
      // Both are the same cube; the notation one may be turned as a whole.
      expect(["", "x", "x2", "x'", "y", "y2", "y'", "z", "z'", "z2"].some((r) => applyAlg(viaNotation, r) === viaTurns), alg).toBe(true);
    }
  });
});

describe("analyzing a CFOP solve", () => {
  it("finds the cross color and every stage, on all 6 cross colors", () => {
    FACES.forEach((face, i) => {
      const built = buildSolve(10 + i, face);
      const analysis = analyzeSolve(built.scramble, built.moves, built.times);
      expect(analysis.cross.face).toBe(face);
      expect(analysis.stages.map((s) => s.toMove)).toEqual(built.ends);
      expect(analysis.oll.caseId).toBe(built.oll);
      expect(analysis.pll.caseId).toBe(built.pll);
      expect(analysis.timeMs).toBe(built.times[built.times.length - 1]);
      // The cross was the shortest one: nothing to improve there.
      expect(analysis.stages[0].moves).toBe(analysis.cross.optimalMoves);
      expect(analysis.advice.some((a) => a.kind === "cross-moves")).toBe(false);
      // Every pair was the shortest one too.
      for (const pair of analysis.pairs) {
        if (pair.optimalMoves !== null) expect(analysis.stages.find((s) => s.stage === pair.stage)!.moves).toBeLessThanOrEqual(pair.optimalMoves + 1);
      }
      if (built.oll) expect(analysis.oll.looks).toBe(1);
    });
  });

  it("measures the pauses as recognition", () => {
    const built = buildSolve(30, "D", { pauseMs: 900 });
    const analysis = analyzeSolve(built.scramble, built.moves, built.times);
    const oll = analysis.stages.find((s) => s.stage === "oll")!;
    if (!analysis.oll.skip) expect(oll.recognitionMs).toBe(900);
    expect(analysis.stages[0].recognitionMs).toBe(0);
  });

  it("notices a 2-look OLL and suggests the one-look algorithm", () => {
    for (let seed = 40; seed < 60; seed++) {
      const built = buildSolve(seed, "D", { twoLookOll: true });
      const plain = buildSolve(seed, "D");
      if (!plain.oll || plain.oll === "OLL 45") continue;
      const analysis = analyzeSolve(built.scramble, built.moves, built.times);
      if (built.oll === null) continue; // the first algorithm happened to finish OLL
      expect(analysis.oll.looks).toBe(2);
      expect(analysis.oll.caseId).toBe(plain.oll);
      expect(analysis.advice.find((a) => a.kind === "oll-two-look")?.title).toContain(plain.oll);
      return;
    }
    throw new Error("no 2-look case found");
  });

  it("suggests a shorter cross, and the suggested moves really solve it", () => {
    const built = buildSolve(70, "D");
    // A wasteful cross: (R U R' U') six times first, which changes nothing but costs 24 moves.
    const wasted = Array(6).fill(["R", "U", "R'", "U'"]).flat() as string[];
    const moves = [...wasted, ...built.moves];
    const times = [...wasted.map((_, i) => i * 100), ...built.times.map((t) => t + wasted.length * 100)];
    const analysis = analyzeSolve(built.scramble, moves, times);
    const advice = analysis.advice.find((a) => a.kind === "cross-moves");
    expect(advice).toBeDefined();
    // Show it: from the scramble, the rotation then the moves give a solved cross.
    const shown = applyAlg(applyMoves(SOLVED_FACELETS, built.scramble.split(" ")), advice!.show!.alg);
    expect(crossSolved(shown, "D")).toBe(true);
  });

  it("is fast enough for the browser", () => {
    const built = buildSolve(80, "U");
    const started = performance.now();
    analyzeSolve(built.scramble, built.moves, built.times);
    expect(performance.now() - started).toBeLessThan(1500);
  });
});

describe("an ao5", () => {
  it("averages the stages and keeps the best and worst out of the average", () => {
    const analyses: SolveAnalysis[] = [1, 2, 3, 4, 5].map((s) => {
      const built = buildSolve(100 + s, "D", { pauseMs: 300 * s });
      return analyzeSolve(built.scramble, built.moves, built.times);
    });
    const summary = summarizeSession(analyses);
    const sorted = analyses.map((a) => a.timeMs).sort((a, b) => a - b);
    expect(summary.count).toBe(5);
    expect(summary.bestMs).toBe(sorted[0]);
    expect(summary.averageMs).toBe(Math.round((sorted[1] + sorted[2] + sorted[3]) / 3));
    expect(summary.stages).toHaveLength(7);
    expect(summary.focus.length).toBeLessThanOrEqual(3);
  });
});

describe("recognition helpers", () => {
  it("a solved cube or one U turn away needs no PLL", () => {
    expect(aufOnly(SOLVED_FACELETS)).toBe(true);
    expect(aufOnly(applyMoves(SOLVED_FACELETS, ["U2"]))).toBe(true);
    expect(recognizePll(applyMoves(SOLVED_FACELETS, ["U"]), "D")).toBeNull();
  });
});
