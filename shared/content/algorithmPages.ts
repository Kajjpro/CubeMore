/*
 * THE ALGORITHM PAGES (/algorithms...), as plain HTML.
 *
 * The same HTML is sent by the server (so search engines read the whole page
 * without running anything) and shown by the website. Every fact comes from
 * the analyzer's cube model (analysis/caseInfo.ts): the algorithms are the ones
 * the analyzer recognizes and checks, the odds and looks are computed.
 */

import { allCases, caseByPath, type CaseInfo, type Step } from "../analysis/caseInfo";
import { invertAlg, formatAlg } from "../analysis/notation";
import type { PageMeta } from "../seo";

const esc = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// ---------------------------------------------------------------------------
// The picture: the top face and the top row of each side, seen from above.

const CELL = 26;
const GAP = 2;
const EDGE = 9;
const START = 14;
/** [facelet, x, y, width, height]: the U face, then back, front, left and right strips. */
const LAYOUT: [number, number, number, number, number][] = [];
for (let row = 0; row < 3; row++) {
  for (let col = 0; col < 3; col++) LAYOUT.push([row * 3 + col, START + col * (CELL + GAP), START + row * (CELL + GAP), CELL, CELL]);
}
[47, 46, 45].forEach((f, i) => LAYOUT.push([f, START + i * (CELL + GAP), 2, CELL, EDGE])); // back (B3 B2 B1, left to right)
[18, 19, 20].forEach((f, i) => LAYOUT.push([f, START + i * (CELL + GAP), 99, CELL, EDGE])); // front
[36, 37, 38].forEach((f, i) => LAYOUT.push([f, 2, START + i * (CELL + GAP), EDGE, CELL])); // left (back to front)
[11, 10, 9].forEach((f, i) => LAYOUT.push([f, 99, START + i * (CELL + GAP), EDGE, CELL])); // right (back to front)

/** An SVG of the case: OLL in yellow and grey, PLL in full colour (yellow top, green front). */
export function caseDiagram(c: CaseInfo, size = 110): string {
  const top = c.state[4];
  const cells = LAYOUT.map(([f, x, y, w, h]) => {
    const cls = c.step === "oll" ? (c.state[f] === top ? "st-y" : "st-o") : `st-${c.state[f]}`;
    return `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}" rx="3"/>`;
  }).join("");
  return `<svg class="case-diagram" viewBox="0 0 110 110" width="${size}" height="${size}" role="img" aria-label="${esc(`${c.id} (${c.name}) seen from the top`)}">${cells}</svg>`;
}

// ---------------------------------------------------------------------------
// Pages

const STEP_NAME: Record<Step, string> = { oll: "OLL", pll: "PLL" };
const STEP_LONG: Record<Step, string> = { oll: "orientation of the last layer", pll: "permutation of the last layer" };
const title = (c: CaseInfo) => (c.step === "oll" ? `${c.id} (${c.name})` : c.name.replace(" perm", " Perm"));

function crumbs(items: [string, string | null][]): string {
  return `<nav class="crumbs small muted" aria-label="Breadcrumb">${items
    .map(([label, href]) => (href ? `<a href="${href}">${esc(label)}</a>` : `<span>${esc(label)}</span>`))
    .join('<span aria-hidden="true">/</span>')}</nav>`;
}

function caseCard(c: CaseInfo): string {
  return `<li class="case-tile"><a href="${c.path}">${caseDiagram(c, 88)}<span class="case-tile-name">${esc(title(c))}</span></a><span class="mono tiny alg">${esc(c.alg)}</span></li>`;
}

const analyzerLine = `<p class="alg-cta small">Have a smart cube? The <a href="/analyze">solve analyzer</a> recognizes your OLL and PLL in every solve and shows how long each one took.</p>`;

/** /algorithms: what OLL and PLL are, 2-look first, then the full sets. */
function indexPage(): string {
  const { oll, pll } = allCases();
  const twoLook = [...oll, ...pll].filter((c) => c.twoLook);
  return `${crumbs([["CubeMore", "/"], ["Algorithms", null]])}
<h1>OLL and PLL algorithms</h1>
<p class="intro">The last layer of the CFOP method takes two steps. OLL (${STEP_LONG.oll}) turns the top face one colour: 57 cases. PLL (${STEP_LONG.pll}) then moves the pieces to their places: 21 cases. Every case below has a picture, the algorithm, how often it comes up and how to recognize it.</p>
<div class="alg-sections">
  <a class="panel alg-section-link" href="/algorithms/oll"><strong>All 57 OLL algorithms</strong><span class="small muted">Grouped by shape: dot, line, L, cross and more.</span></a>
  <a class="panel alg-section-link" href="/algorithms/pll"><strong>All 21 PLL algorithms</strong><span class="small muted">From the T perm to the N perms.</span></a>
</div>
<h2>Start with 2-look</h2>
<p>Learning 78 algorithms takes time. With 2-look OLL and PLL you solve the last layer in four steps with ${twoLook.length} algorithms: orient the edges, then the corners, then permute the corners, then the edges. Learn these first:</p>
<ul class="case-grid">${twoLook.map(caseCard).join("")}</ul>
${analyzerLine}`;
}

