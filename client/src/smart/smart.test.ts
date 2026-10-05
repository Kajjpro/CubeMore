import { describe, expect, it } from "vitest";
import { SOLVED_FACELETS, applyMove, applyMoves, invertMoves, parseMoves } from "@cube-racing/shared/cube3";
import { verifySmartSolve } from "@cube-racing/shared/smartSolve";
import { SmartSolveFlow } from "./flow";
import { ScrambleGuide } from "./guide";
import { ClockFit, solveTimes } from "./timing";

const SCRAMBLE = "R U2 F' D L2 B";

/** Turns the cube move by move, giving the guide each state. */
function turn(guide: ScrambleGuide, start: string, moves: string) {
  let state = start;
  let status = guide.current;
  for (const move of parseMoves(moves)) {
    state = applyMove(state, move);
    status = guide.update(state, move);
  }
  return { state, status };
}

describe("the scramble guide", () => {
  it("follows the scramble move by move, and says when it's done", () => {
    const guide = new ScrambleGuide(SCRAMBLE);
    expect(guide.current).toEqual({ kind: "on-track", done: 0, half: false });
    expect(turn(guide, SOLVED_FACELETS, "R").status).toEqual({ kind: "on-track", done: 1, half: false });
    expect(turn(guide, applyMove(SOLVED_FACELETS, "R"), "U").status).toEqual({ kind: "on-track", done: 1, half: true });
    expect(turn(guide, SOLVED_FACELETS, SCRAMBLE).status).toEqual({ kind: "scrambled" });
  });

  it("accepts a double move either way, and moves that commute in any order", () => {
    expect(turn(new ScrambleGuide(SCRAMBLE), SOLVED_FACELETS, "R U' U' F' D L2 B").status.kind).toBe("scrambled");
    expect(turn(new ScrambleGuide("R U D"), SOLVED_FACELETS, "R D U").status.kind).toBe("scrambled");
  });

  it("a wrong move: says how to undo it (in red), and is back on track after the fix", () => {
    const guide = new ScrambleGuide(SCRAMBLE);
    const wrong = turn(guide, SOLVED_FACELETS, "R U2 F");
    expect(wrong.status).toEqual({ kind: "off-track", done: 2, half: false, fix: ["F'"] });
    const worse = turn(guide, wrong.state, "L");
    expect(worse.status).toEqual({ kind: "off-track", done: 2, half: false, fix: ["L'", "F'"] });
    expect(turn(guide, worse.state, "L' F'").status).toEqual({ kind: "on-track", done: 2, half: false });
  });

  it("wrong turns of the same face add up: R R R needs just R", () => {
    const guide = new ScrambleGuide("U F");
    expect(turn(guide, SOLVED_FACELETS, "R R R").status).toEqual({ kind: "off-track", done: 0, half: false, fix: ["R"] });
  });

  it("halfway through a double move the other way, then wrong: the fix leads back there", () => {
    const guide = new ScrambleGuide(SCRAMBLE);
    expect(turn(guide, SOLVED_FACELETS, "R U' L").status).toEqual({ kind: "off-track", done: 1, half: true, fix: ["L'"] });
  });

  it("a cube that isn't solved at the start: solve it first", () => {
    const scrambled = applyMoves(SOLVED_FACELETS, ["F", "B"]);
    const guide = new ScrambleGuide(SCRAMBLE, scrambled);
    expect(guide.current).toEqual({ kind: "solve-first" });
    expect(turn(guide, scrambled, "B' F'").status).toEqual({ kind: "on-track", done: 0, half: false });
  });
});

describe("solve times", () => {
  const move = (cubeAt: number | null, hostAt: number | null) => ({ move: "R", cubeAt, hostAt });

  it("come from the cube's own clock, whatever the Bluetooth delays", () => {
    const moves = [move(10_000, 500), move(10_400, 990), move(19_123, 9_700)];
    expect(solveTimes(moves, { kind: "first-move" }, 1)).toEqual([0, 400, 9_123]);
  });

  it("correct a cube clock that runs slow, and fill in recovered moves", () => {
    expect(solveTimes([move(0, 0), move(null, null), move(10_000, 10_100)], { kind: "first-move" }, 1.01)).toEqual([0, 10_050, 10_100]);
  });

  it("count the time from the end of the inspection when it ran out", () => {
    expect(solveTimes([move(5_000, 1_250), move(6_000, 2_260)], { kind: "at", hostAt: 1_000 }, 1)).toEqual([250, 1_250]);
  });

  it("cubes without a clock use when the moves arrived", () => {
    expect(solveTimes([move(null, 100), move(null, 700)], { kind: "first-move" }, 1)).toEqual([0, 600]);
  });

  it("the clock fit finds how fast the cube's clock runs", () => {
    const fit = new ClockFit();
    expect(fit.ratio()).toBe(1); // not enough yet
    for (let i = 0; i < 30; i++) fit.add(i * 1_000, 50 + i * 1_002 + (i % 2 ? 15 : -15));
    expect(fit.ratio()).toBeCloseTo(1.002, 3);
  });
});

describe("a whole smart solve", () => {
  it("scramble -> inspection -> first turn starts -> solved: a time the server verifies", () => {
    const solution = [...Array(6).fill(parseMoves("R U R' U'")).flat(), ...invertMoves(parseMoves(SCRAMBLE))];
    const flow = new SmartSolveFlow(SCRAMBLE, SOLVED_FACELETS, () => 1);
    let state = SOLVED_FACELETS;
    let now = 1_000;
    for (const m of parseMoves(SCRAMBLE)) {
      state = applyMove(state, m);
      flow.onMove({ move: m, cubeAt: null, hostAt: now }, state, (now += 300));
    }
    expect(flow.view()).toMatchObject({ phase: "inspecting", inspectionEndsAt: now + 15_000 });

    now += 8_000; // inspecting
    flow.tick(now);
    expect(flow.view().phase).toBe("inspecting");
    const cubeStart = 50_000;
    solution.forEach((m, i) => {
      state = applyMove(state, m);
      flow.onMove({ move: m, cubeAt: cubeStart + i * 250, hostAt: now + i * 250 + 30 }, state, now + i * 250 + 30);
    });

    const { phase, result } = flow.view();
    expect(phase).toBe("solved");
    expect(result!.timeMs).toBe((solution.length - 1) * 250);
    expect(verifySmartSolve(SCRAMBLE, result!.timeMs, result!.smart)).toMatchObject({ ok: true, moveCount: solution.length });
  });

  it("the inspection runs out: the solve starts by itself", () => {
    const scrambled = applyMoves(SOLVED_FACELETS, parseMoves(SCRAMBLE));
    const flow = new SmartSolveFlow(SCRAMBLE, scrambled, () => 1);
    flow.begin(0);
    flow.tick(15_000);
    expect(flow.view()).toMatchObject({ phase: "running", startedAt: 15_000 });
  });

  it("a lost move: the cube reports it's solved, and the solve ends", () => {
    const flow = new SmartSolveFlow("R", applyMove(SOLVED_FACELETS, "R"), () => 1);
    flow.begin(0);
    flow.onMove({ move: "U", cubeAt: null, hostAt: 100 }, applyMoves(SOLVED_FACELETS, ["R", "U"]), 100);
    flow.onState(SOLVED_FACELETS, 200);
    expect(flow.view().phase).toBe("solved");
  });
});
