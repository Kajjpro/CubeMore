// Mock rooms for /dev/states. Nothing here is used by the real app.

import {
  DEFAULT_SETTINGS,
  type MatchPhase,
  type MatchSnapshot,
  type Penalty,
  type PlayerSnapshot,
  type RoomSettings,
  type RoomSnapshot,
  type Scramble,
  type SetStanding,
  type SolveResult,
} from "@cube-racing/shared";
import { scoredMs, trimmedAverage } from "../stats";

export const SCRAMBLES = {
  "333": "R2 D' B2 U' L2 U' F2 D' R2 U2 B' R' U' F D2 L' B R' U2 F'",
  "444":
    "B' U' F' U L U2 R B R2 D2 L2 B2 L' D2 R F2 D2 B2 L Uw2 F' Rw2 D Rw2 B' Fw2 U' Rw2 Uw2 L Fw2 L' Fw' U F' Rw' Fw Rw Uw' D2 B' Rw' Uw L2 F'",
  "777": sevenBySeven(),
  minx: [
    "R++ D-- R-- D++ R++ D++ R-- D-- R++ D++ U",
    "R-- D++ R++ D-- R-- D++ R++ D-- R-- D++ U'",
    "R++ D++ R-- D-- R++ D-- R++ D++ R-- D-- U",
    "R-- D-- R++ D++ R-- D++ R-- D-- R++ D++ U'",
    "R++ D-- R++ D++ R-- D-- R++ D-- R-- D++ U",
    "R-- D++ R-- D-- R++ D++ R-- D++ R++ D-- U'",
    "R++ D++ R++ D-- R-- D-- R-- D++ R++ D++ U",
  ].join("\n"),
  sq1: "(1, 0) / (-4, -1) / (-3, 0) / (1, -2) / (5, -1) / (-3, 0) / (-5, 0) / (3, 0) / (-1, 0) / (-2, -5) / (6, -2) / (-2, 0)",
};

