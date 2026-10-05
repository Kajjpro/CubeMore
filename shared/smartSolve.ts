/*
 * VERIFYING A SMART CUBE SOLVE (the server does this for every smart solve).
 *
 * The browser sends every move of the solve with its time. The server replays
 * them on the scramble and checks:
 *   - the moves really solve the scramble, and the cube is solved only at the last move
 *   - the time is the time of the last move
 *   - the solve is humanly possible (not too few moves, not too fast)
 *   - it isn't just the scramble undone (the easiest fake)
 * This makes faking a solve much harder, not impossible: replays of the best
 * solves can be watched by everyone.
 */

import { SOLVED_FACELETS, applyMove, applyMoves, invertMoves, isFaceMove, isSolved, parseMoves, simplifyMoves } from "./cube3";

/** Every move of a smart cube solve and when it happened (ms from the start of the solve). */
export interface SmartSolveData {
  moves: string[];
  times: number[];
}

export const SMART_SOLVE_LIMITS = {
  maxMoves: 600,
  /** Real 3x3 solutions are 40+ moves; even a very lucky one is more than this. */
  minMoves: 12,
  /** Moves per second over the whole solve. The fastest humans average about 12-15. */
  maxTps: 20,
};

export type SmartVerdict = { ok: true; moveCount: number; tps: number } | { ok: false; reason: string };

/** Moves per second, with 2 decimals. */
export function turnsPerSecond(moveCount: number, timeMs: number): number {
  return timeMs > 0 ? Math.round((moveCount / timeMs) * 100_000) / 100 : 0;
}

export function verifySmartSolve(scramble: string, timeMs: number, data: SmartSolveData): SmartVerdict {
  const { moves, times } = data;
  if (moves.length !== times.length) return { ok: false, reason: "The moves and their times don't match." };
  if (moves.length < SMART_SOLVE_LIMITS.minMoves) return { ok: false, reason: "Too few moves for a real solve." };
  if (moves.length > SMART_SOLVE_LIMITS.maxMoves) return { ok: false, reason: "Too many moves." };
  if (!moves.every(isFaceMove)) return { ok: false, reason: "Unknown moves." };
  for (let i = 0; i < times.length; i++) {
    if (!Number.isInteger(times[i]) || times[i] < 0 || (i > 0 && times[i] < times[i - 1])) {
      return { ok: false, reason: "The move times are out of order." };
    }
  }
  if (times[times.length - 1] !== timeMs) return { ok: false, reason: "The time doesn't match the last move." };

  let scrambleMoves: string[];
  try {
    scrambleMoves = parseMoves(scramble);
  } catch {
    return { ok: false, reason: "This scramble can't be checked." };
  }

  // Replay: the cube must be solved at the last move, and not before.
  let state = applyMoves(SOLVED_FACELETS, scrambleMoves);
  for (let i = 0; i < moves.length; i++) {
    state = applyMove(state, moves[i]);
    if (isSolved(state) && i < moves.length - 1) return { ok: false, reason: "The cube was solved before the last move." };
  }
  if (!isSolved(state)) return { ok: false, reason: "These moves don't solve the scramble." };

  const tps = turnsPerSecond(moves.length, timeMs);
  if (tps > SMART_SOLVE_LIMITS.maxTps) return { ok: false, reason: "Faster than humanly possible." };

  const undone = simplifyMoves(invertMoves(scrambleMoves)).join(" ");
  if (simplifyMoves(moves).join(" ") === undone) return { ok: false, reason: "That's the scramble undone, not a solve." };

  return { ok: true, moveCount: moves.length, tps };
}
