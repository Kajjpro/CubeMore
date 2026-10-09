/*
 * DEVELOPMENT ONLY: a CFOP solution for a scramble, the way a person would
 * solve it (shortest cross, each pair, OLL, PLL), as the face turns a smart
 * cube reports. With ?simcube=1 the analyzer can then be tried end to end:
 *
 *   await __cubemoreDev.solve(pauseMs)   // scrambles the keyboard cube and solves it
 */

import { SOLVED_FACELETS, applyMoves, isSolved, parseMoves, type Face } from "@cube-racing/shared/cube3";
import { recognizeOll, recognizePll } from "@cube-racing/shared/analysis/cases";
import { crossFrame, inFrame, toCubeMoves } from "@cube-racing/shared/analysis/frame";
import { toFaceTurns } from "@cube-racing/shared/analysis/notation";
import { solveCross, solvePair } from "@cube-racing/shared/analysis/search";
import { solvedSlots } from "@cube-racing/shared/analysis/state";

/** Stages of a CFOP solution (cube's own move names). */
export function cfopSolution(scramble: string, crossFace: Face = "D"): string[][] {
  const frame = crossFrame(crossFace);
  let held = inFrame(applyMoves(SOLVED_FACELETS, parseMoves(scramble)), frame);
  const stages: string[][] = [];
  const add = (moves: string[]) => {
    stages.push(toCubeMoves(moves, frame));
    held = applyMoves(held, moves);
  };
  add(solveCross(held));
  while (solvedSlots(held, "D").length < 4) {
    const open = [0, 1, 2, 3].find((s) => !solvedSlots(held, "D").includes(s))!;
    add(solvePair(held, open, solvedSlots(held, "D")).moves);
  }
  const oll = recognizeOll(held, "D");
  if (oll) add(toFaceTurns(`${oll.preAuf} ${oll.case.alg}`));
  const pll = recognizePll(held, "D");
  if (pll) add(toFaceTurns(`${pll.preAuf} ${pll.case.alg}`));
  const auf = ["U", "U2", "U'"].find((u) => isSolved(applyMoves(held, [u])));
  if (auf) add([auf]);
  return stages.filter((s) => s.length > 0);
}
