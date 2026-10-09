/*
 * FULL 3x3 NOTATION on the facelet model of cube3.ts.
 *
 * A smart cube only reports outer face turns, but algorithms are written with
 * wide turns (r, Rw), slices (M E S) and rotations (x y z). This applies any of
 * them to facelets, so the analyzer can test the algorithms people really use.
 * Slices and rotations move the centers: "solved" still means each face is one
 * color, wherever its center went.
 */

import { NORMAL, STICKERS, dot, stickerAt, turn, type Facelets, type Face, type Vec } from "../cube3";

/** Which layers a move turns, and around which axis (clockwise seen from that side). */
interface MoveShape {
  axis: Vec;
  /** The layers, as values of dot(position, axis): 1 = the outer face, 0 = the middle, -1 = the far face. */
  layers: number[];
}

const SHAPES: Record<string, MoveShape> = {};
for (const face of ["U", "R", "F", "D", "L", "B"] as Face[]) {
  SHAPES[face] = { axis: NORMAL[face], layers: [1] };
  SHAPES[face.toLowerCase()] = { axis: NORMAL[face], layers: [1, 0] };
  SHAPES[`${face}w`] = SHAPES[face.toLowerCase()];
}
// M turns like L, E like D, S like F.
SHAPES.M = { axis: NORMAL.L, layers: [0] };
SHAPES.E = { axis: NORMAL.D, layers: [0] };
SHAPES.S = { axis: NORMAL.F, layers: [0] };
// x turns like R, y like U, z like F (the whole cube).
SHAPES.x = { axis: NORMAL.R, layers: [1, 0, -1] };
SHAPES.y = { axis: NORMAL.U, layers: [1, 0, -1] };
SHAPES.z = { axis: NORMAL.F, layers: [1, 0, -1] };

/** For each move name's clockwise quarter turn: where each sticker goes (dest[i]). */
const QUARTER_DEST = new Map<string, Int8Array>();
for (const [name, shape] of Object.entries(SHAPES)) {
  const dest = new Int8Array(54);
  STICKERS.forEach((s, i) => {
    dest[i] = shape.layers.includes(dot(s.p, shape.axis)) ? stickerAt(turn(shape.axis, s.p), turn(shape.axis, s.n)) : i;
  });
  QUARTER_DEST.set(name, dest);
}

const TOKEN = /^([URFDLB]w|[URFDLBurfdlbMESxyz])(\d*)('?)$/;

export interface ParsedMove {
  /** "R", "r", "Rw", "M", "x"... */
  name: string;
  /** Clockwise quarter turns: 1, 2 or 3. */
  amount: number;
}

/** "R2'" -> { name: "R", amount: 2 }. Null for anything else. */
export function parseToken(token: string): ParsedMove | null {
  const parsed = TOKEN.exec(token);
  if (!parsed) return null;
  const count = parsed[2] === "" ? 1 : Number(parsed[2]);
  const amount = (((parsed[3] === "'" ? -count : count) % 4) + 4) % 4;
  return { name: parsed[1], amount };
}

/** Splits an algorithm into moves, ignoring brackets. Throws on anything unknown. */
export function parseAlg(alg: string): ParsedMove[] {
  return alg
    .replace(/[()[\]]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const move = parseToken(token);
      if (!move) throw new Error(`Unknown move: ${token}`);
      return move;
    })
    .filter((move) => move.amount !== 0);
}

export function formatMove(move: ParsedMove): string {
  return move.name + (move.amount === 1 ? "" : move.amount === 2 ? "2" : "'");
}

/** Where each sticker goes with this move: dest[i]. */
export function destOf(move: ParsedMove): Int8Array {
  const quarter = QUARTER_DEST.get(move.name)!;
  let dest = Int8Array.from({ length: 54 }, (_, i) => i);
  for (let n = 0; n < move.amount; n++) dest = dest.map((i) => quarter[i]);
  return dest;
}

