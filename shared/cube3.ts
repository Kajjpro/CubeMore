/*
 * A tiny 3x3 cube model, used by both sides:
 *   - the browser follows a smart cube with it (guided scramble, solved check)
 *   - the server replays a smart cube solve with it, to verify it
 *
 * The cube is 54 stickers in the "Kociemba facelets" order that GAN cubes
 * report: U1..U9, R1..R9, F1..F9, D1..D9, L1..L9, B1..B9, each the letter of
 * the face whose color it has. Solved = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB".
 *
 * Only outer face turns (U R F D L B, with ' or 2): that's all a smart cube
 * reports, so the centers never move.
 */

export type Facelets = string;

export const SOLVED_FACELETS: Facelets = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";

export const FACES = ["U", "R", "F", "D", "L", "B"] as const;
export type Face = (typeof FACES)[number];
export type Vec = [number, number, number];

/** Each face's outward direction (x = right, y = up, z = front). */
export const NORMAL: Record<Face, Vec> = { U: [0, 1, 0], R: [1, 0, 0], F: [0, 0, 1], D: [0, -1, 0], L: [-1, 0, 0], B: [0, 0, -1] };

/**
 * Where sticker 1..9 of each face is, looking at that face from outside in the
 * standard orientation: [the cubie for sticker 1, one step right, one step down].
 */
const LAYOUT: Record<Face, { first: Vec; right: Vec; down: Vec }> = {
  U: { first: [-1, 1, -1], right: [1, 0, 0], down: [0, 0, 1] },
  R: { first: [1, 1, 1], right: [0, 0, -1], down: [0, -1, 0] },
  F: { first: [-1, 1, 1], right: [1, 0, 0], down: [0, -1, 0] },
  D: { first: [-1, -1, 1], right: [1, 0, 0], down: [0, 0, -1] },
  L: { first: [-1, 1, -1], right: [0, 0, 1], down: [0, -1, 0] },
  B: { first: [1, 1, -1], right: [-1, 0, 0], down: [0, -1, 0] },
};

const key = (p: Vec, n: Vec) => `${p.join(",")}|${n.join(",")}`;
export const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** A clockwise quarter turn (seen from outside) about axis `a`: v' = a(a·v) − a×v. */
export const turn = (a: Vec, v: Vec): Vec => {
  const c = cross(a, v);
  const d = dot(a, v);
  return [a[0] * d - c[0], a[1] * d - c[1], a[2] * d - c[2]];
};

/** Every sticker: its cubie position and the direction it faces (index = facelet index). */
export const STICKERS: { p: Vec; n: Vec }[] = [];
for (const face of FACES) {
  const { first, right, down } = LAYOUT[face];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const p: Vec = [0, 1, 2].map((i) => first[i] + right[i] * col + down[i] * row) as Vec;
      STICKERS.push({ p, n: NORMAL[face] });
    }
  }
}
const INDEX = new Map(STICKERS.map((s, i) => [key(s.p, s.n), i]));

/** The facelet index of the sticker at cubie position `p` facing `n`. */
export function stickerAt(p: Vec, n: Vec): number {
  const index = INDEX.get(key(p, n));
  if (index === undefined) throw new Error(`No sticker at ${key(p, n)}`);
  return index;
}

/** For each face's clockwise quarter turn: new[i] = old[FROM[i]]. */
const QUARTER: Record<Face, number[]> = {} as Record<Face, number[]>;
for (const face of FACES) {
  const axis = NORMAL[face];
  const from = STICKERS.map((_, i) => i);
  STICKERS.forEach((s, i) => {
    if (dot(s.p, axis) !== 1) return; // not in this face's layer
    const target = INDEX.get(key(turn(axis, s.p), turn(axis, s.n)))!;
    from[target] = i;
  });
  QUARTER[face] = from;
}

const MOVE = /^([URFDLB])(2|'|2')?$/;

/** True for a face turn a smart cube can report: "R", "U'", "F2". */
export function isFaceMove(move: string): boolean {
  return MOVE.test(move);
}

/** Quarter turns clockwise (1, 2 or 3) for a move. */
function amountOf(suffix: string | undefined): number {
  return suffix === "'" ? 3 : suffix === "2" || suffix === "2'" ? 2 : 1;
}

export function applyMove(state: Facelets, move: string): Facelets {
  const parsed = MOVE.exec(move);
  if (!parsed) throw new Error(`Not a face turn: ${move}`);
  const from = QUARTER[parsed[1] as Face];
  let result = state;
  for (let n = amountOf(parsed[2]); n > 0; n--) {
    let next = "";
    for (let i = 0; i < 54; i++) next += result[from[i]];
    result = next;
  }
  return result;
}

export function applyMoves(state: Facelets, moves: readonly string[]): Facelets {
  return moves.reduce(applyMove, state);
}

/** "R U R' U'" -> ["R", "U", "R'", "U'"]. Throws on anything that isn't a face turn. */
export function parseMoves(alg: string): string[] {
  const moves = alg.split(/\s+/).filter(Boolean);
  for (const move of moves) if (!isFaceMove(move)) throw new Error(`Not a face turn: ${move}`);
  return moves;
}

/** Solved in any orientation: every face is one color. (Face turns never move the centers.) */
export function isSolved(state: Facelets): boolean {
  for (let face = 0; face < 6; face++) {
    const center = state[face * 9 + 4];
    for (let i = face * 9; i < face * 9 + 9; i++) if (state[i] !== center) return false;
  }
  return true;
}

function moveText(face: string, amount: number): string | null {
  const quarter = ((amount % 4) + 4) % 4;
  return quarter === 0 ? null : face + (quarter === 1 ? "" : quarter === 2 ? "2" : "'");
}

/** Joins turns of the same face that follow each other: R R -> R2, R R' -> nothing, R2 R -> R'. */
export function simplifyMoves(moves: readonly string[]): string[] {
  const result: { face: string; amount: number }[] = [];
  for (const move of moves) {
    const [, face, suffix] = MOVE.exec(move)!;
    const last = result[result.length - 1];
    if (last && last.face === face) {
      last.amount = (last.amount + amountOf(suffix)) % 4;
      if (last.amount === 0) result.pop();
    } else {
      result.push({ face, amount: amountOf(suffix) });
    }
  }
  return result.map((m) => moveText(m.face, m.amount)!);
}

/** The moves that undo `moves`: reversed, each one turned the other way. */
export function invertMoves(moves: readonly string[]): string[] {
  return [...moves].reverse().map((move) => {
    const [, face, suffix] = MOVE.exec(move)!;
    return moveText(face, 4 - amountOf(suffix))!;
  });
}
