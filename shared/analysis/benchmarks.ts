/*
 * TYPICAL NUMBERS FOR EACH LEVEL (CFOP, 3x3).
 *
 * These are approximate community figures, not measurements of one person:
 * move counts from the SpeedSolving wiki (OLL averages about 10 moves, PLL
 * about 12, an optimal cross about 6, full CFOP solves 55-60 moves for fast
 * solvers) and the usual split of a CFOP solve (cross about 12%, F2L about half,
 * OLL about 16%, PLL about 20%). The UI calls them "typical", and they are only
 * used to say where a solve loses the most time.
 */

export type LevelId = "sub60" | "sub40" | "sub30" | "sub20" | "sub15" | "sub12" | "sub10" | "world";

export interface Level {
  id: LevelId;
  /** "Sub-20", "World class". */
  label: string;
  /** The same inside a sentence: "sub-20", "world-class". */
  phrase: string;
  /** Solves faster than this belong to the level (ms). */
  underMs: number;
  /** A typical solve at this level (ms). */
  typicalMs: number;
  moves: { total: number; cross: number; pair: number; oll: number; pll: number };
  /** Typical pause to recognize the OLL / PLL case, and before each pair (ms). */
  recognitionMs: { oll: number; pll: number; pair: number };
  /** Usually 2-look OLL/PLL at this level. */
  twoLook: boolean;
}

/** Share of the time of each stage in a typical CFOP solve. */
export const STAGE_SHARE = { cross: 0.12, f2l: 0.52, oll: 0.16, pll: 0.2 } as const;

function level(id: LevelId, label: string, underS: number, typicalS: number, cross: number, oll: number, pll: number, total: number, recog: [number, number, number], twoLook: boolean): Level {
  return {
    id,
    label,
    phrase: id === "world" ? "world-class" : label.toLowerCase(),
    underMs: underS * 1000,
    typicalMs: typicalS * 1000,
    moves: { total, cross, oll, pll, pair: Math.round(((total - cross - oll - pll) / 4) * 10) / 10 },
    recognitionMs: { oll: recog[0], pll: recog[1], pair: recog[2] },
    twoLook,
  };
}

/** Slowest first. */
export const LEVELS: Level[] = [
  level("sub60", "Sub-60", 60, 50, 10, 18, 24, 100, [1800, 1800, 1500], true),
  level("sub40", "Sub-40", 40, 35, 9, 17, 22, 85, [1300, 1300, 1100], true),
  level("sub30", "Sub-30", 30, 26, 8, 16, 20, 75, [1000, 1000, 800], true),
  level("sub20", "Sub-20", 20, 18, 7.5, 12, 14, 65, [700, 700, 550], false),
  level("sub15", "Sub-15", 15, 13.5, 7, 10, 12, 62, [500, 500, 400], false),
  level("sub12", "Sub-12", 12, 11, 6.5, 10, 12, 60, [400, 400, 300], false),
  level("sub10", "Sub-10", 10, 9, 6.5, 10, 12, 58, [300, 300, 250], false),
  level("world", "World class", 8, 6.5, 6, 10, 12, 55, [200, 200, 150], false),
];

/** The level a time belongs to (the fastest one it's under). */
export function levelOf(timeMs: number): Level {
  let found = LEVELS[0];
  for (const l of LEVELS) if (timeMs < l.underMs) found = l;
  return found;
}

/** The next level up: what to aim for. */
export function nextLevel(timeMs: number): Level {
  const current = levelOf(timeMs);
  if (timeMs >= current.underMs) return current; // slower than sub-60: aim for sub-60
  const i = LEVELS.indexOf(current);
  return LEVELS[Math.min(i + 1, LEVELS.length - 1)];
}

/** Typical time of each stage for a level (ms). */
export function typicalStageMs(l: Level): { cross: number; pair: number; oll: number; pll: number } {
  return {
    cross: l.typicalMs * STAGE_SHARE.cross,
    pair: (l.typicalMs * STAGE_SHARE.f2l) / 4,
    oll: l.typicalMs * STAGE_SHARE.oll,
    pll: l.typicalMs * STAGE_SHARE.pll,
  };
}
