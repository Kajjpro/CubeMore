import { describe, expect, it } from "vitest";
import type { Mark, Penalty, SolveResult } from "@cube-racing/shared";
import {
  findMatchWinner,
  roundHalfUpDivide,
  scoredTime,
  setStanding,
  setWinners,
  trimmedAverage,
} from "./scoring";

/** A submitted solve. `solve(12340)` = 12.34 s, `solve(0, "DNF")` = DNF. */
function solve(timeMs: number, penalty: Penalty = "OK"): SolveResult {
  return { timeMs, penalty, source: "submitted" };
}

const DNF = solve(0, "DNF");

describe("scoredTime: truncation and penalties", () => {
  it("truncates to hundredths (never rounds up)", () => {
    expect(scoredTime(solve(10_009))).toBe(10_000);
    expect(scoredTime(solve(10_999))).toBe(10_990);
    expect(scoredTime(solve(10_010))).toBe(10_010);
  });

  it("adds 2 seconds for +2, after truncating", () => {
    expect(scoredTime(solve(10_019, "+2"))).toBe(12_010);
  });

  it("turns DNF into 'DNF' whatever the time", () => {
    expect(scoredTime(solve(9_000, "DNF"))).toBe("DNF");
  });
});

describe("roundHalfUpDivide", () => {
  it("rounds halves up and everything else to the nearest", () => {
    expect(roundHalfUpDivide(10_005, 10)).toBe(1_001); // 1000.5 -> 1001
    expect(roundHalfUpDivide(3_001, 3)).toBe(1_000); // 1000.33 -> 1000
    expect(roundHalfUpDivide(3_002, 3)).toBe(1_001); // 1000.67 -> 1001
    expect(roundHalfUpDivide(3_000, 3)).toBe(1_000);
  });
});

describe("ao5", () => {
  const ao5 = (results: SolveResult[]) => setStanding(results, "ao5");

  it("with no DNF: drops best and worst, averages the middle 3", () => {
    const times = [solve(10_000), solve(11_000), solve(12_000), solve(13_000), solve(14_000)];
    expect(ao5(times)).toEqual({ result: 12_000, best: 10_000 });
  });

  it("with 1 DNF: the DNF is dropped as the worst", () => {
    const times = [solve(10_000), DNF, solve(12_000), solve(13_000), solve(14_000)];
    expect(ao5(times)).toEqual({ result: 13_000, best: 10_000 });
  });

  it("with 2 DNFs: the average is DNF", () => {
    const times = [solve(10_000), DNF, solve(12_000), DNF, solve(14_000)];
    expect(ao5(times)).toEqual({ result: "DNF", best: 10_000 });
  });

  it("uses a +2 time when deciding the best and the worst", () => {
    // 9.00+2 = 11.00, so the best is now 10.00, and 11.00 moves into the middle.
    const times = [solve(9_000, "+2"), solve(10_000), solve(10_500), solve(12_000), solve(13_000)];
    // middle: 10.50, 11.00, 12.00 -> 33.50 / 3 = 11.1666 -> 11.17
    expect(ao5(times)).toEqual({ result: 11_170, best: 10_000 });
  });

  it("a +2 can turn a time into the worst", () => {
    // 11.00+2 = 13.00 is now worse than 12.50, so 12.50 moves into the middle.
    const times = [solve(10_000), solve(11_000, "+2"), solve(11_500), solve(12_000), solve(12_500)];
    // middle: 11.50, 12.00, 12.50 -> 12.00
    expect(ao5(times).result).toBe(12_000);
  });

  it("truncates each time before averaging", () => {
    // 10.009 -> 10.00, 10.019 -> 10.01, 10.029 -> 10.02 (best and worst dropped)
    const times = [solve(9_999), solve(10_009), solve(10_019), solve(10_029), solve(20_000)];
    // middle: 10.00 + 10.01 + 10.02 = 30.03 / 3 = 10.01
    expect(ao5(times).result).toBe(10_010);
  });

  it("rounds the average to the nearest hundredth", () => {
    // middle: 10.00 + 10.00 + 10.01 = 30.01 / 3 = 10.0033 -> 10.00
    const down = [solve(9_000), solve(10_000), solve(10_000), solve(10_010), solve(20_000)];
    expect(ao5(down).result).toBe(10_000);
    // middle: 10.00 + 10.01 + 10.01 = 30.02 / 3 = 10.0066 -> 10.01
    const up = [solve(9_000), solve(10_000), solve(10_010), solve(10_010), solve(20_000)];
    expect(ao5(up).result).toBe(10_010);
  });
});

