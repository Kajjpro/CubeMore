/*
 * RECOGNIZING THE OLL AND PLL CASE of a state, by trying the algorithms.
 *
 * The state is turned so the cross is on the bottom, then each case's algorithm
 * is tried after 0-3 U turns (and, for PLL, followed by 0-3 U turns). The case
 * whose algorithm works is the case. Slow-ish (a few hundred tries) but exact,
 * and it can never disagree with the algorithm we then suggest.
 */

import { isSolved, type Face, type Facelets } from "../cube3";
import { OLL_CASES, PLL_CASES, type LastLayerCase } from "./algs";
import { applyAlg, parseAlg, type ParsedMove } from "./notation";
import { FACES } from "../cube3";
import { progress } from "./state";

/** The rotation that brings each face to the bottom. */
export const TO_BOTTOM: Record<Face, string> = { D: "", U: "x2", F: "x'", B: "x", R: "z", L: "z'" };

const U_TURNS = ["", "U", "U2", "U'"];

const parsedAlgs = new Map<string, ParsedMove[]>();
function parsed(alg: string): ParsedMove[] {
  let moves = parsedAlgs.get(alg);
  if (!moves) parsedAlgs.set(alg, (moves = parseAlg(alg)));
  return moves;
}

/** The state turned so the `crossFace` is on the bottom. */
export function crossOnBottom(state: Facelets, crossFace: Face): Facelets {
  return applyAlg(state, TO_BOTTOM[crossFace]);
}

/** F2L solved and the last layer oriented, whatever the orientation. */
function oriented(state: Facelets): boolean {
  return FACES.some((face) => progress(state, face) >= 6);
}

export interface Recognized {
  case: LastLayerCase;
  /** U turns before the algorithm ("", "U", "U2", "U'"). */
  preAuf: string;
}

/** The OLL case of a state whose F2L (with this cross face) is solved, or null (already oriented, or not found). */
export function recognizeOll(state: Facelets, crossFace: Face): Recognized | null {
  const bottom = crossOnBottom(state, crossFace);
  if (oriented(bottom)) return null;
  for (const turn of U_TURNS) {
    const start = turn ? applyAlg(bottom, turn) : bottom;
    for (const c of OLL_CASES) {
      if (oriented(applyAlg(start, parsed(c.alg)))) return { case: c, preAuf: turn };
    }
  }
  return null;
}

/** The PLL case of a state whose last layer is oriented, or null (solved after U turns, or not found). */
export function recognizePll(state: Facelets, crossFace: Face): Recognized | null {
  const bottom = crossOnBottom(state, crossFace);
  if (aufOnly(bottom)) return null;
  for (const turn of U_TURNS) {
    const start = turn ? applyAlg(bottom, turn) : bottom;
    for (const c of PLL_CASES) {
      if (aufOnly(applyAlg(start, parsed(c.alg)))) return { case: c, preAuf: turn };
    }
  }
  return null;
}

/** Solved, or solved after a U turn (with any cube orientation). */
export function aufOnly(state: Facelets): boolean {
  if (isSolved(state)) return true;
  // The algorithms may end with the cube turned, so try turning each face.
  for (const face of FACES) {
    for (const amount of ["", "2", "'"]) {
      if (isSolved(applyAlg(state, face + amount))) return true;
    }
  }
  return false;
}
