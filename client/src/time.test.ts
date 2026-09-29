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
  it("reads seconds with hundredths, tenths or nothing", () => {
    expect(parseTypedTime("12.34")).toEqual({ ok: true, timeMs: 12_340, penalty: "OK" });
    expect(parseTypedTime("12.3")).toEqual({ ok: true, timeMs: 12_300, penalty: "OK" });
    expect(parseTypedTime("12")).toEqual({ ok: true, timeMs: 12_000, penalty: "OK" });
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
    for (const bad of ["", "abc", "12.345", "1:75.00", "-5", "0", "0.00", "12,34", "1:2:3"]) {
      expect(parseTypedTime(bad).ok, bad).toBe(false);
    }
  });
});
