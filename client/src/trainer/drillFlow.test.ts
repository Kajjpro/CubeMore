import { describe, expect, it } from "vitest";
import { SOLVED_FACELETS, applyMove, parseMoves, type Face } from "@cube-racing/shared/cube3";
import { caseSetup, stateAfter } from "@cube-racing/shared/analysis/trainer";
import { toFaceTurns } from "@cube-racing/shared/analysis/notation";
import { TO_BOTTOM } from "@cube-racing/shared/analysis/cases";
import { DrillFlow } from "./drillFlow";

const T_PERM = "R U R' U' R' F R2 U' R' U' R U R' F'";

/** Turns the cube one move every `gap` ms from `at`; returns the state and the next time. */
function turn(flow: DrillFlow, state: string, moves: string[], at: number, gap = 100) {
  for (const move of moves) {
    state = applyMove(state, move);
    flow.onMove(move, state, at);
    at += gap;
  }
  return { state, at };
}

/** A setup for the case and the face turns that finish it (an AUF before and after the algorithm). */
function caseAndAnswer(caseId: string, alg: string, cross: Face) {
  const setup = caseSetup(caseId, cross, () => 0)!;
  const state = stateAfter(setup);
  for (const before of ["", "U", "U2", "U'"]) {
    for (const after of ["", "U", "U2", "U'"]) {
      const answer = toFaceTurns(`${TO_BOTTOM[cross]} ${before} ${alg} ${after}`);
      let s = state;
      for (const m of answer) s = applyMove(s, m);
      if (s === SOLVED_FACELETS) return { scramble: setup.join(" "), answer };
    }
  }
  throw new Error("no answer");
}

describe("a smart cube drill", () => {
  it("times recognition from the moment the cube shows the case, then the turning", () => {
    const { scramble, answer } = caseAndAnswer("PLL T", T_PERM, "U");
    const flow = new DrillFlow(scramble, "pll", "U", SOLVED_FACELETS, 0);
    expect(flow.view().phase).toBe("scrambling");
    let { state, at } = turn(flow, SOLVED_FACELETS, parseMoves(scramble), 1000);
    expect(flow.view().phase).toBe("looking");
    const shownAt = at - 100;
    expect(flow.view().shownAt).toBe(shownAt);

    // 800 ms to recognize, then the answer at 100 ms a move.
    ({ state, at } = turn(flow, state, answer, shownAt + 800));
    const view = flow.view();
    expect(view.phase).toBe("done");
    expect(view.result).toEqual({ recognitionMs: 800, executionMs: (answer.length - 1) * 100, moves: answer.length });
    expect(state).toBe(SOLVED_FACELETS);
  });

  it("an OLL is done once the top is one color, with F2L kept", () => {
    const { scramble } = caseAndAnswer("OLL 27", "R U R' U R U2 R'", "D");
    const state = stateAfter(parseMoves(scramble));
    // Already scrambled when the drill starts: looking right away.
    const flow = new DrillFlow(scramble, "oll", "D", state, 50);
    expect(flow.view().phase).toBe("looking");
    let done = false;
    for (const before of ["", "U", "U2", "U'"]) {
      const f = new DrillFlow(scramble, "oll", "D", state, 0);
      turn(f, state, toFaceTurns(`${before} R U R' U R U2 R'`), 500);
      if (f.view().phase === "done") done = true;
    }
    expect(done).toBe(true);
  });

  it("too many moves: lost", () => {
    const { scramble } = caseAndAnswer("PLL T", T_PERM, "D");
    const state = stateAfter(parseMoves(scramble));
    const flow = new DrillFlow(scramble, "pll", "D", state, 0);
    turn(flow, state, Array.from({ length: 62 }, (_, i) => (i % 2 ? "R" : "L")), 100);
    expect(flow.view().phase).toBe("lost");
  });
});
