/*
 * Analyzing a solve in the background (worker.ts). Falls back to the main
 * thread if the browser can't start a worker.
 */

import { analyzeSolve, type SolveAnalysis } from "@cube-racing/shared/analysis";
import type { WorkerJob, WorkerResponse } from "./worker";

let worker: Worker | null = null;
let nextId = 1;
const waiting = new Map<number, (response: WorkerResponse) => void>();

function getWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      waiting.get(event.data.id)?.(event.data);
      waiting.delete(event.data.id);
    };
    return worker;
  } catch {
    return null;
  }
}

function ask(request: WorkerJob): Promise<WorkerResponse> {
  const id = nextId++;
  const w = getWorker();
  if (!w) return Promise.reject(new Error("no worker"));
  return new Promise((resolve) => {
    waiting.set(id, resolve);
    w.postMessage({ ...request, id });
  });
}

/** Builds the search tables now, while the player connects their cube. */
export function warmAnalyzer(): void {
  void ask({ kind: "warm" }).catch(() => {});
}

export async function analyzeInBackground(scramble: string, moves: string[], times: number[]): Promise<SolveAnalysis> {
  let response: WorkerResponse;
  try {
    response = await ask({ kind: "analyze", scramble, moves, times });
  } catch {
    return analyzeSolve(scramble, moves, times);
  }
  if ("error" in response) throw new Error(response.error);
  if (!("analysis" in response)) throw new Error("The analysis failed.");
  return response.analysis;
}