/** /algorithms/oll or /algorithms/pll: every case, grouped. */
function listPage(step: Step): string {
  const cases = allCases()[step];
  const groups = [...new Set(cases.map((c) => c.group))];
  const intro =
    step === "oll"
      ? "OLL turns the whole top face one colour, in one algorithm. The cases are grouped by what you see on top: how many edges already face up (dot, line, L shape or cross), and when all the corners are already done."
      : "PLL moves the last layer's pieces to their places, in one algorithm, once the top face is one colour. The cases are grouped by what moves: only corners, only edges, or both.";
  return `${crumbs([["CubeMore", "/"], ["Algorithms", "/algorithms"], [STEP_NAME[step], null]])}
<h1>All ${cases.length} ${STEP_NAME[step]} algorithms</h1>
<p class="intro">${intro} Tap a case for how to recognize it, other algorithms and how to practice it.</p>
${groups
  .map((group) => {
    const inGroup = cases.filter((c) => c.group === group);
    return `<section class="case-group"><h2>${esc(group)} <span class="muted small">${inGroup.length} cases</span></h2><ul class="case-grid">${inGroup.map(caseCard).join("")}</ul></section>`;
  })
  .join("\n")}
${analyzerLine}`;
}

/** One case: picture, algorithm, odds, recognition, other algorithms, practice, related cases. */
function casePage(c: CaseInfo): string {
  const cases = allCases()[c.step];
  const i = cases.indexOf(c);
  const prev = cases[(i - 1 + cases.length) % cases.length];
  const next = cases[(i + 1) % cases.length];
  const related = cases.filter((o) => o.group === c.group && o !== c).slice(0, 8);
  const setup = formatAlg(invertAlg(c.alg));
  const alternatives = c.alternatives.length
    ? `<h2>Other algorithms</h2><ul class="alg-list">${c.alternatives.map((a) => `<li class="mono alg">${esc(a)}</li>`).join("")}</ul><p class="tiny muted">All checked on a cube model: each one solves this case. Some need a U turn first.</p>`
    : "";
  const twoLook = c.twoLook
    ? `<p>This is one of the 2-look ${STEP_NAME[c.step]} algorithms, so it's worth learning early.</p>`
    : `<p>Not part of 2-look ${STEP_NAME[c.step]}: until you know it, you can solve this case in two algorithms. Learn it once the <a href="/algorithms">2-look set</a> feels easy.</p>`;
  return `${crumbs([["CubeMore", "/"], ["Algorithms", "/algorithms"], [STEP_NAME[c.step], `/algorithms/${c.step}`], [c.step === "oll" ? c.id : c.name, null]])}
<article class="case-page">
  <header class="case-head">
    ${caseDiagram(c, 140)}
    <div>
      <h1>${esc(title(c))} algorithm</h1>
      <p class="case-main mono alg">${esc(c.alg)}</p>
      <p class="small muted">${c.moves} moves. Comes up in about 1 of ${c.oneIn} solves. Group: ${esc(c.group)}.</p>
    </div>
  </header>
  <h2>How to recognize it</h2>
  <p>${esc(c.look)} Hold the cube with the solved layers at the bottom and look at the top and the top row of each side, as in the picture.</p>
  ${alternatives}
  <h2>How to practice it</h2>
  <p>Do the algorithm slowly five times, saying the moves, then faster without looking at it. To set the case up on a solved cube, do this first:</p>
  <p class="mono alg">${esc(setup)}</p>
  ${twoLook}
  ${related.length ? `<h2>Similar cases</h2><ul class="case-grid">${related.map(caseCard).join("")}</ul>` : ""}
  <nav class="case-nav small"><a href="${prev.path}">Previous: ${esc(title(prev))}</a><a href="${next.path}">Next: ${esc(title(next))}</a></nav>
  ${analyzerLine}
</article>`;
}

/** The body of an algorithm page, or null when the address isn't one. */
export function algorithmPageHtml(path: string): string | null {
  if (path === "/algorithms") return indexPage();
  if (path === "/algorithms/oll") return listPage("oll");
  if (path === "/algorithms/pll") return listPage("pll");
  const c = caseByPath(path);
  return c ? casePage(c) : null;
}

/** Title and description for search results. */
export function algorithmPageMeta(path: string): PageMeta | null {
  if (path === "/algorithms") {
    return {
      path,
      title: "OLL and PLL Algorithms: All 78 Cases with Pictures | CubeMore",
      description: "Every OLL and PLL algorithm for the CFOP method, with a picture of each case, how often it comes up, how to recognize it, and the 2-look set to learn first. Free.",
    };
  }
  if (path === "/algorithms/oll" || path === "/algorithms/pll") {
    const step = path.endsWith("oll") ? "oll" : "pll";
    const n = allCases()[step].length;
    return {
      path,
      title: `All ${n} ${STEP_NAME[step]} Algorithms with Pictures | CubeMore`,
      description:
        step === "oll"
          ? "All 57 OLL algorithms (orientation of the last layer) with pictures, grouped by shape: dot, line, L, cross. Odds, recognition and alternative algorithms for each case."
          : "All 21 PLL algorithms (permutation of the last layer) with pictures: T, J, R, U, A, G, N, V, Y, E, F, H and Z perms. Odds, recognition and other algorithms.",
    };
  }
  const c = caseByPath(path);
  if (!c) return null;
  return {
    path,
    title: `${title(c)} Algorithm and How to Recognize It | CubeMore`,
    description: `${title(c)}: ${c.alg}. ${c.moves} moves, comes up in about 1 of ${c.oneIn} solves. How to recognize it, ${c.alternatives.length ? `${c.alternatives.length} other algorithms, ` : ""}and how to practice it.`,
  };
}

/** The breadcrumb trail of an algorithm page (for structured data). */
export function algorithmCrumbs(path: string): { name: string; path: string }[] {
  const trail = [{ name: "Algorithms", path: "/algorithms" }];
  if (path === "/algorithms") return trail;
  const step: Step = path.startsWith("/algorithms/oll") ? "oll" : "pll";
  trail.push({ name: STEP_NAME[step], path: `/algorithms/${step}` });
  const c = caseByPath(path);
  if (c) trail.push({ name: c.step === "oll" ? c.id : c.name, path: c.path });
  return trail;
}