describe("ao12", () => {
  const ao12 = (results: SolveResult[]) => setStanding(results, "ao12");
  const tenSeconds = (count: number) => Array.from({ length: count }, () => solve(10_000));

  it("with no DNF: drops 1 best and 1 worst, averages the middle 10", () => {
    const times = [solve(8_000), ...tenSeconds(10), solve(30_000)];
    expect(ao12(times)).toEqual({ result: 10_000, best: 8_000 });
  });

  it("with 1 DNF: the DNF is dropped as the worst", () => {
    const times = [solve(8_000), ...tenSeconds(10), DNF];
    expect(ao12(times).result).toBe(10_000);
  });

  it("with 2 DNFs: the average is DNF", () => {
    const times = [solve(8_000), ...tenSeconds(9), DNF, DNF];
    expect(ao12(times).result).toBe("DNF");
  });

  it("rounds an exact half up (10.005 -> 10.01)", () => {
    // middle ten: nine x 10.00 and one 10.05 -> 100.05 / 10 = 10.005 -> 10.01
    const times = [solve(9_000), ...tenSeconds(9), solve(10_050), solve(20_000)];
    expect(ao12(times).result).toBe(10_010);
  });
});

describe("single format", () => {
  it("the set result is the single", () => {
    expect(setStanding([solve(12_345, "+2")], "single")).toEqual({ result: 14_340, best: 14_340 });
    expect(setStanding([DNF], "single")).toEqual({ result: "DNF", best: "DNF" });
  });
});

describe("trimmedAverage", () => {
  it("treats DNF as the worst mark", () => {
    const marks: Mark[] = ["DNF", 10_000, 11_000, 12_000, 13_000];
    expect(trimmedAverage(marks, 1)).toBe(12_000);
  });
});

describe("set winners", () => {
  it("the best set result wins", () => {
    expect(
      setWinners({
        a: { result: 11_000, best: 9_000 },
        b: { result: 10_000, best: 9_500 },
      }),
    ).toEqual(["b"]);
  });

  it("a real result always beats DNF", () => {
    expect(
      setWinners({
        a: { result: "DNF", best: 5_000 },
        b: { result: 60_000, best: 50_000 },
      }),
    ).toEqual(["b"]);
  });

  it("a tie on the average is won by the better single", () => {
    expect(
      setWinners({
        a: { result: 10_000, best: 9_100 },
        b: { result: 10_000, best: 9_000 },
      }),
    ).toEqual(["b"]);
  });

  it("a tie on the average AND the single gives everyone tied a point", () => {
    expect(
      setWinners({
        a: { result: 10_000, best: 9_000 },
        b: { result: 10_000, best: 9_000 },
        c: { result: 10_000, best: 9_500 },
      }),
    ).toEqual(["a", "b"]);
  });

  it("nobody wins if every set result is DNF", () => {
    expect(
      setWinners({
        a: { result: "DNF", best: 9_000 },
        b: { result: "DNF", best: "DNF" },
      }),
    ).toEqual([]);
  });
});

describe("match winner", () => {
  it("needs the target AND strictly more points than everyone else", () => {
    expect(findMatchWinner({ a: 2, b: 1 }, ["a", "b"], 2)).toBe("a");
    expect(findMatchWinner({ a: 1, b: 1 }, ["a", "b"], 2)).toBeNull();
  });

  it("keeps playing when players are tied at or above the target", () => {
    expect(findMatchWinner({ a: 2, b: 2 }, ["a", "b"], 2)).toBeNull();
    expect(findMatchWinner({ a: 3, b: 2 }, ["a", "b"], 2)).toBe("a");
  });

  it("never ends by itself in unlimited mode", () => {
    expect(findMatchWinner({ a: 100 }, ["a"], null)).toBeNull();
  });
});
