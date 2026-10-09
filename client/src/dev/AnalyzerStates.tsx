/*
 * Development only: the analyzer's report screens with made-up solves (for
 * /dev/states and the screenshot checker). The solves are real CFOP solutions
 * of fixed scrambles, with person-like pauses, analyzed like a real one.
 */

import { analyzeSolve, summarizeSession, type SolveAnalysis } from "@cube-racing/shared/analysis";
import { SiteFooter, SiteHeader } from "../components/Site";
import { CoachCard, SessionReport, SolveReport } from "../components/analyzer/Report";
import { cfopSolution } from "./simSolve";

const SCRAMBLES = [
  "D2 F' U2 R2 F2 U2 L2 B' D2 F R2 U' L B2 U' R F' L' B U",
  "R2 U F2 D' B2 U2 F2 L2 D B2 U' R' B' L' U2 R2 F' D R' F2",
  "L2 F2 U' B2 D' L2 U' F2 U' R2 F2 R' D2 F' U R' B2 D' L' B",
  "U' R2 B2 D2 F2 U' L2 D' B2 U2 F' R' F2 D' L B2 R U F' R2",
  "F2 D' L2 D B2 U' F2 D2 R2 U L' B' R U' F' D L2 F R' B'",
];

interface MockSolve {
  scramble: string;
  moves: string[];
  times: number[];
  analysis: SolveAnalysis;
}

/** A solve of scramble `i`: 6-ish turns a second, a pause before each stage that grows with `slow`. */
function mockSolve(i: number, slow = 1): MockSolve {
  const scramble = SCRAMBLES[i];
  const moves: string[] = [];
  const times: number[] = [];
  let t = 0;
  cfopSolution(scramble).forEach((stage, s) => {
    stage.forEach((move, m) => {
      if (moves.length > 0) t += m === 0 ? Math.round((s >= 5 ? 700 : 450) * slow) : 150 + ((moves.length * 37) % 60);
      moves.push(move);
      times.push(t);
    });
  });
  return { scramble, moves, times, analysis: analyzeSolve(scramble, moves, times) };
}

const COACH_TEXT = `Your 14.6 average loses the most time between F2L pairs, not while turning.
- Before each pair, look for the next one while you finish the one you're solving.
- Your OLL recognition took about 0.7 s; practice the cases you met most.
- Your crosses were close to the shortest, so keep planning them fully in inspection.`;

export function AnalyzerState({ name }: { name: string }) {
  const one = mockSolve(0);
  const ao5 = name === "analyzer-ao5" ? [0, 1, 2, 3, 4].map((i) => mockSolve(i, 0.8 + i * 0.2)) : [];
  return (
    <div className="home analyzer-page">
      <SiteHeader />
      <main className="analyzer">
        {name === "analyzer-report" && (
          <SolveReport scramble={one.scramble} moves={one.moves} times={one.times} analysis={one.analysis} status={<p className="tiny muted">Kept in your sessions.</p>} />
        )}
        {name === "analyzer-ao5" && (
          <>
            <SessionReport summary={summarizeSession(ao5.map((s) => s.analysis))} times={ao5.map((s) => s.analysis.timeMs)} selected={1} onOpen={() => {}} />
            <SolveReport scramble={ao5[1].scramble} moves={ao5[1].moves} times={ao5[1].times} analysis={ao5[1].analysis} title="Solve 2 of 5" />
            <CoachCard text={COACH_TEXT} available canAsk reason={null} busy={false} error={null} onAsk={() => {}} />
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
