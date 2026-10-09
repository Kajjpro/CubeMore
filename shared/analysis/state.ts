/*
 * READING A CUBE STATE the CFOP way, for any cross color.
 *
 * For each face as the cross face: is the cross solved, which F2L slots are
 * solved, is the last layer oriented, is the cube solved. A sticker is "in
 * place" when it has the color of the center on its side, so this works
 * whatever the cube's orientation is.
 */

import { FACES, NORMAL, STICKERS, dot, isSolved, stickerAt, type Face, type Facelets, type Vec } from "../cube3";

export const OPPOSITE: Record<Face, Face> = { U: "D", D: "U", R: "L", L: "R", F: "B", B: "F" };

/** The center sticker on each sticker's side. */
const HOME_CENTER = STICKERS.map((s) => stickerAt(s.n, s.n));

/** The facelet indexes of every sticker of the cubie at `p`. */
export function cubieStickers(p: Vec): number[] {
  const result: number[] = [];
  for (const face of FACES) {
    const n = NORMAL[face];
    if (dot(p, n) === 1) result.push(stickerAt(p, n));
  }
  return result;
}

const nonZero = (p: Vec) => p.filter((v) => v !== 0).length;
const allCubies: Vec[] = [];
for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) allCubies.push([x, y, z]);

export interface Slot {
  /** The corner on the cross layer and the edge above it. */
  corner: Vec;
  edge: Vec;
  stickers: number[];
}

export interface FaceLayout {
  face: Face;
  center: number;
  crossEdges: Vec[];
  crossStickers: number[];
  slots: Slot[];
  /** The 9 stickers of the face opposite the cross. */
  lastFace: number[];
}

function layoutFor(face: Face): FaceLayout {
  const n = NORMAL[face];
  const crossEdges = allCubies.filter((p) => nonZero(p) === 2 && dot(p, n) === 1);
  const corners = allCubies.filter((p) => nonZero(p) === 3 && dot(p, n) === 1);
  const slots = corners.map((corner) => {
    const edge: Vec = [corner[0] - n[0], corner[1] - n[1], corner[2] - n[2]];
    return { corner, edge, stickers: [...cubieStickers(corner), ...cubieStickers(edge)] };
  });
  const opposite = NORMAL[OPPOSITE[face]];
  return {
    face,
    center: stickerAt(n, n),
    crossEdges,
    crossStickers: crossEdges.flatMap(cubieStickers),
    slots,
    lastFace: STICKERS.flatMap((s, i) => (dot(s.n, opposite) === 1 ? [i] : [])),
  };
}

export const LAYOUTS: Record<Face, FaceLayout> = Object.fromEntries(FACES.map((f) => [f, layoutFor(f)])) as Record<Face, FaceLayout>;

const inPlace = (state: Facelets, stickers: number[]) => stickers.every((i) => state[i] === state[HOME_CENTER[i]]);

export function crossSolved(state: Facelets, face: Face): boolean {
  return inPlace(state, LAYOUTS[face].crossStickers);
}

/** Which of the face's 4 slots are solved (indexes into LAYOUTS[face].slots). */
export function solvedSlots(state: Facelets, face: Face): number[] {
  return LAYOUTS[face].slots.flatMap((slot, i) => (inPlace(state, slot.stickers) ? [i] : []));
}

export function lastLayerOriented(state: Facelets, face: Face): boolean {
  const last = LAYOUTS[face].lastFace;
  return last.every((i) => state[i] === state[last[4]]);
}

/**
 * CFOP progress with this cross face:
 *   0 nothing, 1 cross, 2..5 cross + 1..4 pairs, 6 last layer oriented, 7 solved.
 */
export function progress(state: Facelets, face: Face): number {
  if (isSolved(state)) return 7;
  if (!crossSolved(state, face)) return 0;
  const pairs = solvedSlots(state, face).length;
  if (pairs < 4) return 1 + pairs;
  return lastLayerOriented(state, face) ? 6 : 5;
}

/** The face with this color's center (centers never move with face turns). */
export function faceOfColor(state: Facelets, color: string): Face {
  return FACES.find((f) => state[LAYOUTS[f].center] === color)!;
}

/** The colors (center letters) of the sides a cubie's stickers face, e.g. a slot's corner: "FRD". */
export function cubieColors(state: Facelets, p: Vec): string {
  return cubieStickers(p)
    .map((i) => state[HOME_CENTER[i]])
    .join("");
}
