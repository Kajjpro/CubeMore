import { describe, expect, it } from "vitest";
import { SOLVED_FACELETS, FACES } from "@cube-racing/shared/cube3";
import { allCases, algorithmPaths, caseByPath } from "@cube-racing/shared/analysis/caseInfo";
import { aufOnly } from "@cube-racing/shared/analysis/cases";
import { applyAlg } from "@cube-racing/shared/analysis/notation";
import { progress } from "@cube-racing/shared/analysis/state";

const oriented = (s: string) => FACES.some((f) => progress(s, f) >= 6);

describe("facts about each case", () => {
  it("how often each case comes up matches the well-known odds", () => {
    const { oll, pll } = allCases();
    const odds = (list: typeof oll, short: string) => list.find((c) => c.short === short)!.oneIn;
    expect(odds(oll, "27")).toBe(54); // Sune
    expect(odds(oll, "21")).toBe(108); // H
    expect(odds(oll, "20")).toBe(216); // Checkers
    expect(odds(pll, "T")).toBe(18);
    expect(odds(pll, "H")).toBe(72);
    expect(odds(pll, "Z")).toBe(36);
    expect(odds(pll, "Na")).toBe(72);
    expect(odds(pll, "E")).toBe(36);
    // All cases together, plus the skip, cover every situation.
    expect(oll.reduce((sum, c) => sum + 216 / c.oneIn, 1)).toBe(216);
    expect(pll.reduce((sum, c) => sum + 72 / c.oneIn, 1)).toBe(72);
  });

  it("every alternative algorithm solves its case", () => {
    const { oll, pll } = allCases();
    for (const c of [...oll, ...pll]) {
      for (const alg of c.alternatives) {
        const works = ["", "U", "U2", "U'"].some((pre) => {
          const after = applyAlg(applyAlg(c.state, pre), alg);
          return c.step === "oll" ? oriented(after) : aufOnly(after);
        });
        expect(works, `${c.id}: ${alg}`).toBe(true);
      }
    }
  });

  it("each case has its own address, and describes its look", () => {
    const paths = algorithmPaths();
    expect(paths).toHaveLength(3 + 57 + 21);
    expect(new Set(paths).size).toBe(paths.length);
    expect(caseByPath("/algorithms/oll/27-sune")?.group).toBe("Cross");
    expect(caseByPath("/algorithms/oll/1-runway")?.group).toBe("Dot");
    expect(caseByPath("/algorithms/pll/t-perm")?.look).toMatch(/next to each other/);
    expect(caseByPath("/algorithms/pll/y-perm")?.look).toMatch(/diagonal/);
    expect(caseByPath("/algorithms/pll/ua-perm")?.group).toBe("Edges only");
    expect(caseByPath("/algorithms/pll/aa-perm")?.group).toBe("Corners only");
    expect(caseByPath("/algorithms/oll/27-sune")?.moves).toBe(7);
    expect(SOLVED_FACELETS).toHaveLength(54);
  });
});
