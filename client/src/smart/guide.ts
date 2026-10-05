/*
 * THE SCRAMBLE GUIDE: follows a smart cube while you scramble it.
 *
 * It compares the cube's real state with the state after each scramble move,
 * so it doesn't care HOW you got there: R2 as R R or R' R', U D as D U...
 *
 *   on track   you're at scramble move `done` (maybe halfway through a double move)
 *   off track  you turned something else: `fix` are the moves that undo it (shown in red)
 *   scrambled  the cube matches the whole scramble
 *   solve first / lost  the cube doesn't match the start (or we can't tell how to get back)
 */

import {
  SOLVED_FACELETS,
  applyMove,
  applyMoves,
  invertMoves,
  parseMoves,
  simplifyMoves,
  type Facelets,
} from "@cube-racing/shared/cube3";

export type GuideStatus =
  | { kind: "solve-first" }
  | { kind: "on-track"; done: number; half: boolean }
  | { kind: "off-track"; done: number; half: boolean; fix: string[] }
  | { kind: "lost" }
  | { kind: "scrambled" };

/** More wrong moves than this: just solve the cube and start again. */
const MAX_FIX = 8;

export class ScrambleGuide {
  readonly moves: string[];
  /** The state after the first i scramble moves. */
  private readonly prefixes: Facelets[];
  /** Halfway through a double move (R2 -> after R or after R'): which move it is. */
  private readonly halves = new Map<Facelets, number>();

  private status: GuideStatus = { kind: "solve-first" };
  /** Where we were last on track (and the cube's state there), and the wrong moves since. */
  private anchor: { done: number; half: boolean; state: Facelets } | null = null;
  private wrong: string[] = [];

  constructor(scramble: string, state: Facelets = SOLVED_FACELETS) {
    this.moves = parseMoves(scramble);
    this.prefixes = [SOLVED_FACELETS];
    this.moves.forEach((move, i) => {
      const before = this.prefixes[i];
      this.prefixes.push(applyMove(before, move));
      if (move.endsWith("2")) {
        this.halves.set(applyMove(before, move[0]), i);
        this.halves.set(applyMove(before, `${move[0]}'`), i);
      }
    });
    this.update(state, null);
  }

  get current(): GuideStatus {
    return this.status;
  }

  /** The cube changed: after a move (`move`), or a fresh state from the cube (`move` null). */
  update(state: Facelets, move: string | null): GuideStatus {
    const found = this.locate(state);
    if (found) {
      this.anchor = { ...found, state };
      this.wrong = [];
      this.status = found.done === this.moves.length ? { kind: "scrambled" } : { kind: "on-track", ...found };
      return this.status;
    }
    if (!this.anchor) return (this.status = { kind: "solve-first" });
    if (move === null) return (this.status = { kind: "lost" }); // can't tell which moves happened

    this.wrong = simplifyMoves([...this.wrong, move]);
    const fix = invertMoves(this.wrong);
    // Safety net: the fix must really lead back (it always should).
    const back = applyMoves(state, fix);
    if (fix.length > MAX_FIX || back !== this.anchor.state) return (this.status = { kind: "lost" });
    this.status = { kind: "off-track", done: this.anchor.done, half: this.anchor.half, fix };
    return this.status;
  }

  /** The furthest point of the scramble this state is at, or null. */
  private locate(state: Facelets): { done: number; half: boolean } | null {
    for (let done = this.moves.length; done >= 0; done--) {
      if (this.prefixes[done] === state) return { done, half: false };
    }
    const half = this.halves.get(state);
    return half === undefined ? null : { done: half, half: true };
  }
}
