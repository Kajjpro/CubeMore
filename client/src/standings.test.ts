import { describe, expect, it } from "vitest";
import { solveColumns } from "./stats";

describe("standings solve columns", () => {
  it("shows every solve of an ao5", () => {
    expect(solveColumns(5, 0)).toEqual([0, 1, 2, 3, 4]);
    expect(solveColumns(5, 4)).toEqual([0, 1, 2, 3, 4]);
  });

  it("shows an ao12's current solve and the 4 before it", () => {
    expect(solveColumns(12, 2)).toEqual([0, 1, 2, 3, 4]);
    expect(solveColumns(12, 7)).toEqual([3, 4, 5, 6, 7]);
    expect(solveColumns(12, 11)).toEqual([7, 8, 9, 10, 11]);
  });

  it("on a narrow screen, the current solve and the ones before it", () => {
    expect(solveColumns(5, 3, 3)).toEqual([1, 2, 3]);
    expect(solveColumns(5, 0, 3)).toEqual([0, 1, 2]);
    expect(solveColumns(5, 4, 0)).toEqual([4]);
  });

  it("a single is one column", () => {
    expect(solveColumns(1, 0)).toEqual([0]);
  });
});
