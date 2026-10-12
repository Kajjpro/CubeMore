/*
 * CASE TRAINER SCRAMBLES: a normal-looking scramble that lands on one OLL or PLL case.
 *
 * The case is made on a solved cube (shared/analysis/trainer.ts caseSetup: a
 * random angle, and for OLL a random permutation), then cubing.js finds a
 * short way to that state, the same solver as for race scrambles. Its moves
 * look random: they don't give away the algorithm.
 */

import type { Face } from "@cube-racing/shared/cube3";
import { parseMoves } from "@cube-racing/shared/cube3";
import { caseOfState, caseSetup, stateAfter } from "@cube-racing/shared/analysis/trainer";
import { cube3x3x3 } from "cubing/puzzles";
import { experimentalSolve3x3x3IgnoringCenters } from "cubing/search";

/** A scramble for this case with `crossFace` as the cross, or null for an unknown case. */
export async function caseScramble(caseId: string, crossFace: Face, random: () => number = Math.random): Promise<string | null> {
  const setup = caseSetup(caseId, crossFace, random);
  if (!setup) return null;
  const puzzle = await cube3x3x3.kpuzzle();
  const solution = await experimentalSolve3x3x3IgnoringCenters(puzzle.defaultPattern().applyAlg(setup.join(" ")));
  const scramble = solution.invert().toString().replace(/2'/g, "2");
  // Never send a scramble that doesn't make the case (the solver and our cube model must agree).
  const state = stateAfter(parseMoves(scramble));
  if (state !== stateAfter(setup) || caseOfState(state, crossFace) !== caseId) throw new Error(`Case scramble mismatch for ${caseId}`);
  return scramble;
}
