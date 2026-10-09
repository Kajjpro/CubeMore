/*
 * FACTS ABOUT EACH OLL AND PLL CASE, worked out from the cube model (not typed
 * in by hand): how often it comes up, what it looks like, how many moves its
 * algorithm takes, and its address on the site. Used by the algorithm pages.
 */

import { FACES, SOLVED_FACELETS, type Facelets } from "../cube3";
import { OLL_CASES, PLL_CASES, TWO_LOOK_OLL, TWO_LOOK_PLL, type LastLayerCase } from "./algs";
import { ALTERNATIVE_ALGS } from "./algAlternatives";
import { casePath } from "./caseSlugs";
import { applyAlg, invertAlg, parseAlg } from "./notation";

export type Step = "oll" | "pll";

export interface CaseInfo extends LastLayerCase {
  step: Step;
  /** "27" for OLL 27, "T" for the T perm. */
  short: string;
  /** "27-sune", "t-perm". */
  slug: string;
  path: string;
  /** The case on a solved-F2L cube, cross on the bottom (the state its algorithm solves). */
  state: Facelets;
  /** It comes up in 1 of `oneIn` solves (with no skip tricks). */
  oneIn: number;
  /** Moves of the main algorithm (each turn, wide turn or slice counts 1; rotations don't). */
  moves: number;
  alternatives: string[];
  /** Part of the 2-look sets beginners learn first. */
  twoLook: boolean;
  /** OLL: the shape on top. PLL: what moves. One plain sentence. */
  look: string;
  /** OLL: "Dot", "Line", "L shape", "Cross", "Corners done". PLL: "Corners only", "Edges only", "Corners and edges". */
  group: string;
}

/** The U face and the top rows of the four sides (21 stickers): what a case looks like from above. */
const U_FACE = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const TOP_ROWS = [9, 10, 11, 18, 19, 20, 36, 37, 38, 45, 46, 47];
const LAST_LAYER = [...U_FACE, ...TOP_ROWS];

/** Which last-layer stickers show the top colour (OLL looks only at that). */
const orientationPattern = (state: Facelets) => LAST_LAYER.map((i) => (state[i] === state[4] ? "1" : "0")).join("");

/** The last layer up to the final U turn (PLL looks at the whole layer). */
function permutationPattern(state: Facelets): string {
  return ["", "U", "U2", "U'"]
    .map((auf) => {
      const s = auf ? applyAlg(state, auf) : state;
      return LAST_LAYER.map((i) => s[i]).join("");
    })
    .sort()[0];
}

/** The same cube turned around (y), with each colour named by the face its center is on now. */
function seenFrom(state: Facelets, turn: string): Facelets {
  if (!turn) return state;
  const turned = applyAlg(state, turn);
  const faceOf: Record<string, string> = {};
  FACES.forEach((face, i) => (faceOf[turned[i * 9 + 4]] = face));
  return [...turned].map((c) => faceOf[c]).join("");
}

const countMoves = (alg: string) => parseAlg(alg).filter((m) => !/^[xyz]$/.test(m.name)).length;

/** The edges (U2 U4 U6 U8 = indexes 1 3 5 7) and corners showing the top colour. */
function ollLook(state: Facelets): { look: string; group: string } {
  const up = (i: number) => state[i] === state[4];
  const edges = [1, 3, 5, 7].filter(up);
  const corners = [0, 2, 6, 8].filter(up).length;
  const cornerText = corners === 4 ? "all four corners face up" : corners === 0 ? "no corner faces up" : `${corners === 1 ? "one corner faces" : `${["", "", "two", "three"][corners]} corners face`} up`;
  if (edges.length === 4) return { group: "Cross", look: `A cross on top (all four edges oriented), and ${cornerText}.` };
  if (edges.length === 0) return { group: corners === 4 ? "Corners done" : "Dot", look: `No edge faces up (a dot in the middle), and ${cornerText}.` };
  const line = (edges.includes(1) && edges.includes(7)) || (edges.includes(3) && edges.includes(5));
  if (corners === 4) return { group: "Corners done", look: `All four corners face up, and two edges ${line ? "in a line" : "make an L"}.` };
  return { group: line ? "Line" : "L shape", look: `Two edges face up ${line ? "in a line" : "in an L shape"}, and ${cornerText}.` };
}

