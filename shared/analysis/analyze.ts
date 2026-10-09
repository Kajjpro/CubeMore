/*
 * ANALYZING ONE SMART CUBE SOLVE (CFOP, any cross color).
 *
 * The solve is replayed move by move. For every face as the cross face we know
 * how far CFOP got after each move (state.ts: cross, pairs, oriented, solved).
 * The cross face is the one whose F2L was finished first. Each stage ends at
 * the first move where its step is reached; the moves and the time between
 * two stage ends belong to the stage.
 */

import { FACES, SOLVED_FACELETS, applyMove, isSolved, parseMoves, simplifyMoves, type Face, type Facelets } from "../cube3";
import { buildAdvice } from "./advice";
import { levelOf, nextLevel } from "./benchmarks";
import { recognizeOll, recognizePll } from "./cases";
import { crossFrame, inFrame, slotColors, slotFrame } from "./frame";
import { crossDistance, solveCross, solvePair } from "./search";
import { OPPOSITE, progress, solvedSlots } from "./state";
import { ANALYSIS_VERSION, type CrossInfo, type LastLayerInfo, type PairInfo, type SolveAnalysis, type StageId, type StageSplit } from "./types";

const STAGES: StageId[] = ["cross", "pair1", "pair2", "pair3", "pair4", "oll", "pll"];

export class AnalysisError extends Error {}

export function analyzeSolve(scramble: string, moves: string[], times: number[]): SolveAnalysis {
  if (moves.length === 0 || moves.length !== times.length) throw new AnalysisError("No moves to analyze.");
  const start = applyMovesSafe(SOLVED_FACELETS, parseMoves(scramble));
  // states[i + 1] is the state after move i; states[0] the scrambled cube.
  const states: Facelets[] = [start];
  for (const move of moves) states.push(applyMove(states[states.length - 1], move));
  if (!isSolved(states[states.length - 1])) throw new AnalysisError("The cube isn't solved at the end.");

  const crossFace = findCrossFace(states);
  // reached[k] = the move index at which CFOP progress k was first reached (-1: before the first move).
  const levels = states.map((s) => progress(s, crossFace));
  const reached = [1, 2, 3, 4, 5, 6, 7].map((k) => levels.findIndex((l) => l >= k) - 1);
  reached[6] = moves.length - 1;

  const stages: StageSplit[] = STAGES.map((stage, i) => split(stage, i === 0 ? -1 : reached[i - 1], reached[i], moves, times));
  const timeMs = times[times.length - 1];
  const totalMoves = simplifyMoves(moves).length;

  const cross = crossInfo(start, crossFace, reached[1] === reached[0]);
  const pairs = STAGES.slice(1, 5).map((stage, i) => pairInfo(stage, states[reached[i] + 1], states[reached[i + 1] + 1], crossFace));
  const lastFace = OPPOSITE[crossFace];
  const oll = lastLayer(
    recognizeOll(states[reached[4] + 1], crossFace),
    countLooks(stages[5], moves, times, lastFace, (i) => levels[i + 1] === 5),
  );
  const pll = lastLayer(
    recognizePll(states[reached[5] + 1], crossFace),
    countLooks(stages[6], moves, times, lastFace, (i) => levels[i + 1] === 6),
  );

  const analysis: SolveAnalysis = {
    version: ANALYSIS_VERSION,
    timeMs,
    moves: totalMoves,
    tps: timeMs > 0 ? round2(totalMoves / (timeMs / 1000)) : 0,
    level: levelOf(timeMs).id,
    target: nextLevel(timeMs).id,
    stages,
    cross,
    pairs,
    oll,
    pll,
    advice: [],
  };
  analysis.advice = buildAdvice(analysis);
  return analysis;
}

