import { describe, expect, it } from "vitest";
import {
  SOLVED_FACELETS,
  applyMove,
  applyMoves,
  invertMoves,
  isSolved,
  parseMoves,
  simplifyMoves,
} from "@cube-racing/shared/cube3";

describe("the cube model", () => {
  it("matches the facelets a GAN cube reports (example from gan-web-bluetooth)", () => {
    expect(applyMoves(SOLVED_FACELETS, ["F", "R"])).toBe("UUFUUFLLFUUURRRRRRFFRFFDFFDRRBDDBDDBLLDLLDLLDLBBUBBUBB");
  });

  it("each face turn four times is nothing; R U R' U' six times is nothing", () => {
    for (const face of "URFDLB") {
      const once = applyMove(SOLVED_FACELETS, face);
      expect(once).not.toBe(SOLVED_FACELETS);
      expect(applyMoves(SOLVED_FACELETS, [face, face, face, face])).toBe(SOLVED_FACELETS);
      expect(applyMove(once, `${face}'`)).toBe(SOLVED_FACELETS);
      expect(applyMove(SOLVED_FACELETS, `${face}2`)).toBe(applyMoves(SOLVED_FACELETS, [face, face]));
    }
    const sexy = parseMoves("R U R' U'");
    expect(applyMoves(SOLVED_FACELETS, Array(6).fill(sexy).flat())).toBe(SOLVED_FACELETS);
    expect(applyMoves(SOLVED_FACELETS, sexy)).not.toBe(SOLVED_FACELETS);
  });

  it("a scramble followed by its inverse is solved", () => {
    const scramble = parseMoves("D2 F' U2 L2 F' R2 B U2 F2 U2 L' D' R B' U L' F2 D' F' R'");
    const scrambled = applyMoves(SOLVED_FACELETS, scramble);
    expect(isSolved(scrambled)).toBe(false);
    expect(applyMoves(scrambled, invertMoves(scramble))).toBe(SOLVED_FACELETS);
    // Every color still appears 9 times.
    for (const face of "URFDLB") expect(scrambled.split(face).length - 1).toBe(9);
  });

  it("superflip: all edges flipped, every corner home", () => {
    const superflip = parseMoves("U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2");
    expect(applyMoves(SOLVED_FACELETS, superflip)).toBe("UBULURUFURURFRBRDRFUFLFRFDFDFDLDRDBDLULBLFLDLBUBRBLBDB");
  });

  it("joins and undoes moves", () => {
    expect(simplifyMoves(["R", "R"])).toEqual(["R2"]);
    expect(simplifyMoves(["R", "R'"])).toEqual([]);
    expect(simplifyMoves(["R2", "R"])).toEqual(["R'"]);
    expect(simplifyMoves(["U", "R", "R", "R", "U"])).toEqual(["U", "R'", "U"]);
    expect(invertMoves(["R", "U2", "F'"])).toEqual(["F", "U2", "R'"]);
  });

  it("refuses anything that isn't a face turn", () => {
    expect(() => parseMoves("R M U")).toThrow();
    expect(() => parseMoves("Rw")).toThrow();
    expect(() => applyMove(SOLVED_FACELETS, "x")).toThrow();
  });
});
