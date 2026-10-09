/*
 * The algorithm pages' addresses, from the case names alone (small: the site's
 * router and sitemap need them, without the cube model behind the pages).
 */

import { OLL_CASES, PLL_CASES, type LastLayerCase } from "./algs";

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** "/algorithms/oll/27-sune", "/algorithms/pll/t-perm". */
export function casePath(c: LastLayerCase): string {
  const [step, short] = c.id.split(" ");
  return step === "OLL" ? `/algorithms/oll/${short}-${slugify(c.name)}` : `/algorithms/pll/${slugify(c.name)}`;
}

/** Every algorithm page's address (for the sitemap and the router). */
export function algorithmPaths(): string[] {
  return ["/algorithms", "/algorithms/oll", "/algorithms/pll", ...OLL_CASES.map(casePath), ...PLL_CASES.map(casePath)];
}
