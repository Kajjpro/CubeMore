/*
 * SHORTEST SOLUTIONS for the cross and for one F2L pair (cross on the bottom).
 *
 * Pieces are followed by where ONE of their stickers is (24 places for edge
 * stickers, 24 for corner stickers): that says both where the piece is and
 * how it's turned. Distance tables are made once, by breadth-first search from
 * the solved state, and kept for the session:
 *   - the cross: the 4 bottom edges (190,080 reachable states), with all 18 turns
 *     and again without D turns (F2L doesn't turn D)
 *   - each slot: its corner and its edge (576 states)
 * The cross table is exact, so the shortest cross is found by just walking
 * downhill. A pair is found by iterative deepening (IDA*), keeping the cross and
 * the pairs already solved in place.
 */

import { STICKERS, stickerAt, type Facelets, type Vec } from "../cube3";
import { destOf, parseToken, type ParsedMove } from "./notation";
import { LAYOUTS, cubieStickers } from "./state";

const nonZero = (p: Vec) => p.filter((v) => v !== 0).length;
const isEdgeSticker = (i: number) => nonZero(STICKERS[i].p) === 2;
const isCornerSticker = (i: number) => nonZero(STICKERS[i].p) === 3;

const EDGE_STICKERS = STICKERS.flatMap((_, i) => (isEdgeSticker(i) ? [i] : []));
const CORNER_STICKERS = STICKERS.flatMap((_, i) => (isCornerSticker(i) ? [i] : []));
const EDGE_INDEX = new Map(EDGE_STICKERS.map((s, i) => [s, i]));
const CORNER_INDEX = new Map(CORNER_STICKERS.map((s, i) => [s, i]));

const FACE_TURNS = ["U", "R", "F", "D", "L", "B"].flatMap((f) => [f, `${f}2`, `${f}'`]);
const F2L_TURNS = FACE_TURNS.filter((m) => !m.startsWith("D"));

interface MoveSet {
  names: string[];
  /** The face of each move (to skip "R R'" and "L R L"-style repeats). */
  faces: string[];
  edge: Int8Array[];
  corner: Int8Array[];
}

function moveSet(names: string[]): MoveSet {
  const dests = names.map((n) => destOf(parseToken(n) as ParsedMove));
  return {
    names,
    faces: names.map((n) => n[0]),
    edge: dests.map((d) => Int8Array.from(EDGE_STICKERS, (s) => EDGE_INDEX.get(d[s])!)),
    corner: dests.map((d) => Int8Array.from(CORNER_STICKERS, (s) => CORNER_INDEX.get(d[s])!)),
  };
}

const ALL = moveSet(FACE_TURNS);
const F2L = moveSet(F2L_TURNS);

/** Opposite faces, to search only one order of "R L" / "L R". */
const OPPOSITE_FIRST: Record<string, string> = { L: "R", B: "F", D: "U" };

/** Skips a move on the same face as the last one, and the second order of two opposite faces. */
function redundant(face: string, last: string | null, beforeLast: string | null): boolean {
  if (last === null) return false;
  if (face === last) return true;
  // Of "R L" and "L R", only search "R L"; "R L R" is the same as "R2 L".
  if (OPPOSITE_FIRST[face] === last) return true;
  if (OPPOSITE_FIRST[last] === face && beforeLast === face) return true;
  return false;
}

// ---------------------------------------------------------------------------
// The cross (always the D face: callers turn the cube first)

const D = LAYOUTS.D;
/** The bottom sticker of each cross edge, solved. */
const CROSS_HOME = D.crossEdges.map((p) => EDGE_INDEX.get(stickerAt(p, [0, -1, 0]))!);

const crossKey = (e: ArrayLike<number>) => ((e[0] * 24 + e[1]) * 24 + e[2]) * 24 + e[3];

function crossTable(set: MoveSet): Uint8Array {
  const table = new Uint8Array(24 ** 4).fill(255);
  let frontier: Int8Array[] = [Int8Array.from(CROSS_HOME)];
  table[crossKey(CROSS_HOME)] = 0;
  for (let depth = 0; frontier.length > 0; depth++) {
    const next: Int8Array[] = [];
    for (const state of frontier) {
      for (const edge of set.edge) {
        const moved = state.map((e) => edge[e]);
        const key = crossKey(moved);
        if (table[key] !== 255) continue;
        table[key] = depth + 1;
        next.push(moved);
      }
    }
    frontier = next;
  }
  return table;
}

let crossAll: Uint8Array | null = null;
let crossF2l: Uint8Array | null = null;
const crossTableAll = () => (crossAll ??= crossTable(ALL));
const crossTableF2l = () => (crossF2l ??= crossTable(F2L));

/** Where the piece that belongs at `home` (its stickers there) is now: its stickers, in the same order. */
function locate(state: Facelets, home: number[]): number[] {
  const colors = home.map((i) => state[stickerAt(STICKERS[i].n, STICKERS[i].n)]);
  const sameKind = (p: Vec) => nonZero(p) === nonZero(STICKERS[home[0]].p);
  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        const p: Vec = [x, y, z];
        if (!sameKind(p)) continue;
        const stickers = cubieStickers(p);
        const letters = stickers.map((i) => state[i]);
        if (colors.every((c) => letters.includes(c)) && letters.every((c) => colors.includes(c))) {
          return colors.map((c) => stickers[letters.indexOf(c)]);
        }
      }
    }
  }
  throw new Error("Piece not found: not a real cube state");
}

/** The 4 bottom edges' bottom stickers, as edge sticker numbers. */
function crossPieces(state: Facelets): number[] {
  return D.crossEdges.map((p) => {
    const home = stickerAt(p, [0, -1, 0]);
    const other = cubieStickers(p).find((i) => i !== home)!;
    return EDGE_INDEX.get(locate(state, [home, other])[0])!;
  });
}

