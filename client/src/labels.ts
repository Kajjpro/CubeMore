import type { CubeEventId, RoomFormat, RoomSettings, SolveTimeLimit, WinCondition } from "@cube-racing/shared";

/** Short event names, as cubers say them. */
export const EVENT_SHORT: Record<CubeEventId, string> = {
  "333": "3x3",
  "222": "2x2",
  "444": "4x4",
  "555": "5x5",
  "666": "6x6",
  "777": "7x7",
  "333bf": "3BLD",
  "333fm": "FMC",
  "333oh": "OH",
  clock: "Clock",
  minx: "Mega",
  pyram: "Pyra",
  skewb: "Skewb",
  sq1: "SQ1",
  "444bf": "4BLD",
  "555bf": "5BLD",
  "333mbf": "MBLD",
};

export const FORMAT_LABELS: Record<RoomFormat, string> = {
  single: "Single",
  ao5: "ao5",
  ao12: "ao12",
};

export const WIN_CONDITION_LABELS: Record<WinCondition, string> = {
  bo1: "Best of 1",
  bo3: "Best of 3",
  bo5: "Best of 5",
  unlimited: "Unlimited",
};

/**
 * Handicap: how a result compares with the player's pace. "−6.1%" = 6.1%
 * faster than their pace (good), "+3.2%" = slower. null without a pace.
 */
export function paceDelta(result: number | "DNF" | undefined, pace: number | null | undefined): string | null {
  if (pace == null || result === undefined) return null;
  if (result === "DNF") return "DNF";
  const percent = ((result - pace) / pace) * 100;
  const text = Math.abs(percent).toFixed(1);
  return percent < 0 ? `−${text}%` : `+${text}%`;
}

export function timeLimitLabel(limit: SolveTimeLimit): string {
  return limit === "off" ? "Off" : `${limit} min`;
}

/** The one-line summary used everywhere: "3x3 · ao5 · Best of 3". */
export function settingsSummary(settings: RoomSettings): string {
  const parts = [EVENT_SHORT[settings.cubeEvent], FORMAT_LABELS[settings.format], WIN_CONDITION_LABELS[settings.winCondition]];
  if (settings.scoring === "handicap") parts.push("Handicap");
  if (settings.solveTimeLimit !== "off") parts.push(`${settings.solveTimeLimit} min limit`);
  return parts.join(" · ");
}

/** "Bat", "Bat and Nomin", "Bat, Nomin and 3 others". */
export function nameList(names: string[]): string {
  if (names.length <= 2) return names.join(" and ");
  const others = names.length - 2;
  return `${names[0]}, ${names[1]} and ${others} other${others > 1 ? "s" : ""}`;
}
