import { describe, expect, it } from "vitest";
import { SOLVED_FACELETS, applyMoves, type Facelets } from "@cube-racing/shared/cube3";
import { crossDistance, solveCross, solvePair } from "@cube-racing/shared/analysis/search";
import { crossSolved, solvedSlots } from "@cube-racing/shared/analysis/state";

const TURNS = ["U", "R", "F", "D", "L", "B"].flatMap((f) => [f, `${f}2`, `${f}'`]);

/** A small deterministic random generator, so failures can be reproduced. */
function random(seed: number): () => number {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed / 2 ** 31;
  };
}

function randomMoves(rand: () => number, count: number, from = TURNS): string[] {
  return Array.from({ length: count }, () => from[Math.floor(rand() * from.length)]);
}

/** The shortest cross by trying every sequence (only for short ones). */
function bruteForceCross(state: Facelets, maxDepth: number): number {
  let frontier = [state];
  for (let depth = 0; depth <= maxDepth; depth++) {
    if (frontier.some((s) => crossSolved(s, "D"))) return depth;
    frontier = frontier.flatMap((s) => TURNS.map((m) => applyMoves(s, [m])));
  }
  return Infinity;
}

describe("the shortest cross", () => {
  it("solves the cross, as short as trying everything", () => {
    const rand = random(1);
    for (let i = 0; i < 25; i++) {
      const state = applyMoves(SOLVED_FACELETS, randomMoves(rand, 3));
      const moves = solveCross(state);
      expect(crossSolved(applyMoves(state, moves), "D")).toBe(true);
      expect(moves.length).toBe(bruteForceCross(state, 3));
      expect(crossDistance(state)).toBe(moves.length);
    }
  });

  it("is at most 8 moves on full scrambles", () => {
    const rand = random(2);
    for (let i = 0; i < 200; i++) {
      const state = applyMoves(SOLVED_FACELETS, randomMoves(rand, 25));
      const moves = solveCross(state);
      expect(moves.length).toBeLessThanOrEqual(8);
      expect(crossSolved(applyMoves(state, moves), "D")).toBe(true);
    }
  });
});

describe("the shortest F2L pair", () => {
  it("solves the pair and keeps the cross and the other solved pairs", () => {
    const rand = random(3);
    const started = performance.now();
    let longest = 0;
    for (let i = 0; i < 30; i++) {
      // A random F2L state: scramble, then solve the cross.
      let state = applyMoves(SOLVED_FACELETS, randomMoves(rand, 25));
      state = applyMoves(state, solveCross(state));
      const open = [0, 1, 2, 3].filter((s) => !solvedSlots(state, "D").includes(s));
      if (open.length === 0) continue;
      const slot = open[0];
      const keep = solvedSlots(state, "D");
      const t = performance.now();
      const solution = solvePair(state, slot, keep);
      longest = Math.max(longest, performance.now() - t);
      expect(solution.complete).toBe(true);
      const after = applyMoves(state, solution.moves);
      expect(crossSolved(after, "D")).toBe(true);
      expect(solvedSlots(after, "D")).toEqual(expect.arrayContaining([slot, ...keep]));
      expect(solution.moves.length).toBeLessThanOrEqual(14);
    }
    console.log(`30 pairs in ${Math.round(performance.now() - started)} ms, slowest ${Math.round(longest)} ms`);
  });
});