/** Moves to solve the cross, cross on the bottom (D). Empty if it's solved. */
export function solveCross(state: Facelets): string[] {
  const table = crossTableAll();
  let pieces = crossPieces(state);
  const moves: string[] = [];
  while (table[crossKey(pieces)] > 0) {
    const distance = table[crossKey(pieces)];
    const i = ALL.edge.findIndex((edge) => table[crossKey(pieces.map((e) => edge[e]))] === distance - 1);
    pieces = pieces.map((e) => ALL.edge[i][e]);
    moves.push(ALL.names[i]);
  }
  return moves;
}

/** How many moves the shortest cross takes (cross on the bottom). */
export function crossDistance(state: Facelets): number {
  return crossTableAll()[crossKey(crossPieces(state))];
}

// ---------------------------------------------------------------------------
// One F2L pair

interface SlotPieces {
  /** The corner's bottom sticker (corner sticker number) and one sticker of the edge (edge sticker number). */
  corner: number;
  edge: number;
}

const SLOT_HOME: SlotPieces[] = D.slots.map((slot) => ({
  corner: CORNER_INDEX.get(stickerAt(slot.corner, [0, -1, 0]))!,
  edge: EDGE_INDEX.get(cubieStickers(slot.edge)[0])!,
}));

const pairTables: (Uint8Array | null)[] = [null, null, null, null];

function pairTable(slot: number): Uint8Array {
  const cached = pairTables[slot];
  if (cached) return cached;
  const table = new Uint8Array(576).fill(255);
  const home = SLOT_HOME[slot];
  let frontier: [number, number][] = [[home.corner, home.edge]];
  table[home.corner * 24 + home.edge] = 0;
  for (let depth = 0; frontier.length > 0; depth++) {
    const next: [number, number][] = [];
    for (const [c, e] of frontier) {
      for (let m = 0; m < F2L.names.length; m++) {
        const nc = F2L.corner[m][c];
        const ne = F2L.edge[m][e];
        if (table[nc * 24 + ne] !== 255) continue;
        table[nc * 24 + ne] = depth + 1;
        next.push([nc, ne]);
      }
    }
    frontier = next;
  }
  pairTables[slot] = table;
  return table;
}

function slotPieces(state: Facelets, slot: number): SlotPieces {
  const { corner, edge } = D.slots[slot];
  const cornerHome = stickerAt(corner, [0, -1, 0]);
  const cornerStickers = [cornerHome, ...cubieStickers(corner).filter((i) => i !== cornerHome)];
  const edgeStickers = cubieStickers(edge);
  return {
    corner: CORNER_INDEX.get(locate(state, cornerStickers)[0])!,
    edge: EDGE_INDEX.get(locate(state, edgeStickers)[0])!,
  };
}

export interface PairSolution {
  moves: string[];
  /** False when the search gave up (too deep or too long): `moves` is then empty. */
  complete: boolean;
}

/** Most moves a pair suggestion may have, and how long we may search (ms). */
const MAX_PAIR_DEPTH = 14;
const PAIR_BUDGET_MS = 400;

/**
 * The shortest way (no D turns) to solve the pair of `slot` (index into
 * LAYOUTS.D.slots) while the cross and the pairs in `keep` stay solved.
 * The cross must be solved, the cube turned so it's on the bottom.
 */
export function solvePair(state: Facelets, slot: number, keep: number[]): PairSolution {
  const cross = crossTableF2l();
  const crossStart = Int8Array.from(crossPieces(state));
  const slots = [slot, ...keep.filter((k) => k !== slot)];
  const tables = slots.map(pairTable);
  const start = slots.map((s) => slotPieces(state, s));
  const corners = Int8Array.from(start.map((p) => p.corner));
  const edges = Int8Array.from(start.map((p) => p.edge));

  const heuristic = (cr: Int8Array, co: Int8Array, ed: Int8Array) => {
    let h = cross[crossKey(cr)];
    for (let i = 0; i < tables.length; i++) h = Math.max(h, tables[i][co[i] * 24 + ed[i]]);
    return h;
  };

  const deadline = performance.now() + PAIR_BUDGET_MS;
  let nodes = 0;
  let outOfTime = false;
  const path: number[] = [];
  const search = (cr: Int8Array, co: Int8Array, ed: Int8Array, depth: number, last: string | null, beforeLast: string | null): boolean => {
    const h = heuristic(cr, co, ed);
    if (h === 0) return true;
    if (h > depth || outOfTime) return false;
    if (++nodes % 4096 === 0 && performance.now() > deadline) {
      outOfTime = true;
      return false;
    }
    for (let m = 0; m < F2L.names.length; m++) {
      const face = F2L.faces[m];
      if (redundant(face, last, beforeLast)) continue;
      const edge = F2L.edge[m];
      const corner = F2L.corner[m];
      path.push(m);
      if (search(cr.map((e) => edge[e]), co.map((c) => corner[c]), ed.map((e) => edge[e]), depth - 1, face, last)) return true;
      path.pop();
    }
    return false;
  };

  for (let depth = heuristic(crossStart, corners, edges); depth <= MAX_PAIR_DEPTH; depth++) {
    if (search(crossStart, corners, edges, depth, null, null)) return { moves: path.map((m) => F2L.names[m]), complete: true };
    if (outOfTime) break;
  }
  return { moves: [], complete: false };
}

/** Builds the distance tables ahead of time (a fraction of a second), so the first analysis is quick. */
export function warmUp(): void {
  crossTableAll();
  crossTableF2l();
  for (let slot = 0; slot < 4; slot++) pairTable(slot);
}