export function applyParsed(state: Facelets, move: ParsedMove): Facelets {
  const dest = QUARTER_DEST.get(move.name)!;
  let result = state;
  for (let n = 0; n < move.amount; n++) {
    const next = new Array<string>(54);
    for (let i = 0; i < 54; i++) next[dest[i]] = result[i];
    result = next.join("");
  }
  return result;
}

/** Applies an algorithm in any notation ("r U R' U' r' F R F'", "x R2 D2 ..."). */
export function applyAlg(state: Facelets, alg: string | ParsedMove[]): Facelets {
  const moves = typeof alg === "string" ? parseAlg(alg) : alg;
  return moves.reduce(applyParsed, state);
}

/** The algorithm that undoes `alg`. */
export function invertAlg(alg: string | ParsedMove[]): ParsedMove[] {
  const moves = typeof alg === "string" ? parseAlg(alg) : alg;
  return [...moves].reverse().map((m) => ({ name: m.name, amount: (4 - m.amount) % 4 }));
}

export function formatAlg(moves: ParsedMove[]): string {
  return moves.map(formatMove).join(" ");
}

const FACE_LIST: Face[] = ["U", "R", "F", "D", "L", "B"];
const OPPOSITE_FACE: Record<Face, Face> = { U: "D", D: "U", R: "L", L: "R", F: "B", B: "F" };
const faceAtNormal = (v: Vec): Face => FACE_LIST.find((f) => dot(NORMAL[f], v) === 1)!;
/** The rotation that turns like each face: R and L' are x, U and D' are y, F and B' are z. */
const ROTATION_OF: Record<Face, [string, 1 | -1]> = { R: ["x", 1], L: ["x", -1], U: ["y", 1], D: ["y", -1], F: ["z", 1], B: ["z", -1] };
const ROTATION_AXIS: Record<string, Vec> = { x: NORMAL.R, y: NORMAL.U, z: NORMAL.F };

const faceTurn = (face: Face, amount: number) => {
  const a = ((amount % 4) + 4) % 4;
  return a === 0 ? null : face + (a === 1 ? "" : a === 2 ? "2" : "'");
};

/**
 * Any algorithm as the outer face turns a smart cube would report: wide turns,
 * slices and rotations become face turns with the faces renamed. `toCube` maps
 * the held faces to the cube's own (default: held the cube's own way).
 */
export function toFaceTurns(alg: string | ParsedMove[], toCube?: Record<Face, Face>): string[] {
  let held: Record<Face, Face> = toCube ? { ...toCube } : (Object.fromEntries(FACE_LIST.map((f) => [f, f])) as Record<Face, Face>);
  const out: string[] = [];
  const emit = (face: Face, amount: number) => {
    const move = faceTurn(held[face], amount);
    if (move) out.push(move);
  };
  const rotate = (axisName: string, amount: number) => {
    const axis = ROTATION_AXIS[axisName];
    for (let n = 0; n < ((amount % 4) + 4) % 4; n++) {
      const next = { ...held };
      for (const f of FACE_LIST) next[faceAtNormal(turn(axis, NORMAL[f]))] = held[f];
      held = next;
    }
  };
  for (const move of typeof alg === "string" ? parseAlg(alg) : alg) {
    const a = move.amount;
    const base = move.name[0];
    if (/^[URFDLB]$/.test(move.name)) {
      emit(move.name as Face, a);
    } else if (/^[urfdlb]$/.test(move.name) || move.name.endsWith("w")) {
      // r = L + x: the far face turns the same way, and the cube turns with it.
      const face = base.toUpperCase() as Face;
      emit(OPPOSITE_FACE[face], a);
      const [axis, sign] = ROTATION_OF[face];
      rotate(axis, sign * a);
    } else if (move.name === "M") {
      // M = R L' x'
      emit("R", a);
      emit("L", -a);
      rotate("x", -a);
    } else if (move.name === "E") {
      // E = U D' y'
      emit("U", a);
      emit("D", -a);
      rotate("y", -a);
    } else if (move.name === "S") {
      // S = F' B z
      emit("F", -a);
      emit("B", a);
      rotate("z", a);
    } else {
      rotate(move.name, a);
    }
  }
  return out;
}
