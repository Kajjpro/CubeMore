// Writing solve times the way cubers do. Shared so the server can write chat
// notices like "Nomin submitted 9.12" with exactly the same formatting.

import { PLUS_TWO_MS } from "./constants";
import type { Mark, Penalty, SolveResult } from "./types";

/**
 * 12345 -> "12.34", 62345 -> "1:02.34", 3723450 -> "1:02:03.45".
 * Always truncated to hundredths (never rounded up), like the WCA.
 */
export function formatTime(ms: number): string {
  const hundredths = Math.floor(ms / 10);
  const centis = String(hundredths % 100).padStart(2, "0");
  const totalSeconds = Math.floor(hundredths / 100);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);

  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}.${centis}`;
  if (minutes > 0) return `${minutes}:${pad(seconds)}.${centis}`;
  return `${seconds}.${centis}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** A score: "12.34" or "DNF" ("–" when there is none yet). */
export function formatMark(mark: Mark | null | undefined): string {
  if (mark === null || mark === undefined) return "–";
  return mark === "DNF" ? "DNF" : formatTime(mark);
}

/** One solve: "12.34", "14.34+" (with +2, the total with a plus), or "DNF". */
export function formatSolve(timeMs: number, penalty: Penalty): string {
  if (penalty === "DNF") return "DNF";
  if (penalty === "+2") return `${formatTime(Math.floor(timeMs / 10) * 10 + PLUS_TWO_MS)}+`;
  return formatTime(timeMs);
}

export function formatResult(result: SolveResult): string {
  return formatSolve(result.timeMs, result.penalty);
}
