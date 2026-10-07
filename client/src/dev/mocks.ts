// Mock rooms for /dev/states. Nothing here is used by the real app.

import {
  DEFAULT_SETTINGS,
  type ChatMessage,
  type CubeEventId,
  type DailyStatus,
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
  "222": "R U2 F' R2 U' F U' R2 U'",
  pyram: "U' L' B R' U L' R B' l r' b'",
  skewb: "R U' B L' U' R' B L R'",
  clock: "UR3+ DR2- DL1+ UL4- U0+ R6+ D5- L3+ ALL2- y2 U1+ R2- D3+ L4- ALL5+ UR",
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
  /** Makes it a private room with this PIN. */
  pin?: string;
  /** Lobby: the race starts in this many ms (someone joined). */
  autoStartIn?: number;
  /** Best of is fixed (a race has already been played). */
  bestOfLocked?: boolean;
  /** Handicap rooms: each player's pace in ms (null = no pace yet). */
  paces?: (number | null)[];
  /** Mixed rooms: each player's event. */
  events?: CubeEventId[];
  /** Players without an account. */
  guests?: number[];
  /** Players who stepped away to watch (not in the set). */
  watching?: number[];
  /** Just created: the host is setting the room up. */
  setup?: boolean;
  /** Mixed rooms: just joined, still picking their event. */
  picking?: number[];
}

export function mockRoom(o: MockRoomOptions = {}): { room: RoomSnapshot; youId: string } {
  const names = o.names ?? NAMES.slice(0, 6);
  const settings: RoomSettings = {
    ...DEFAULT_SETTINGS,
    name: "Sunday practice",
    ...(o.pin ? { visibility: "private" as const } : {}),
    ...o.settings,
  };
  const ids = names.map((_, i) => `p${i}`);
  const players: PlayerSnapshot[] = names.map((nickname, i) => ({
    id: ids[i],
    nickname,
    status: o.reconnecting?.includes(i) ? "reconnecting" : "connected",
    timerStatus: o.solving?.includes(i) ? "solving" : "idle",
    // Solving players started a few seconds ago, so their live clocks show something.
    solvingSince: o.solving?.includes(i) ? Date.now() - 4_300 - i * 1_700 : null,
    spectator: o.phase !== "lobby" && (!!o.spectators?.includes(i) || !!o.watching?.includes(i)),
    cubeEvent: o.events?.[i] ?? settings.cubeEvent,
    guest: !!o.guests?.includes(i),
    watching: !!o.watching?.includes(i),
    pickingEvent: !!o.picking?.includes(i),
  }));
  const youId = ids[o.meIndex ?? 0];
  const base = {
    code: "PHZ3DJ",
    version: 42,
    serverTime: Date.now(),
    settings,
    pin: o.pin ?? null,
    hostId: ids[o.hostIndex ?? 0],
    players,
    bestOfLocked: o.bestOfLocked ?? o.phase !== "lobby",
    weekly: false,
    setup: !!o.setup,
  };
  if (!o.phase || o.phase === "lobby") {
    const autoStartAt = o.autoStartIn === undefined ? null : Date.now() + o.autoStartIn;
    return { room: { ...base, match: null, autoStartAt }, youId };
  }

  const perSet = settings.format === "single" ? 1 : settings.format === "ao5" ? 5 : 12;
  const roster = ids.filter((_, i) => !o.spectators?.includes(i) && !o.watching?.includes(i));
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

  const events: Record<string, CubeEventId> = Object.fromEntries(roster.map((id) => [id, players[ids.indexOf(id)].cubeEvent]));
  const setIndex = o.setIndex ?? 1;
  const handicap = settings.scoring === "handicap";
  const paces: Record<string, number | null> | null = handicap ? {} : null;
  if (paces) roster.forEach((id) => (paces[id] = o.paces?.[ids.indexOf(id)] ?? null));
  const finishedSets: MatchSnapshot["finishedSets"] = [];
  if (o.phase === "set_result" || o.phase === "match_over") {
    const setStandings: Record<string, SetStanding> = {};
    roster.forEach((id) => (setStandings[id] = standings[id] ?? { result: "DNF", best: "DNF" }));
    const valid = Object.entries(setStandings).filter(([id, s]) => s.result !== "DNF" && (!paces || paces[id] != null));
    // Fastest: the lowest result. Handicap: the lowest result / pace.
    const score = ([id, s]: (typeof valid)[0]) => (s.result as number) / (paces ? paces[id]! : 1);
    const bestValue = Math.min(...valid.map(score));
    const winnerIds = valid.filter((entry) => score(entry) === bestValue).map(([id]) => id);
    finishedSets.push({ setIndex, winnerIds, standings: setStandings, paces });
  }
  const winner = roster.reduce((a, b) => ((points[b] ?? 0) > (points[a] ?? 0) ? b : a), roster[0]);

  const match: MatchSnapshot = {
    matchId: "demo-match",
    phase: o.phase,
    setIndex,
    solveIndex: o.solveIndex ?? 2,
    solvesPerSet: perSet,
    targetPoints: settings.winCondition === "unlimited" ? null : { bo1: 1, bo3: 2, bo5: 3 }[settings.winCondition],
    scrambles: o.phase === "solving" || o.phase === "solve_review" ? mockScrambles(o, settings, roster.map((id) => events[id])) : {},
    events,
    solveDeadline: o.solveDeadlineIn ? Date.now() + o.solveDeadlineIn : null,
    phaseEndsAt: o.phase === "solve_review" ? Date.now() + 3000 : o.phase === "set_result" ? Date.now() + 6000 : null,
    roster,
    results,
    standings,
    points,
    finishedSets,
    paces,
    winnerIds: o.phase === "match_over" ? [winner] : [],
  };
  return { room: { ...base, match, autoStartAt: null }, youId };
}

