/*
 * SUGGESTIONS FOR ONE SOLVE: what would save the most time, in plain words.
 *
 * Each suggestion comes with a rough time it would save (from this solve's own
 * turning speed), so they can be ranked. Comparisons use the next level up
 * (benchmarks.ts): a 22 s solver is compared with typical sub-20 solves.
 */

import { LEVELS, typicalStageMs, type Level } from "./benchmarks";
import { TO_BOTTOM } from "./cases";
import { COLOR_NAMES, crossFrame, slotFrame } from "./frame";
import { parseAlg } from "./notation";
import type { Face } from "../cube3";
import type { Advice, LastLayerInfo, SolveAnalysis, StageSplit } from "./types";

const MAX_ADVICE = 6;
/** Below this, a suggestion isn't worth showing (ms). */
const MIN_SAVED_MS = 150;

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const colorOf = (face: string) => COLOR_NAMES[face as Face];
const pairName = (slots: string[]) => (slots.length === 1 ? `the ${[...slots[0]].map(colorOf).join("-")} pair` : "this pair");
const PAIR_NUMBER: Record<string, string> = { pair1: "first", pair2: "second", pair3: "third", pair4: "fourth" };

export function buildAdvice(analysis: SolveAnalysis): Advice[] {
  const level = LEVELS.find((l) => l.id === analysis.target)!;
  const typical = typicalStageMs(level);
  const stage = (id: string) => analysis.stages.find((s) => s.stage === id)!;
  const turning = analysis.stages.reduce((sum, s) => sum + s.executionMs, 0);
  const turned = analysis.stages.reduce((sum, s) => sum + s.moves, 0);
  const msPerMove = turned > 0 ? turning / turned : 0;
  const msPerMoveIn = (s: StageSplit) => (s.moves > 0 && s.executionMs > 0 ? s.executionMs / s.moves : msPerMove);

  const advice: Advice[] = [];

  // ---- Cross
  const cross = stage("cross");
  const extra = cross.moves - analysis.cross.optimalMoves;
  const frame = crossFrame(analysis.cross.face);
  const held = `${colorOf(analysis.cross.face)} on the bottom, ${colorOf(analysis.cross.front)} in front`;
  if (extra >= 2) {
    const best = Math.min(...Object.values(analysis.cross.byColor));
    const bestColors = Object.entries(analysis.cross.byColor).filter(([, n]) => n === best).map(([f]) => colorOf(f));
    const otherColor =
      best <= analysis.cross.optimalMoves - 2 ? ` On ${bestColors.join(" or ")} it was only ${best} moves.` : "";
    advice.push({
      kind: "cross-moves",
      stage: "cross",
      savedMs: extra * msPerMoveIn(cross),
      title: "Plan a shorter cross",
      detail: `Your cross took ${cross.moves} moves. The shortest for this scramble is ${analysis.cross.optimalMoves}: ${analysis.cross.optimal} (${held}).${otherColor} Plan the whole cross during inspection.`,
      show: { afterMove: -1, alg: `${frame.rotation} ${analysis.cross.optimal}`.trim() },
    });
  } else if (cross.endMs > typical.cross * 1.4) {
    advice.push({
      kind: "cross-time",
      stage: "cross",
      savedMs: cross.endMs - typical.cross,
      title: "Do the cross without stopping",
      detail: `Your cross took ${seconds(cross.endMs)} for ${cross.moves} moves. Typical for ${level.phrase} is about ${seconds(typical.cross)}. Plan every cross move during inspection, then turn it in one go.`,
      show: null,
    });
  }

  // ---- F2L: pairs that took many more moves than needed (the two worst)
  const pairAdvice: Advice[] = [];
  for (const pair of analysis.pairs) {
    if (pair.optimal === null || pair.optimalMoves === null) continue;
    const s = stage(pair.stage);
    const more = s.moves - pair.optimalMoves;
    if (more < 4) continue;
    const pairFrame = slotFrame(analysis.cross.face, pair.slots[0]);
    pairAdvice.push({
      kind: "pair-moves",
      stage: pair.stage,
      savedMs: more * msPerMoveIn(s),
      title: `Solve the ${PAIR_NUMBER[pair.stage]} pair in fewer moves`,
      detail: `You used ${s.moves} moves for ${pairName(pair.slots)}. It can be done in ${pair.optimalMoves}: ${pair.optimal} (slot at front right, ${colorOf(analysis.cross.face)} on the bottom). Look at where both pieces are before you start the pair.`,
      show: { afterMove: s.fromMove, alg: `${pairFrame.rotation} ${pair.optimal}`.trim() },
    });
  }
  advice.push(...pairAdvice.sort((a, b) => b.savedMs - a.savedMs).slice(0, 2));

  // ---- F2L: stopping between and inside pairs (look-ahead)
  const pairStages = analysis.stages.filter((s) => s.stage.startsWith("pair") && s.moves > 0);
  let stopped = 0;
  let longest = 0;
  for (const s of pairStages) {
    stopped += Math.max(0, s.recognitionMs - level.recognitionMs.pair);
    longest = Math.max(longest, s.recognitionMs, s.longestPauseMs);
    if (s.longestPauseMs > 500) stopped += s.longestPauseMs - 500;
  }
  if (stopped >= 600) {
    advice.push({
      kind: "lookahead",
      stage: "f2l",
      savedMs: stopped,
      title: "Stop less during F2L",
      detail: `You stopped for about ${seconds(stopped)} more than typical for ${level.phrase} between and inside your pairs (the longest pause was ${seconds(longest)}). Turn a bit slower so you can find the next pair while you solve this one.`,
      show: null,
    });
  }

  // ---- Last layer
  const crossFace = analysis.cross.face;
  advice.push(...lastLayerAdvice("OLL", analysis.oll, stage("oll"), level, crossFace, msPerMove));
  advice.push(...lastLayerAdvice("PLL", analysis.pll, stage("pll"), level, crossFace, msPerMove));

  // ---- Turning speed
  const levelMsPerMove = (level.typicalMs * 0.8) / level.moves.total;
  if (msPerMove > levelMsPerMove * 1.15) {
    const tps = (ms: number) => (1000 / ms).toFixed(1);
    advice.push({
      kind: "turning",
      stage: "all",
      savedMs: (msPerMove - levelMsPerMove) * turned * 0.5,
      title: "Turn a little faster",
      detail: `When you're not pausing you turn at ${tps(msPerMove)} moves per second. ${capitalize(level.phrase)} solvers turn at about ${tps(levelMsPerMove)}. Drill your algorithms until you can do them without thinking.`,
      show: null,
    });
  }

  return advice
    .filter((a) => a.savedMs >= MIN_SAVED_MS)
    .map((a) => ({ ...a, savedMs: Math.round(a.savedMs) }))
    .sort((a, b) => b.savedMs - a.savedMs)
    .slice(0, MAX_ADVICE);
}

