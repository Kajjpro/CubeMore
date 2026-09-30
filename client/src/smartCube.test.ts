import { describe, expect, it } from "vitest";
import { cube3x3x3 } from "cubing/puzzles";
import { SmartSolveTracker } from "./smartCube";

const SCRAMBLE = "R U R' F2 D";

/** Plays moves on a pattern, feeding the tracker like the cube would. */
async function play() {
  const solved = (await cube3x3x3.kpuzzle()).defaultPattern();
  const tracker = new SmartSolveTracker(solved.applyAlg(SCRAMBLE));
  let pattern = solved;
  let at = 0;
  const turn = (moves: string) => {
    for (const move of moves.split(" ")) {
      pattern = pattern.applyMove(move);
      at += 250;
      tracker.onMove(pattern, at);
    }
    return tracker.state;
  };
  return { tracker, turn };
}

describe("smart cube solves", () => {
  it("arms when the cube matches the scramble, starts on the next turn, stops when solved", async () => {
    const { tracker, turn } = await play();
    expect(turn("R U R'")).toBe("scrambling");
    expect(turn("F2 D")).toBe("armed");
    expect(turn("D'")).toBe("running"); // first solving move
    expect(tracker.startedAt).toBe(1500);
    expect(turn("F2 R U' R'")).toBe("solved");
    expect(tracker.elapsedMs).toBe(1000);
  });

  it("a wrong scramble move just keeps it scrambling until it matches", async () => {
    const { turn } = await play();
    expect(turn("R U L")).toBe("scrambling");
    expect(turn("L' R' F2 D")).toBe("armed");
  });
});
