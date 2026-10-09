/*
 * THE SOLVE ANALYZER: CFOP splits, cases and suggestions for smart cube solves.
 * Pure TypeScript, used by the browser (right after a solve) and the server
 * (which redoes it before saving, so a saved analysis can be trusted).
 */

export { analyzeSolve, AnalysisError } from "./analyze";
export { summarizeSession } from "./session";
export { LEVELS, levelOf, nextLevel, typicalStageMs, type Level, type LevelId } from "./benchmarks";
export { COLOR_NAMES } from "./frame";
export { warmUp } from "./search";
export * from "./types";