function lastLayerAdvice(step: "OLL" | "PLL", info: LastLayerInfo, s: StageSplit, level: Level, crossFace: Face, msPerMove: number): Advice[] {
  if (info.skip || !info.alg || !info.caseId) return [];
  const result: Advice[] = [];
  const recognitionTarget = step === "OLL" ? level.recognitionMs.oll : level.recognitionMs.pll;
  const kind = step === "OLL" ? "oll" : "pll";
  const caseName = step === "OLL" ? `${info.caseId} (${info.name})` : `the ${info.name}`;
  const show = { afterMove: s.fromMove, alg: `${TO_BOTTOM[crossFace]} ${info.preAuf} ${info.alg}`.replace(/\s+/g, " ").trim() };

  if (info.looks >= 2) {
    const oneLook = parseAlg(info.alg).length * msPerMove + recognitionTarget;
    result.push({
      kind: `${kind}-two-look`,
      stage: kind,
      savedMs: s.endMs - s.startMs - oneLook,
      title: `Learn ${caseName}`,
      detail: `You solved this ${step} in ${info.looks} steps. One algorithm does it: ${info.alg}.`,
      show,
    });
  }
  if (s.recognitionMs > recognitionTarget + 300) {
    result.push({
      kind: `${kind}-recognition`,
      stage: kind,
      savedMs: s.recognitionMs - recognitionTarget,
      title: `Recognize your ${step} faster`,
      detail: `You looked for ${seconds(s.recognitionMs)} before your ${step}, ${caseName}. Typical for ${level.phrase} is about ${seconds(recognitionTarget)}. Practice telling the cases apart from the top and the sides.`,
      show,
    });
  }
  return result;
}

const capitalize = (text: string) => text[0].toUpperCase() + text.slice(1);
