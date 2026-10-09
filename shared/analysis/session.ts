/*
 * SEVERAL SOLVES TOGETHER (an ao5): average splits, how steady the times are,
 * and the three things that would save the most time over all of them.
 */

import { levelOf, nextLevel } from "./benchmarks";
import { ANALYSIS_VERSION, type AdviceKind, type SessionSummary, type SolveAnalysis, type StageId } from "./types";

const STAGES: StageId[] = ["cross", "pair1", "pair2", "pair3", "pair4", "oll", "pll"];

/** General titles for the focus list (the per-solve titles name one case or one pair). */
const FOCUS_TITLES: Record<AdviceKind, string> = {
  "cross-moves": "Plan shorter crosses",
  "cross-time": "Do the cross without stopping",
  "pair-moves": "Solve pairs in fewer moves",
  lookahead: "Stop less during F2L",
  "oll-two-look": "Learn the full OLL cases you got",
  "pll-two-look": "Learn the full PLL cases you got",
  "oll-recognition": "Recognize OLL faster",
  "pll-recognition": "Recognize PLL faster",
  turning: "Turn a little faster",
};

export function summarizeSession(analyses: SolveAnalysis[]): SessionSummary {
  if (analyses.length === 0) throw new Error("No solves.");
  const times = analyses.map((a) => a.timeMs);
  const sorted = [...times].sort((a, b) => a - b);
  // ao5: drop the best and the worst. Fewer than 5: the mean.
  const counted = analyses.length >= 5 ? sorted.slice(1, -1) : sorted;
  const averageMs = Math.round(counted.reduce((a, b) => a + b, 0) / counted.length);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const spreadMs = Math.round(Math.sqrt(times.reduce((sum, t) => sum + (t - mean) ** 2, 0) / times.length));

  const stages = STAGES.map((stage) => {
    const splits = analyses.map((a) => a.stages.find((s) => s.stage === stage)!);
    const avg = (pick: (s: (typeof splits)[number]) => number) => Math.round((splits.reduce((sum, s) => sum + pick(s), 0) / splits.length) * 10) / 10;
    return { stage, ms: Math.round(avg((s) => s.endMs - s.startMs)), recognitionMs: Math.round(avg((s) => s.recognitionMs)), moves: avg((s) => s.moves) };
  });

  const byKind = new Map<AdviceKind, { savedMs: number; solves: number }>();
  for (const analysis of analyses) {
    const seen = new Set<AdviceKind>();
    for (const advice of analysis.advice) {
      const entry = byKind.get(advice.kind) ?? { savedMs: 0, solves: 0 };
      entry.savedMs += advice.savedMs;
      if (!seen.has(advice.kind)) entry.solves++;
      seen.add(advice.kind);
      byKind.set(advice.kind, entry);
    }
  }
  const focus = [...byKind.entries()]
    .map(([kind, { savedMs, solves }]) => ({ kind, title: FOCUS_TITLES[kind], savedMs: Math.round(savedMs / analyses.length), solves }))
    .sort((a, b) => b.savedMs - a.savedMs)
    .slice(0, 3);

  return {
    version: ANALYSIS_VERSION,
    count: analyses.length,
    averageMs,
    bestMs: sorted[0],
    worstMs: sorted[sorted.length - 1],
    spreadMs,
    level: levelOf(averageMs).id,
    target: nextLevel(averageMs).id,
    stages,
    focus,
  };
}
