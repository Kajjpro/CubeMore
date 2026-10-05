// Showing and typing solve times. Times are whole milliseconds everywhere.

import { formatResult, formatTime, type Penalty, type SolveResult } from "@cube-racing/shared";

// The basic formatting lives in /shared (the server uses it for chat notices).
export { formatMark, formatResult, formatSolve, formatTime } from "@cube-racing/shared";

export type TypedTime = { ok: true; timeMs: number; penalty: Penalty } | { ok: false; error: string };

/**
 * Reads a typed time, like csTimer:
 *   just digits: the last two are hundredths, the two before are seconds, the rest minutes,
 *                so "1235" = 12.35, "123" = 1.23, "5" = 0.05, "10234" = 1:02.34
 *   with a dot or colon: as written, so "12.35", "12.3", "1:02.34"
 *   "DNF", or a "+" at the end for +2 ("1235+" = 12.35 with +2)
 * Works with whole numbers only (no floating point), so "0.1" is exactly 100 ms.
 */
export function parseTypedTime(text: string): TypedTime {
  let input = text.trim().toUpperCase();
  if (input === "DNF") return { ok: true, timeMs: 0, penalty: "DNF" };
  const plusTwo = input.endsWith("+");
  if (plusTwo) input = input.slice(0, -1).trimEnd();

  let minutes: number;
  let seconds: number;
  let centis: number;
  const written = /^(?:(\d{1,3}):)?(\d{1,4})(?:\.(\d{1,2}))?$/.exec(input);
  if (/^\d{1,6}$/.test(input)) {
    const padded = input.padStart(6, "0"); // "1235" -> "001235" = 00:12.35
    minutes = Number(padded.slice(0, 2));
    seconds = Number(padded.slice(2, 4));
    centis = Number(padded.slice(4));
    if (minutes > 0 && seconds >= 60) {
      return { ok: false, error: "Seconds must be below 60 when you type minutes (10234 = 1:02.34)." };
    }
  } else if (written && (input.includes(".") || input.includes(":"))) {
    minutes = written[1] === undefined ? 0 : Number(written[1]);
    seconds = Number(written[2]);
    centis = Number((written[3] ?? "").padEnd(2, "0"));
    if (written[1] !== undefined && seconds >= 60) {
      return { ok: false, error: "Seconds must be below 60 when you type minutes (1:02.34)." };
    }
  } else {
    return { ok: false, error: "Type a time like 1235 (= 12.35) or 1:02.34, or DNF." };
  }

  const timeMs = ((minutes * 60 + seconds) * 100 + centis) * 10;
  if (timeMs <= 0) return { ok: false, error: "The time must be more than 0." };
  return { ok: true, timeMs, penalty: plusTwo ? "+2" : "OK" };
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
