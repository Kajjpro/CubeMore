// Showing and typing solve times. Times are whole milliseconds everywhere.

import { PLUS_TWO_MS, type Mark, type Penalty, type SolveResult } from "@cube-racing/shared";

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

/** A score: "12.34" or "DNF". */
export function formatMark(mark: Mark | null | undefined): string {
  if (mark === null || mark === undefined) return "–";
  return mark === "DNF" ? "DNF" : formatTime(mark);
}

/** One solve as shown in tables: "12.34", "14.34+" (with +2), or "DNF". */
export function formatSolve(timeMs: number, penalty: Penalty): string {
  if (penalty === "DNF") return "DNF";
  if (penalty === "+2") return `${formatTime(Math.floor(timeMs / 10) * 10 + PLUS_TWO_MS)}+`;
  return formatTime(timeMs);
}

export function formatResult(result: SolveResult): string {
  return formatSolve(result.timeMs, result.penalty);
}

export type TypedTime = { ok: true; timeMs: number; penalty: Penalty } | { ok: false; error: string };

/**
 * Reads a typed time: "12.34", "12.3", "12", "1:02.34", or "DNF".
 * Works with whole numbers only (no floating point), so "0.1" is exactly 100 ms.
 */
export function parseTypedTime(text: string): TypedTime {
  const input = text.trim().toUpperCase();
  if (input === "DNF") return { ok: true, timeMs: 0, penalty: "DNF" };

  const match = /^(?:(\d{1,3}):)?(\d{1,4})(?:\.(\d{1,2}))?$/.exec(input);
  if (!match) {
    return { ok: false, error: "Type a time like 12.34 or 1:02.34, or DNF." };
  }
  const minutes = match[1] === undefined ? 0 : Number(match[1]);
  const seconds = Number(match[2]);
  const centis = Number((match[3] ?? "").padEnd(2, "0"));
  if (match[1] !== undefined && seconds >= 60) {
    return { ok: false, error: "Seconds must be below 60 when you type minutes (1:02.34)." };
  }

  const timeMs = ((minutes * 60 + seconds) * 100 + centis) * 10;
  if (timeMs <= 0) return { ok: false, error: "The time must be more than 0." };
  return { ok: true, timeMs, penalty: "OK" };
}

/** "DNF (9.87)": the full form, used for hover text and when tapped. */
export function formatResultLong(result: SolveResult): string {
  if (result.penalty === "DNF" && result.timeMs > 0) return `DNF (${formatTime(result.timeMs)})`;
  return formatResult(result);
}

/**
 * What the timer shows while running, depending on the player's setting:
 * "full" = 12.34, "seconds" = 12 (or 1:02), "hidden" = solving.
 */
export function formatRunning(ms: number, display: "full" | "seconds" | "hidden"): string {
  if (display === "hidden") return "solving";
  if (display === "seconds") {
    const seconds = Math.floor(ms / 1000);
    return seconds >= 60 ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : String(seconds);
  }
  return formatTime(ms);
}
