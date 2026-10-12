/*
 * THE CASE TRAINER (/train): which OLL and PLL cases cost you time, and drills
 * that bring them up again and again.
 *
 *   caseTimesFromAnalysis  the OLL and PLL of an analyzed solve, as two case times
 *   caseReport             every case of a step with your numbers, the ones to train first on top
 *   pickNextCase           the next case of a drill: slow and missed cases come back more often
 *   caseSetup              moves that make a case on a solved cube (a random angle, and for
 *                          OLL a random last-layer permutation, like in a real solve)
 *   drillDone              the case is done (OLL: last layer oriented, PLL: cube solved)
 *
 * Pure: the browser and the server use the same code.
 */

import { SOLVED_FACELETS, applyMoves, isSolved, type Face, type Facelets } from "../cube3";
import type { CaseTime, TrainerStep } from "../practice";
import { allCases, caseById, type CaseInfo } from "./caseInfo";
import { TO_BOTTOM, recognizeOll, recognizePll } from "./cases";
import { formatAlg, invertAlg, toFaceTurns } from "./notation";
import { progress } from "./state";
import type { SolveAnalysis } from "./types";

export const stepOf = (caseId: string): TrainerStep => (caseId.startsWith("OLL") ? "oll" : "pll");

/** The whole time of a go at a case. */
export const totalMs = (t: CaseTime): number => (t.recognitionMs ?? 0) + t.executionMs;

