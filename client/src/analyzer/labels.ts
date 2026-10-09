// Words and numbers for the analyzer screens.

import { COLOR_NAMES, LEVELS, typicalStageMs, type LevelId, type SolveAnalysis, type StageId } from "@cube-racing/shared/analysis";

export const STAGE_LABEL: Record<StageId, string> = {
  cross: "Cross",
  pair1: "Pair 1",
  pair2: "Pair 2",
  pair3: "Pair 3",
  pair4: "Pair 4",
  oll: "OLL",
  pll: "PLL",
};

/** Short labels for the stage bar. */
export const STAGE_SHORT: Record<StageId, string> = { cross: "Cross", pair1: "P1", pair2: "P2", pair3: "P3", pair4: "P4", oll: "OLL", pll: "PLL" };

export const levelOfId = (id: LevelId) => LEVELS.find((l) => l.id === id)!;

/** "1.24" seconds with 2 decimals, or 1 when `short`. */
export function seconds(ms: number, digits = 2): string {
  return (ms / 1000).toFixed(digits);
}

export function colorName(face: string): string {
  return COLOR_NAMES[face as keyof typeof COLOR_NAMES] ?? face;
}

/** The typical time of a stage at a level (ms). */
export function typicalFor(stage: StageId, level: LevelId): number {
  const typical = typicalStageMs(levelOfId(level));
  if (stage === "cross") return typical.cross;
  if (stage === "oll") return typical.oll;
  if (stage === "pll") return typical.pll;
  return typical.pair;
}

/** Each stage's start in the replay (ms): the end of the stage before. */
export function stageStarts(analysis: SolveAnalysis): { stage: StageId; startMs: number; endMs: number }[] {
  return analysis.stages.map((s) => ({ stage: s.stage, startMs: s.startMs, endMs: s.endMs }));
}

/** "Pair 2: green-red". */
export function pairLabel(analysis: SolveAnalysis, stage: StageId): string {
  const pair = analysis.pairs.find((p) => p.stage === stage);
  if (!pair || pair.slots.length === 0) return STAGE_LABEL[stage];
  const colors = pair.slots.map((slot) => [...slot].map(colorName).join("-")).join(" and ");
  return `${STAGE_LABEL[stage]}: ${colors}`;
}
