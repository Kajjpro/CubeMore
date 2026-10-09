import { describe, expect, it } from "vitest";
import { SOLVED_FACELETS, applyMoves, isSolved, parseMoves } from "@cube-racing/shared/cube3";
import { OLL_CASES, PLL_CASES } from "@cube-racing/shared/analysis/algs";
import { applyAlg, invertAlg } from "@cube-racing/shared/analysis/notation";
import { recognizeOll, recognizePll } from "@cube-racing/shared/analysis/cases";
import { LAYOUTS, crossSolved, progress, solvedSlots } from "@cube-racing/shared/analysis/state";

const U_TURNS = ["", "U", "U2", "U'"];

describe("full notation", () => {
  it("face turns match the smart cube model", () => {
    const alg = "R U R' F2 D' L B2 U'";
    expect(applyAlg(SOLVED_FACELETS, alg)).toBe(applyMoves(SOLVED_FACELETS, parseMoves(alg)));
  });

  it("wide turns, slices and rotations are what they should be", () => {
    const same = (a: string, b: string) => expect(applyAlg(SOLVED_FACELETS, a)).toBe(applyAlg(SOLVED_FACELETS, b));
    same("r", "R M'");
    same("Rw", "r");
    same("x", "R M' L'");
    same("y", "U E' D'");
    same("z", "F S B'");
    same("f", "F S");
    same("u", "U E'");
    same("M2 M2", "");
    same("R2'", "R2");
    same("R3", "R'");
    // Rotations keep the cube solved; a sexy move six times is nothing.
    expect(isSolved(applyAlg(SOLVED_FACELETS, "x y z2"))).toBe(true);
    expect(applyAlg(SOLVED_FACELETS, "(R U R' U') (R U R' U') (R U R' U') (R U R' U') (R U R' U') (R U R' U')")).toBe(SOLVED_FACELETS);
  });
});

/** The case an algorithm solves: its inverse applied to a solved cube, from each angle. */
function caseState(alg: string, preAuf: string): string {
  return applyAlg(applyAlg(SOLVED_FACELETS, invertAlg(alg)), preAuf);
}

/** How many last-layer edges and corners point up (cross on the bottom). */
function orientedCounts(state: string): { edges: number; corners: number } {
  const u = LAYOUTS.D.lastFace; // the 9 U stickers
  const center = state[u[4]];
  const edges = [1, 3, 5, 7].filter((i) => state[u[i]] === center).length;
  const corners = [0, 2, 6, 8].filter((i) => state[u[i]] === center).length;
  return { edges, corners };
}

describe("OLL cases", () => {
  it("there are 57, each keeps F2L and orients the last layer", () => {
    expect(OLL_CASES).toHaveLength(57);
    for (const c of OLL_CASES) {
      const state = caseState(c.alg, "");
      expect(progress(state, "D"), c.id).toBe(5);
      expect(crossSolved(state, "D")).toBe(true);
      expect(solvedSlots(state, "D")).toHaveLength(4);
    }
  });

  it("each case is recognized as itself from every angle", () => {
    for (const c of OLL_CASES) {
      for (const turn of U_TURNS) {
        expect(recognizeOll(caseState(c.alg, turn), "D")?.case.id, `${c.id} ${turn}`).toBe(c.id);
      }
    }
  });

  it("each case has the right shape (dot, line or L, cross)", () => {
    const dots = [1, 2, 3, 4, 17, 18, 19, 20];
    const crosses = [21, 22, 23, 24, 25, 26, 27];
    const cornersDone = [20, 28, 57];
    const cornersOf: Record<number, number> = { 21: 0, 22: 0, 23: 2, 24: 2, 25: 2, 26: 1, 27: 1 };
    for (const c of OLL_CASES) {
      const n = Number(c.id.slice(4));
      const { edges, corners } = orientedCounts(caseState(c.alg, ""));
      expect(edges, c.id).toBe(dots.includes(n) ? 0 : crosses.includes(n) ? 4 : 2);
      if (cornersDone.includes(n)) expect(corners, c.id).toBe(4);
      if (n in cornersOf) expect(corners, c.id).toBe(cornersOf[n]);
    }
  });
});

describe("PLL cases", () => {
  it("there are 21, each keeps the last layer oriented", () => {
    expect(PLL_CASES).toHaveLength(21);
    for (const c of PLL_CASES) {
      const state = caseState(c.alg, "");
      expect(progress(state, "D"), c.id).toBe(6);
    }
  });

  it("each case is recognized as itself from every angle and AUF", () => {
    for (const c of PLL_CASES) {
      for (const pre of U_TURNS) {
        for (const post of U_TURNS) {
          const state = applyAlg(caseState(c.alg, pre), post);
          // After the cube is solved, a U turn is not a PLL case.
          expect(recognizePll(state, "D")?.case.id, `${c.id} ${pre} ${post}`).toBe(c.id);
        }
      }
    }
  });

  it("each case moves the right pieces", () => {
    const moved: Record<string, [number, number]> = {
      Aa: [3, 0], Ab: [3, 0], E: [4, 0], H: [0, 4], Z: [0, 4], Ua: [0, 3], Ub: [0, 3],
      Ga: [3, 3], Gb: [3, 3], Gc: [3, 3], Gd: [3, 3],
      F: [2, 2], Ja: [2, 2], Jb: [2, 2], Ra: [2, 2], Rb: [2, 2], T: [2, 2], V: [2, 2], Y: [2, 2], Na: [2, 2], Nb: [2, 2],
    };
    for (const c of PLL_CASES) {
      const name = c.id.slice(4);
      // One of the 4 AUFs moves exactly these pieces, and none moves fewer.
      const all = U_TURNS.map((t) => movedPieces(applyAlg(caseState(c.alg, ""), t)));
      expect(all, c.id).toContainEqual(moved[name]);
      const fewest = Math.min(...all.map(([a, b]) => a + b));
      expect(fewest, c.id).toBe(moved[name][0] + moved[name][1]);
    }
  });
});

/** Last-layer corners and edges not in their solved place (cross on the bottom). */
function movedPieces(state: string): [number, number] {
  const solved = SOLVED_FACELETS;
  // The U layer's cubies (facelet indexes of their stickers).
  const cornerCubies = [[0, 36, 47], [2, 45, 11], [6, 18, 38], [8, 9, 20]];
  const edgeCubies = [[1, 46], [3, 37], [5, 10], [7, 19]];
  const off = (cubies: number[][]) => cubies.filter((c) => c.some((i) => state[i] !== solved[i])).length;
  return [off(cornerCubies), off(edgeCubies)];
}