/** The OLL and PLL of an analyzed solve (skips and unknown cases left out). */
export function caseTimesFromAnalysis(analysis: SolveAnalysis, at: number): CaseTime[] {
  const out: CaseTime[] = [];
  for (const step of ["oll", "pll"] as const) {
    const info = analysis[step];
    const split = analysis.stages.find((s) => s.stage === step);
    if (!info.caseId || info.skip || !split || split.toMove < 0) continue;
    out.push({
      caseId: info.caseId,
      at,
      source: "solve",
      recognitionMs: split.recognitionMs,
      executionMs: split.executionMs,
      moves: split.moves,
      looks: info.looks >= 2 ? 2 : 1,
      missed: false,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Your cases

/** The newest times of a case that count for its average. */
const RECENT = 10;

export type CaseStatus = "new" | "learning" | "good";

export interface CaseRow {
  info: CaseInfo;
  /** Times of this case (all of them). */
  count: number;
  /** Average of the recent times (best and worst left out from 5 times on), or null with no time. */
  meanMs: number | null;
  recognitionMs: number | null;
  moves: number | null;
  /** Most recent solves of it were done in two algorithms. */
  twoLook: boolean;
  /** Missed in the last 3 drills of it. */
  missed: number;
  /** Compared with your average for the step (ms; positive = slower), or null. */
  slowerMs: number | null;
  status: CaseStatus;
  /** How much training it pays to give this case: its time lost, times how often it comes up. */
  priority: number;
}

export interface CaseReport {
  step: TrainerStep;
  /** All the times of this step. */
  count: number;
  /** Your average for this step (each time counts once), or null. */
  averageMs: number | null;
  /** Every case of the step, the ones to train first on top. */
  rows: CaseRow[];
  /** Up to 5 cases to train first (only cases with a reason to). */
  focus: CaseRow[];
  /** Cases you don't know yet: done in 2 looks in your solves. */
  unknown: CaseRow[];
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  let list = values;
  if (values.length >= 5) list = [...values].sort((a, b) => a - b).slice(1, -1);
  return list.reduce((a, b) => a + b, 0) / list.length;
}

/** Every case of a step with your numbers. `times` may hold both steps and any order. */
export function caseReport(times: CaseTime[], step: TrainerStep): CaseReport {
  const cases = allCases()[step];
  const mine = times.filter((t) => stepOf(t.caseId) === step).sort((a, b) => a.at - b.at);
  const byCase = new Map<string, CaseTime[]>();
  for (const t of mine) byCase.set(t.caseId, [...(byCase.get(t.caseId) ?? []), t]);

  // Your average for the step: the newest 200 times (missed ones don't have a real time).
  const counted = mine.filter((t) => !t.missed);
  const averageMs = average(counted.slice(-200).map(totalMs));

  const rows = cases.map((info): CaseRow => {
    const list = byCase.get(info.id) ?? [];
    const recent = list.slice(-RECENT);
    const timed = recent.filter((t) => !t.missed);
    const meanMs = average(timed.map(totalMs));
    const recognitions = timed.flatMap((t) => (t.recognitionMs === null ? [] : [t.recognitionMs]));
    const moves = timed.flatMap((t) => (t.moves === null ? [] : [t.moves]));
    const solves = recent.filter((t) => t.source === "solve");
    const twoLook = solves.length > 0 && solves.filter((t) => t.looks === 2).length * 2 > solves.length;
    const drills = list.filter((t) => t.source === "drill").slice(-3);
    const missed = drills.filter((t) => t.missed).length;
    const slowerMs = meanMs !== null && averageMs !== null ? meanMs - averageMs : null;

    let status: CaseStatus = "new";
    if (list.length > 0) {
      const lastThree = list.slice(-3);
      const steady = lastThree.length === 3 && lastThree.every((t) => !t.missed && t.looks === 1);
      status = steady && slowerMs !== null && slowerMs <= 0 ? "good" : "learning";
    }

    // Time lost on it in every solve: slower than your average, or a guess for a missed / 2-look case.
    const lostMs = Math.max(slowerMs ?? 0, twoLook || missed > 0 ? (averageMs ?? 2000) * 0.5 : 0);
    const priority = timed.length >= 2 || twoLook || missed > 0 ? lostMs / info.oneIn : 0;

    return {
      info,
      count: list.length,
      meanMs,
      recognitionMs: average(recognitions),
      moves: average(moves),
      twoLook,
      missed,
      slowerMs,
      status,
      priority,
    };
  });

  const order = [...rows].sort((a, b) => b.priority - a.priority || cases.indexOf(a.info) - cases.indexOf(b.info));
  return {
    step,
    count: mine.length,
    averageMs,
    rows: order,
    focus: order.filter((r) => r.priority > 0).slice(0, 5),
    unknown: order.filter((r) => r.twoLook),
  };
}

// ---------------------------------------------------------------------------
// Drills

/**
 * The next case of a drill. Cases never timed come first; then slower cases
 * and missed ones come up more often, and a case you haven't seen for a while
 * comes back. Never the same case twice in a row (unless it's the only one).
 */
export function pickNextCase(set: string[], times: CaseTime[], lastCaseId: string | null, random: () => number = Math.random): string {
  if (set.length === 1) return set[0];
  const recent = new Map<string, CaseTime[]>();
  for (const t of [...times].sort((a, b) => a.at - b.at)) {
    if (set.includes(t.caseId)) recent.set(t.caseId, [...(recent.get(t.caseId) ?? []), t].slice(-5));
  }
  const means = new Map<string, number>();
  for (const [id, list] of recent) {
    const mean = average(list.filter((t) => !t.missed).map(totalMs));
    if (mean !== null) means.set(id, mean);
  }
  const sorted = [...means.values()].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 1;
  // How many goes ago each case was last practised.
  const order = [...times].filter((t) => set.includes(t.caseId)).sort((a, b) => b.at - a.at);

  const weights = set.map((id) => {
    if (id === lastCaseId) return 0;
    const list = recent.get(id);
    if (!list || list.length === 0) return 4;
    const mean = means.get(id);
    let weight = mean === undefined ? 3 : Math.min(4, Math.max(0.3, (mean / median) ** 2));
    weight += 2 * list.slice(-3).filter((t) => t.missed).length;
    const ago = order.findIndex((t) => t.caseId === id);
    if (ago < 0 || ago >= set.length) weight *= 1.5;
    return weight;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let pick = random() * total;
  for (let i = 0; i < set.length; i++) {
    pick -= weights[i];
    if (pick < 0 && weights[i] > 0) return set[i];
  }
  return set.find((id) => id !== lastCaseId) ?? set[0];
}

const U_TURNS = ["", "U", "U2", "U'"];
const pickFrom = <T>(list: T[], random: () => number): T => list[Math.min(list.length - 1, Math.floor(random() * list.length))];

/** A random last-layer permutation (a PLL case, a skip 1 time in 72), as moves that make it. */
function randomPermutation(random: () => number): string {
  const { pll } = allCases();
  // Each case comes up as often as in real solves.
  const weights = [1 / 72, ...pll.map((c) => 1 / c.oneIn)];
  let pick = random() * weights.reduce((a, b) => a + b, 0);
  let index = 0;
  while (index < weights.length - 1 && (pick -= weights[index]) >= 0) index++;
  const turn = pickFrom(U_TURNS, random);
  if (index === 0) return turn;
  return `${turn} ${formatAlg(invertAlg(pll[index - 1].alg))} ${pickFrom(U_TURNS, random)}`;
}

/**
 * Face turns that make this case on a solved cube, held with `crossFace` on the
 * bottom, seen from a random side. An OLL comes with a random permutation of
 * the last layer, as in a real solve. Null for an unknown case id.
 */
export function caseSetup(caseId: string, crossFace: Face, random: () => number = Math.random): string[] | null {
  const info = caseById(caseId);
  if (!info) return null;
  const undo = formatAlg(invertAlg(info.alg));
  const before = pickFrom(U_TURNS, random);
  const setup = info.step === "pll" ? `${pickFrom(U_TURNS, random)} ${undo} ${before}` : `${randomPermutation(random)} ${undo} ${before}`;
  return toFaceTurns(`${TO_BOTTOM[crossFace]} ${setup}`);
}

/** The case a state shows, with this cross (F2L solved), or null. */
export function caseOfState(state: Facelets, crossFace: Face): string | null {
  if (progress(state, crossFace) < 5) return null;
  if (progress(state, crossFace) === 5) return recognizeOll(state, crossFace)?.case.id ?? null;
  return recognizePll(state, crossFace)?.case.id ?? null;
}

/** The state a setup makes from solved. */
export const stateAfter = (moves: string[]): Facelets => applyMoves(SOLVED_FACELETS, moves);

/** A drill of this case is done: OLL when the last layer is oriented (F2L kept), PLL when the cube is solved. */
export function drillDone(state: Facelets, step: TrainerStep, crossFace: Face): boolean {
  return step === "pll" ? isSolved(state) : progress(state, crossFace) >= 6;
}