/** The current scramble of each event raced (o.scramble for a one-event room). */
function mockScrambles(o: MockRoomOptions, settings: RoomSettings, raced: CubeEventId[]): MatchSnapshot["scrambles"] {
  if (o.scramble) return { [o.scramble.cubeEvent]: o.scramble };
  const texts: Partial<Record<CubeEventId, string>> = SCRAMBLES;
  const events = raced.length ? [...new Set(raced)] : [settings.cubeEvent];
  return Object.fromEntries(events.map((event) => [event, { cubeEvent: event, text: texts[event] ?? SCRAMBLES["333"] }]));
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

/** A short room chat: notices and messages. Player ids match mockRoom (p0 is you). */
export function mockChat(roomNames: string[] = NAMES): ChatMessage[] {
  // Smaller rooms: people who have left since still have a name.
  const names = NAMES.map((name, i) => roomNames[i] ?? name);
  const start = new Date(2026, 8, 30, 14, 2).getTime();
  const lines: [kind: ChatMessage["kind"], player: number | null, text: string, target?: number][] = [
    ["system", 0, `${names[0]} created the room`],
    ["system", 1, `${names[1]} joined the room`],
    ["user", 1, "hi everyone"],
    ["system", 4, `${names[4]} joined the room`],
    ["user", 0, "ready when you are"],
    ["system", null, "Match started: 3x3x3, ao5, Best of 3"],
    ["system", null, "Set 1 started"],
    ["system", 1, `${names[1]} submitted 9.12`],
    ["reaction", 0, `🔥 ${names[1]}'s 9.12`, 1],
    ["user", 4, "that scramble had a free cross"],
    ["system", 4, `${names[4]} submitted 11.87+`],
    ["user", 1, "gl on the last one"],
  ];
  return lines.map(([kind, player, text, target], i) => ({
    id: `m${i}`,
    at: start + i * 20_000,
    kind,
    name: kind !== "system" && player !== null ? names[player] : null,
    senderId: kind !== "system" && player !== null ? `p${player}` : null,
    targetId: target === undefined ? null : `p${target}`,
    text,
  }));
}

/** The daily scramble page in each state. */
export function mockDaily(status: DailyStatus["status"], options: { rank?: number } = {}): DailyStatus {
  const now = Date.now();
  const times = [7_410, 8_020, 8_950, 9_120, 9_870, 10_330, 11_040, 11_870, 12_450, 13_900];
  const leaderboard = times.map((timeMs, i) => ({
    rank: i + 1,
    name: NAMES[i % NAMES.length],
    playerId: `p${i + 1}`,
    result: { timeMs, penalty: "OK" as const, source: "submitted" as const },
  }));
  const rank = options.rank ?? 4;
  const mine = rank <= times.length ? leaderboard[rank - 1].result : { timeMs: 15_230, penalty: "OK" as const, source: "submitted" as const };
  return {
    day: "2026-09-30",
    serverTime: now,
    nextAt: now + 5 * 3_600_000 + 12 * 60_000,
    status,
    scramble: status === "new" ? null : { cubeEvent: "333", text: SCRAMBLES["333"] },
    deadline: status === "started" ? now + 8 * 60_000 + 42_000 : null,
    result: status === "done" ? mine : null,
    rank: status === "done" ? rank : null,
    total: 348,
    leaderboard,
    youId: status === "done" && rank <= times.length ? `p${rank}` : "me",
  };
}