/** Last-layer corners and edges out of place (U layer cubies), at the AUF that moves the fewest. */
function pllLook(state: Facelets): { look: string; group: string } {
  const corners = [[0, 36, 47], [2, 45, 11], [6, 18, 38], [8, 9, 20]];
  const edges = [[1, 46], [3, 37], [5, 10], [7, 19]];
  let best = { c: 9, e: 9, moved: [] as number[] };
  for (const auf of ["", "U", "U2", "U'"]) {
    const s = auf ? applyAlg(state, auf) : state;
    const off = (cubies: number[][]) => cubies.map((c, i) => (c.some((k) => s[k] !== SOLVED_FACELETS[k]) ? i : -1)).filter((i) => i >= 0);
    const c = off(corners);
    const e = off(edges);
    if (c.length + e.length < best.c + best.e) best = { c: c.length, e: e.length, moved: c };
  }
  const words = ["no", "one", "two", "three", "four"];
  if (best.c === 0) return { group: "Edges only", look: `Only edges move: ${words[best.e]} edges ${best.e === 3 ? "cycle" : "swap"}, the corners are already solved.` };
  if (best.e === 0) return { group: "Corners only", look: `Only corners move: ${words[best.c]} corners ${best.c === 3 ? "cycle" : "swap"}, the edges are already solved.` };
  let swap = "";
  if (best.c === 2) {
    // Corner slots 0 1 2 3 = back-left, back-right, front-left, front-right: 0+3 and 1+2 are diagonal.
    const [a, b] = best.moved;
    swap = a + b === 3 ? " The corner swap is diagonal." : " The corner swap is next to each other (you'll see headlights on one side).";
  }
  return { group: "Corners and edges", look: `${words[best.c][0].toUpperCase() + words[best.c].slice(1)} corners and ${words[best.e]} edges move.${swap}` };
}

function build(c: LastLayerCase, step: Step): CaseInfo {
  const state = applyAlg(SOLVED_FACELETS, invertAlg(c.alg));
  const short = c.id.split(" ")[1];
  const path = casePath(c);
  const slug = path.slice(path.lastIndexOf("/") + 1);
  // How many different situations the case covers (seen from the 4 sides), out of all of them.
  const pattern = step === "oll" ? orientationPattern : permutationPattern;
  const views = new Set(["", "y", "y2", "y'"].map((turn) => pattern(seenFrom(state, turn))));
  const total = step === "oll" ? 216 : 72;
  return {
    ...c,
    step,
    short,
    slug,
    path,
    state,
    oneIn: Math.round(total / views.size),
    moves: countMoves(c.alg),
    alternatives: ALTERNATIVE_ALGS[c.id] ?? [],
    twoLook: (step === "oll" ? TWO_LOOK_OLL : TWO_LOOK_PLL).has(c.id),
    ...(step === "oll" ? ollLook(state) : pllLook(state)),
  };
}

let cache: { oll: CaseInfo[]; pll: CaseInfo[] } | null = null;

/** Every case with its facts (worked out once). */
export function allCases(): { oll: CaseInfo[]; pll: CaseInfo[] } {
  return (cache ??= { oll: OLL_CASES.map((c) => build(c, "oll")), pll: PLL_CASES.map((c) => build(c, "pll")) });
}

export function caseByPath(path: string): CaseInfo | undefined {
  const { oll, pll } = allCases();
  return [...oll, ...pll].find((c) => c.path === path);
}

export function caseById(id: string): CaseInfo | undefined {
  const { oll, pll } = allCases();
  return [...oll, ...pll].find((c) => c.id === id);
}

export { algorithmPaths } from "./caseSlugs";
