import { describe, expect, it } from "vitest";
import { formatSolve, formatTime, parseTypedTime } from "./time";

describe("formatTime", () => {
  it("shows hundredths, truncated (never rounded up)", () => {
    expect(formatTime(12_349)).toBe("12.34");
    expect(formatTime(9_999)).toBe("9.99");
    expect(formatTime(0)).toBe("0.00");
  });

  it("adds minutes and hours when needed", () => {
    expect(formatTime(62_340)).toBe("1:02.34");
    expect(formatTime(3_723_450)).toBe("1:02:03.45");
  });

  it("shows +2 and DNF", () => {
    expect(formatSolve(12_349, "+2")).toBe("14.34+");
    expect(formatSolve(12_349, "DNF")).toBe("DNF");
  });
});

describe("parseTypedTime", () => {
  it("reads just digits like csTimer: the last two are hundredths", () => {
    expect(parseTypedTime("1235")).toEqual({ ok: true, timeMs: 12_350, penalty: "OK" });
    expect(parseTypedTime("123")).toEqual({ ok: true, timeMs: 1_230, penalty: "OK" });
    expect(parseTypedTime("12")).toEqual({ ok: true, timeMs: 120, penalty: "OK" });
    expect(parseTypedTime("5")).toEqual({ ok: true, timeMs: 50, penalty: "OK" });
    expect(parseTypedTime("10234")).toEqual({ ok: true, timeMs: 62_340, penalty: "OK" });
    expect(parseTypedTime("123456")).toEqual({ ok: true, timeMs: 754_560, penalty: "OK" });
    // Without minutes, seconds may go past 59 (7500 = 75.00 = 1:15.00).
    expect(parseTypedTime("7500")).toEqual({ ok: true, timeMs: 75_000, penalty: "OK" });
  });

  it("reads seconds with a dot as written", () => {
    expect(parseTypedTime("12.34")).toEqual({ ok: true, timeMs: 12_340, penalty: "OK" });
    expect(parseTypedTime("12.3")).toEqual({ ok: true, timeMs: 12_300, penalty: "OK" });
    expect(parseTypedTime("12.")).toEqual({ ok: false, error: expect.any(String) });
  });

  it("reads a + at the end as +2", () => {
    expect(parseTypedTime("1235+")).toEqual({ ok: true, timeMs: 12_350, penalty: "+2" });
    expect(parseTypedTime("12.35 +")).toEqual({ ok: true, timeMs: 12_350, penalty: "+2" });
  });

  it("reads minutes", () => {
    expect(parseTypedTime("1:02.34")).toEqual({ ok: true, timeMs: 62_340, penalty: "OK" });
  });

  it("uses exact whole numbers (no floating point)", () => {
    // 0.29 * 1000 in floating point is 289.99999999999994
    expect(parseTypedTime("0.29")).toEqual({ ok: true, timeMs: 290, penalty: "OK" });
    expect(parseTypedTime("1.01")).toEqual({ ok: true, timeMs: 1_010, penalty: "OK" });
  });

  it("reads DNF in any case, with spaces around", () => {
    expect(parseTypedTime(" dnf ")).toEqual({ ok: true, timeMs: 0, penalty: "DNF" });
  });

  it("refuses anything else", () => {
    for (const bad of ["", "abc", "12.345", "1:75.00", "17500", "1234567", "-5", "0", "0.00", "12,34", "1:2:3", "+", "DNF+"]) {
      expect(parseTypedTime(bad).ok, bad).toBe(false);
    }
  });
});