/** A long, deterministic 7x7-style scramble (about 100 moves). */
function sevenBySeven(): string {
  const faces = ["R", "L", "U", "D", "F", "B"];
  const widths = ["", "w", "3w"];
  const suffix = ["", "'", "2"];
  let seed = 7;
  const next = (n: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  const moves: string[] = [];
  for (let i = 0; i < 100; i++) {
    const width = widths[next(3)];
    moves.push(`${width === "3w" ? "3" : ""}${faces[next(6)]}${width === "3w" ? "w" : width}${suffix[next(3)]}`);
  }
  return moves.join(" ");
}

export const NAMES = ["Temuulen", "Nomin", "Bat", "Saraa", "Anu", "Khulan", "Bilguun", "Enkhjin", "Tsetseg", "Oyun", "Ganbold", "Munkh"];
export const LONG_NAMES = [
  "Temuulen",
  "Tserendorjiin Battul",
  "Christopher-Alexande",
  "Bat",
  "Oyun-Erdene Gansukh",
  "Anu",
];

/** "9.87" style spec: number = OK, "+2:9870" = +2, "DNF:9870" = DNF with a time, null = not yet. */
type TimeSpec = number | string | null;

function result(spec: TimeSpec): SolveResult | null {
  if (spec === null) return null;
  if (typeof spec === "number") return { timeMs: spec, penalty: "OK", source: "submitted" };
  const [penalty, time] = spec.split(":");
  return { timeMs: Number(time), penalty: penalty as Penalty, source: "submitted" };
}

function standing(row: SolveResult[], format: RoomSettings["format"]): SetStanding {
  const values = row.map(scoredMs);
  const valid = values.filter((v): v is number => v !== null);
  const best = valid.length ? Math.min(...valid) : "DNF";
  const avg = format === "single" ? (values[0] ?? "DNF") : (trimmedAverage(row) ?? "DNF");
  return { result: avg, best };
}

export interface MockRoomOptions {
  names?: string[];
  meIndex?: number;
  hostIndex?: number;
  settings?: Partial<RoomSettings>;
  /** Per player, per solve of the current set. */
  times?: TimeSpec[][];
  phase?: MatchPhase | "lobby";
  solveIndex?: number;
  setIndex?: number;
  points?: number[];
  solving?: number[];
  reconnecting?: number[];
  spectators?: number[];
  scramble?: Scramble;
  solveDeadlineIn?: number;
}

export function mockRoom(o: MockRoomOptions = {}): { room: RoomSnapshot; youId: string } {
  const names = o.names ?? NAMES.slice(0, 6);
  const settings: RoomSettings = { ...DEFAULT_SETTINGS, ...o.settings };
  const ids = names.map((_, i) => `p${i}`);
  const players: PlayerSnapshot[] = names.map((nickname, i) => ({
    id: ids[i],
    nickname,
    status: o.reconnecting?.includes(i) ? "reconnecting" : "connected",
    timerStatus: o.solving?.includes(i) ? "solving" : "idle",
    spectator: o.phase !== "lobby" && !!o.spectators?.includes(i),
  }));
  const youId = ids[o.meIndex ?? 0];
  const base = {
    code: "PHZ3DJ",
    version: 42,
    serverTime: Date.now(),
    settings,
    hostId: ids[o.hostIndex ?? 0],
    players,
  };
  if (!o.phase || o.phase === "lobby") return { room: { ...base, match: null }, youId };

  const perSet = settings.format === "single" ? 1 : settings.format === "ao5" ? 5 : 12;
  const roster = ids.filter((_, i) => !o.spectators?.includes(i));
  const results: MatchSnapshot["results"] = {};
  const standings: MatchSnapshot["standings"] = {};
  roster.forEach((id) => {
    const i = ids.indexOf(id);
    const specs = o.times?.[i] ?? [];
    const row = Array.from({ length: perSet }, (_, k) => result(specs[k] ?? null));
    results[id] = row;
    standings[id] = row.every((r) => r) ? standing(row as SolveResult[], settings.format) : null;
  });
  const points: Record<string, number> = {};
  roster.forEach((id) => (points[id] = o.points?.[ids.indexOf(id)] ?? 0));

  const setIndex = o.setIndex ?? 1;
  const finishedSets: MatchSnapshot["finishedSets"] = [];
  if (o.phase === "set_result" || o.phase === "match_over") {
    const setStandings: Record<string, SetStanding> = {};
    roster.forEach((id) => (setStandings[id] = standings[id] ?? { result: "DNF", best: "DNF" }));
    const valid = Object.entries(setStandings).filter(([, s]) => s.result !== "DNF");
    const bestValue = Math.min(...valid.map(([, s]) => s.result as number));
    finishedSets.push({ setIndex, winnerIds: valid.filter(([, s]) => s.result === bestValue).map(([id]) => id), standings: setStandings });
  }
  const winner = roster.reduce((a, b) => ((points[b] ?? 0) > (points[a] ?? 0) ? b : a), roster[0]);

  const match: MatchSnapshot = {
    matchId: "demo-match",
    phase: o.phase,
    setIndex,
    solveIndex: o.solveIndex ?? 2,
    solvesPerSet: perSet,
    targetPoints: settings.winCondition === "unlimited" ? null : { bo1: 1, bo3: 2, bo5: 3 }[settings.winCondition],
    scramble:
      o.phase === "solving" || o.phase === "solve_review"
        ? (o.scramble ?? { cubeEvent: settings.cubeEvent, text: SCRAMBLES["333"] })
        : null,
    solveDeadline: o.solveDeadlineIn ? Date.now() + o.solveDeadlineIn : null,
    phaseEndsAt: o.phase === "solve_review" ? Date.now() + 3000 : o.phase === "set_result" ? Date.now() + 6000 : null,
    roster,
    results,
    standings,
    points,
    finishedSets,
    winnerIds: o.phase === "match_over" ? [winner] : [],
  };
  return { room: { ...base, match }, youId };
}

/** Six players, ao5, set 2, solve 3: Nomin and Saraa done, Bat and Anu solving. */
export const AO5_TIMES: TimeSpec[][] = [
  ["+2:9870", 10420, null], // Temuulen (you)
  [8910, 9650, 9120], // Nomin
  [12340, "DNF:9870", null], // Bat
  [13020, 11110, 12450], // Saraa
  [10050, 10990, null], // Anu
  [15230, 14080, null], // Khulan
];

export const AO5_FULL: TimeSpec[][] = [
  ["+2:9870", 10420, 10870, 9540, 11020],
  [8910, 9650, 9120, 10230, 8870],
  [12340, "DNF:9870", 11980, 12560, 13020],
  [13020, 11110, 12450, "+2:11300", 12210],
  [10050, 10990, 9990, 10560, "DNF:10000"],
  [15230, 14080, 14990, 13870, 15500],
];

/** Twelve players, ao12, on the last solve. */
export function ao12Times(count: number): TimeSpec[][] {
  let seed = 12;
  const next = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  return Array.from({ length: count }, (_, p) =>
    Array.from({ length: 12 }, (_, s): TimeSpec => {
      if (s === 11 && (p === 3 || p === 7)) return null;
      const t = 8000 + p * 700 + Math.floor(next() * 4000);
      if (next() < 0.06) return `DNF:${t}`;
      if (next() < 0.08) return `+2:${t}`;
      return t;
    }),
  );
}
