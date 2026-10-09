/*
 * The analyzer runs here, off the page's main thread, so the page never stutters
 * while a solve is being analyzed (the first one also builds the search tables).
 */

import { analyzeSolve, warmUp, type SolveAnalysis } from "@cube-racing/shared/analysis";

export type WorkerJob = { kind: "warm" } | { kind: "analyze"; scramble: string; moves: string[]; times: number[] };
export type WorkerRequest = WorkerJob & { id: number };
export type WorkerResponse = { id: number; analysis: SolveAnalysis } | { id: number; error: string } | { id: number; warm: true };

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    if (request.kind === "warm") {
      warmUp();
      self.postMessage({ id: request.id, warm: true } satisfies WorkerResponse);
    } else {
      const analysis = analyzeSolve(request.scramble, request.moves, request.times);
      self.postMessage({ id: request.id, analysis } satisfies WorkerResponse);
    }
  } catch (error) {
    self.postMessage({ id: request.id, error: error instanceof Error ? error.message : "The analysis failed." } satisfies WorkerResponse);
  }
};
