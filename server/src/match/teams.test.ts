import { describe, expect, it } from "vitest";
import { balanceTeams, teamSolveMark } from "@cube-racing/shared";
import type { SolveResult } from "@cube-racing/shared";

const ok = (timeMs: number): SolveResult => ({ timeMs, penalty: "OK", source: "submitted" });

describe("team times", () => {
  it("the mean in hundredths, halves up; the fastest; null while someone solves", () => {
    expect(teamSolveMark("all", [ok(10_004), ok(10_015)])).toBe(10_010); // 10.00 and 10.01: 10.005 -> 10.01
    expect(teamSolveMark("fastest", [ok(10_004), ok(9_999)])).toBe(9_990);
    expect(teamSolveMark("all", [ok(10_000), null])).toBeNull();
    expect(teamSolveMark("all", [ok(10_000), { timeMs: 0, penalty: "DNF", source: "timeout" }])).toBe("DNF");
    expect(teamSolveMark("all", [{ timeMs: 0, penalty: "DNF", source: "removed" }])).toBe("DNF");
  });

  it("balanced teams: a snake draft, fastest first; unknown players fill the smaller team", () => {
    const teams = balanceTeams([
      { id: "slow", paceMs: 30_000 },
      { id: "fast", paceMs: 10_000 },
      { id: "mid1", paceMs: 15_000 },
      { id: "mid2", paceMs: 20_000 },
      { id: "new", paceMs: null },
    ]);
    expect(teams).toEqual({ fast: "A", mid1: "B", mid2: "B", slow: "A", new: "A" });
  });
});