function applyMovesSafe(state: Facelets, moves: string[]): Facelets {
  return moves.reduce(applyMove, state);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The face whose F2L got done first (then whose 3 pairs, 2, 1, cross). The real
 * cross face finishes F2L before the end; the other faces only at the very end.
 */
function findCrossFace(states: Facelets[]): Face {
  let best: { face: Face; key: number[] } | null = null;
  for (const face of FACES) {
    const levels = states.map((s) => progress(s, face));
    const key = [5, 4, 3, 2, 1].map((k) => levels.findIndex((l) => l >= k));
    if (!best || compare(key, best.key) < 0) best = { face, key };
  }
  return best!.face;
}

function compare(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

function split(stage: StageId, fromMove: number, toMove: number, moves: string[], times: number[]): StageSplit {
  const startMs = fromMove >= 0 ? times[fromMove] : 0;
  const endMs = toMove >= 0 ? times[toMove] : 0;
  const stageMoves = moves.slice(fromMove + 1, toMove + 1);
  // The cross starts with inspection: its first move is the start of the clock.
  const recognitionMs = stageMoves.length === 0 || stage === "cross" ? 0 : times[fromMove + 1] - startMs;
  const executionMs = Math.max(0, endMs - startMs - recognitionMs);
  let longestPauseMs = 0;
  for (let i = fromMove + 2; i <= toMove; i++) longestPauseMs = Math.max(longestPauseMs, times[i] - times[i - 1]);
  const count = simplifyMoves(stageMoves).length;
  return {
    stage,
    fromMove,
    toMove,
    startMs,
    endMs,
    recognitionMs,
    executionMs,
    moves: count,
    tps: executionMs > 0 ? round2(count / (executionMs / 1000)) : 0,
    longestPauseMs,
  };
}

function crossInfo(start: Facelets, face: Face, xcross: boolean): CrossInfo {
  const frame = crossFrame(face);
  const optimal = solveCross(inFrame(start, frame));
  const byColor = Object.fromEntries(FACES.map((f) => [f, crossDistance(inFrame(start, crossFrame(f)))])) as Record<Face, number>;
  return { face, optimal: optimal.join(" "), optimalMoves: optimal.length, front: frame.front, byColor, xcross };
}

function pairInfo(stage: StageId, before: Facelets, after: Facelets, crossFace: Face): PairInfo {
  const had = solvedSlots(before, crossFace);
  const added = solvedSlots(after, crossFace).filter((s) => !had.includes(s));
  const slots = added.map((s) => slotColors(after, crossFace, s));
  // Only one new pair (not built together with another): find its shortest solution.
  if (added.length !== 1) return { stage, slots, optimal: null, optimalMoves: null };
  const frame = slotFrame(crossFace, slots[0]);
  const held = inFrame(before, frame);
  // The pair's slot in the held view (front right).
  const target = [0, 1, 2, 3].find((s) => sameColors(slotColors(held, "D", s), slots[0]));
  if (target === undefined) return { stage, slots, optimal: null, optimalMoves: null };
  const solution = solvePair(held, target, solvedSlots(held, "D"));
  return solution.complete
    ? { stage, slots, optimal: solution.moves.join(" "), optimalMoves: solution.moves.length }
    : { stage, slots, optimal: null, optimalMoves: null };
}

const sameColors = (a: string, b: string) => a.length === b.length && [...a].every((c) => b.includes(c));

function lastLayer(found: ReturnType<typeof recognizeOll>, looks: number): LastLayerInfo {
  if (!found) return { caseId: null, name: null, alg: null, preAuf: "", skip: true, looks: 0 };
  return { caseId: found.case.id, name: found.case.name, alg: found.case.alg, preAuf: found.preAuf, skip: false, looks };
}

/**
 * How many algorithms a last-layer stage took: each time the stage is "between
 * algorithms" (F2L intact, not done, after a non-U turn) and the solver then
 * pauses, a new look began. A pause is long for this solver's own pace.
 */
function countLooks(stage: StageSplit, moves: string[], times: number[], lastFace: Face, intact: (i: number) => boolean): number {
  if (stage.toMove - stage.fromMove <= 0) return 0;
  const gaps: number[] = [];
  for (let i = stage.fromMove + 2; i <= stage.toMove; i++) gaps.push(times[i] - times[i - 1]);
  const median = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)] ?? 0;
  const pause = Math.max(300, median * 2.5);
  let looks = 1;
  for (let i = stage.fromMove + 1; i < stage.toMove; i++) {
    if (moves[i][0] === lastFace) continue; // an AUF keeps everything intact
    if (intact(i) && times[i + 1] - times[i] >= pause) looks++;
  }
  return looks;
}
