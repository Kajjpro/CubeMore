/*
 * HOW THE CUBE IS HELD when we show moves.
 *
 * A smart cube names its turns by the center colors (its "R" is always the same
 * face), but people hold the cube with their cross on the bottom. Suggestions
 * are shown in that hold: "cross color on the bottom, this color in front".
 * A frame is a cube rotation; moves are converted between the cube's own names
 * (to replay on the 3D cube) and the held view (to read).
 */

import { FACES, SOLVED_FACELETS, type Face, type Facelets } from "../cube3";
import { TO_BOTTOM } from "./cases";
import { applyAlg } from "./notation";
import { LAYOUTS, cubieColors } from "./state";

/** Color names of the standard color scheme (white top, green front), by center letter. */
export const COLOR_NAMES: Record<Face, string> = { U: "white", R: "red", F: "green", D: "yellow", L: "orange", B: "blue" };

/** Face letter -> its center sticker. */
const CENTER: Record<Face, number> = Object.fromEntries(FACES.map((f) => [f, LAYOUTS[f].center])) as Record<Face, number>;

export interface Frame {
  /** The rotation from the cube's own orientation, e.g. "x' y". */
  rotation: string;
  bottom: Face;
  front: Face;
  /** Held face -> the cube's own face (same turn): e.g. held "R" is the cube's "F". */
  toCube: Record<Face, Face>;
}

function frameOf(rotation: string): Frame {
  const turned = applyAlg(SOLVED_FACELETS, rotation);
  const toCube = Object.fromEntries(FACES.map((f) => [f, turned[CENTER[f]] as Face])) as Record<Face, Face>;
  return { rotation: rotation.trim(), bottom: toCube.D, front: toCube.F, toCube };
}

const Y_TURNS = ["", " y", " y2", " y'"];

/** Cross on the bottom, the front chosen from `preferFront` (first one possible). */
export function crossFrame(crossFace: Face, preferFront: Face[] = ["F", "R", "B", "L", "U", "D"]): Frame {
  const frames = Y_TURNS.map((y) => frameOf(TO_BOTTOM[crossFace] + y));
  for (const front of preferFront) {
    const found = frames.find((f) => f.front === front);
    if (found) return found;
  }
  return frames[0];
}

/** Cross on the bottom, with this slot (its two side colors, e.g. "FR") at the front right. */
export function slotFrame(crossFace: Face, sideColors: string): Frame {
  for (const y of Y_TURNS) {
    const frame = frameOf(TO_BOTTOM[crossFace] + y);
    const right = frame.toCube.R;
    if (sideColors.includes(frame.front) && sideColors.includes(right) && frame.front !== right) return frame;
  }
  return frameOf(TO_BOTTOM[crossFace]);
}

/** The state seen in a frame. */
export function inFrame(state: Facelets, frame: Frame): Facelets {
  return frame.rotation ? applyAlg(state, frame.rotation) : state;
}

/** Moves read in the held view -> the same turns named the cube's way. */
export function toCubeMoves(moves: string[], frame: Frame): string[] {
  return moves.map((m) => frame.toCube[m[0] as Face] + m.slice(1));
}

/** The cube's turns -> as read in the held view. */
export function toHeldMoves(moves: string[], frame: Frame): string[] {
  const fromCube = Object.fromEntries(FACES.map((f) => [frame.toCube[f], f])) as Record<Face, Face>;
  return moves.map((m) => fromCube[m[0] as Face] + m.slice(1));
}

/** The two side colors of a slot's edge, e.g. "FR" (center letters). */
export function slotColors(state: Facelets, crossFace: Face, slot: number): string {
  return cubieColors(state, LAYOUTS[crossFace].slots[slot].edge);
}
