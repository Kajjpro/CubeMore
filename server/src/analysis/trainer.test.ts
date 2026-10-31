import { describe, expect, it } from "vitest";
import { FACES, applyMoves } from "@cube-racing/shared/cube3";
import type { CaseTime } from "@cube-racing/shared";
import { allCases } from "@cube-racing/shared/analysis/caseInfo";
import { caseOfState, caseReport, caseSetup, drillDone, pickNextCase, stateAfter } from "@cube-racing/shared/analysis/trainer";
import { toFaceTurns } from "@cube-racing/shared/analysis/notation";
import { TO_BOTTOM } from "@cube-racing/shared/analysis/cases";

/** A repeatable random number generator. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

const time = (caseId: string, ms: number, at: number, extra: Partial<CaseTime> = {}): CaseTime => ({
  caseId,
  at,
  source: "drill",
  recognitionMs: null,
  executionMs: ms,
  moves: null,
  looks: 1,
  missed: false,
  ...extra,
});

describe("case setups", () => {
  it("make exactly the asked case, from random angles, on every cross color", () => {
    const random = seeded(7);
    const { oll, pll } = allCases();
    for (const face of FACES) {
      for (const c of [...oll, ...pll]) {
        const setup = caseSetup(c.id, face, random)!;
        expect(setup.every((m) => /^[URFDLB][2']?$/.test(m))).toBe(true);
        expect(caseOfState(stateAfter(setup), face), `${c.id} on ${face}`).toBe(c.id);
      }
    }
  });

  it("an OLL comes with a random last-layer permutation", () => {
    const random = seeded(3);
    const states = new Set(Array.from({ length: 20 }, () => stateAfter(caseSetup("OLL 27", "D", random)!)));
    expect(states.size).toBeGreaterThan(10);
  });

  it("the case's own algorithm finishes the drill", () => {
    const random = seeded(11);
    for (const face of ["U", "D", "F"] as const) {
      for (const [id, alg] of [
        ["PLL T", "R U R' U' R' F R2 U' R' U' R U R' F'"],
        ["OLL 27", "R U R' U R U2 R'"],
      ] as const) {
        const state = stateAfter(caseSetup(id, face, random)!);
        const step = id.startsWith("OLL") ? "oll" : "pll";
        expect(drillDone(state, step, face)).toBe(false);
        // Try the algorithm from each angle (the solver would AUF first) and finish with a U turn.
        const done = ["", "U", "U2", "U'"].some((before) =>
          ["", "U", "U2", "U'"].some((after) => drillDone(applyMoves(state, toFaceTurns(`${TO_BOTTOM[face]} ${before} ${alg} ${after}`)), step, face)),
        );
        expect(done, `${id} on ${face}`).toBe(true);
      }
    }
  });
});

describe("your cases", () => {
  it("puts the slow, the missed and the 2-look cases first", () => {
    const times: CaseTime[] = [];
    let at = 0;
    for (let i = 0; i < 4; i++) {
      times.push(time("PLL T", 1500, at++), time("PLL Ua", 1400, at++), time("PLL Gb", 3200, at++), time("PLL Aa", 1600, at++));
    }
    times.push(time("PLL E", 4000, at++, { source: "solve", looks: 2 }));
    times.push(time("PLL Na", 0, at++, { missed: true }));
    const report = caseReport(times, "pll");
    const focus = report.focus.map((r) => r.info.id);
    expect(focus.slice(0, 3).sort()).toEqual(["PLL E", "PLL Gb", "PLL Na"].sort());
    expect(report.unknown.map((r) => r.info.id)).toEqual(["PLL E"]);
    expect(report.rows).toHaveLength(21);
    expect(report.rows.find((r) => r.info.id === "PLL Ua")!.status).toBe("good");
    expect(report.rows.find((r) => r.info.id === "PLL Gb")!.status).toBe("learning");
    expect(report.rows.find((r) => r.info.id === "PLL V")!.status).toBe("new");
    expect(caseReport(times, "oll").count).toBe(0);
  });
});

describe("drills", () => {
  it("new cases first, slow ones more often, never twice in a row", () => {
    const set = ["PLL T", "PLL Gb", "PLL Ua"];
    const random = seeded(5);
    const times: CaseTime[] = [time("PLL T", 1200, 1), time("PLL Gb", 3000, 2)];
    // Ua was never timed: it comes up first, nearly always.
    let ua = 0;
    for (let i = 0; i < 100; i++) if (pickNextCase(set, times, "PLL Gb", random) === "PLL Ua") ua++;
    expect(ua).toBeGreaterThan(60);

    times.push(time("PLL Ua", 1200, 3));
    const counts: Record<string, number> = {};
    let last: string | null = null;
    for (let i = 0; i < 600; i++) {
      const next = pickNextCase(set, times, last, random);
      expect(next).not.toBe(last);
      counts[next] = (counts[next] ?? 0) + 1;
      last = next;
    }
    expect(counts["PLL Gb"]).toBeGreaterThan(counts["PLL T"]);
    expect(pickNextCase(["OLL 1"], times, "OLL 1", random)).toBe("OLL 1");
  });
});
