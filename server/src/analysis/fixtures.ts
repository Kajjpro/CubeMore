/*
 * Test fixtures: CFOP solves built the way a person would do them, as a smart
 * cube reports them (used by the analyzer and practice tests).
 */

import { expect } from "vitest";
import { FACES, SOLVED_FACELETS, applyMoves, isSolved, type Face, type Facelets } from "@cube-racing/shared/cube3";
import { recognizeOll, recognizePll } from "@cube-racing/shared/analysis/cases";
import { crossFrame, inFrame, toCubeMoves, type Frame } from "@cube-racing/shared/analysis/frame";
import { toFaceTurns } from "@cube-racing/shared/analysis/notation";
import { solveCross, solvePair } from "@cube-racing/shared/analysis/search";
import { solvedSlots } from "@cube-racing/shared/analysis/state";

export const TURNS = FACES.flatMap((f) => [f, `${f}2`, `${f}'`]);

export function random(seed: number): () => number {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed / 2 ** 31;
  };
}

export interface Built {
  scramble: string;
  moves: string[];
  times: number[];
  /** Move index at which each stage ends. */
  ends: number[];
  oll: string | null;
  pll: string | null;
}

/**
 * A CFOP solve the way a person would do it, as a smart cube reports it:
 * the shortest cross, the shortest pair for each slot, then OLL and PLL.
 * 100 ms per move, `pauseMs` before each stage.
 */
export function buildSolve(seed: number, crossFace: Face, options: { pauseMs?: number; twoLookOll?: boolean } = {}): Built {
  const rand = random(seed);
  const scrambleMoves = Array.from({ length: 22 }, () => TURNS[Math.floor(rand() * TURNS.length)]);
  const frame: Frame = crossFrame(crossFace);
  let held: Facelets = inFrame(applyMoves(SOLVED_FACELETS, scrambleMoves), frame);
  const moves: string[] = [];
  const times: number[] = [];
  const ends: number[] = [];
  let clock = 0;
  const pause = options.pauseMs ?? 600;
  const play = (heldMoves: string[], gap = 100) => {
    heldMoves.forEach((m, i) => {
      clock += i === 0 && moves.length > 0 ? gap : 100;
      if (moves.length === 0) clock = 0;
      moves.push(...toCubeMoves([m], frame));
      times.push(clock);
    });
    held = applyMoves(held, heldMoves);
  };

  play(solveCross(held));
  ends.push(moves.length - 1);
  while (solvedSlots(held, "D").length < 4) {
    const open = [0, 1, 2, 3].find((s) => !solvedSlots(held, "D").includes(s))!;
    const solution = solvePair(held, open, solvedSlots(held, "D"));
    play(solution.moves, pause);
    ends.push(moves.length - 1);
  }
  while (ends.length < 5) ends.push(ends[ends.length - 1]);

  const oll = recognizeOll(held, "D");
  if (oll && options.twoLookOll && oll.case.id !== "OLL 45") {
    // Edges first with "F R U R' U' F'" until they're oriented... simply: T then the case left.
    play(toFaceTurns("F R U R' U' F'"), pause);
  }
  const ollNow = recognizeOll(held, "D");
  if (ollNow) play(toFaceTurns(`${ollNow.preAuf} ${ollNow.case.alg}`), pause);
  ends.push(moves.length - 1);
  const pll = recognizePll(held, "D");
  if (pll) play(toFaceTurns(`${pll.preAuf} ${pll.case.alg}`), pause);
  // The last U turn(s).
  const auf = ["U", "U2", "U'"].find((u) => isSolved(applyMoves(held, [u])));
  if (auf) play([auf], 100);
  ends.push(moves.length - 1);
  expect(isSolved(held)).toBe(true);
  return { scramble: scrambleMoves.join(" "), moves, times, ends, oll: ollNow?.case.id ?? null, pll: pll?.case.id ?? null };
}
