/*
 * SMART CUBE (beta): a Bluetooth cube (GAN, GoCube, Giiker...) through cubing.js.
 *
 * With a smart cube connected, a 3x3 solve needs no spacebar:
 *   scrambling -> you turn your cube until it matches the scramble
 *   armed      -> it matches: your first turn starts the timer
 *   running    -> the timer runs, and your moves are sent to the room
 *   solved     -> the cube is solved: the timer stops by itself
 *
 * cubing.js is only loaded when you connect. For testing without a cube,
 * ?simcube=1 adds a "keyboard cube" (cubing.js turns keys into moves).
 */

import { useSyncExternalStore } from "react";
import type { KPattern } from "cubing/kpuzzle";

export type SmartState = "scrambling" | "armed" | "running" | "solved";

/**
 * Follows one solve from moves and patterns. Pure logic (no Bluetooth), so it
 * can be tested with a list of moves.
 */
export class SmartSolveTracker {
  state: SmartState = "scrambling";
  startedAt = 0;
  elapsedMs = 0;

  constructor(private readonly target: KPattern) {}

  /** The cube's pattern after a move, and when the move happened (ms). Returns the new state. */
  onMove(pattern: KPattern, at: number): SmartState {
    if (this.state === "scrambling") {
      if (pattern.isIdentical(this.target)) this.state = "armed";
    } else if (this.state === "armed") {
      // The first turn after matching the scramble starts the solve.
      this.state = "running";
      this.startedAt = at;
    }
    if (this.state === "running" && pattern.experimentalIsSolved({ ignorePuzzleOrientation: true, ignoreCenterOrientation: true })) {
      this.state = "solved";
      this.elapsedMs = Math.round(at - this.startedAt);
    }
    return this.state;
  }
}

// ---------------------------------------------------------------------------
// The connection: one smart cube for the whole app.

export interface SmartCubeInfo {
  status: "off" | "connecting" | "on";
  name: string | null;
  error: string | null;
}

type MoveListener = (move: string, pattern: KPattern, at: number) => void;

let info: SmartCubeInfo = { status: "off", name: null, error: null };
const infoListeners = new Set<() => void>();
const moveListeners = new Set<MoveListener>();
let disconnectCube: (() => void) | null = null;
let pattern: KPattern | null = null;
let solvedPattern: KPattern | null = null;

function setInfo(next: Partial<SmartCubeInfo>): void {
  info = { ...info, ...next };
  infoListeners.forEach((listener) => listener());
}

/** True if this browser can talk to Bluetooth cubes (Chrome / Edge on desktop and Android). */
export const bluetoothSupported = typeof navigator !== "undefined" && "bluetooth" in navigator;

/** Development only: ?simcube=1 offers a cube you turn with the keyboard. */
export const keyboardCubeAllowed = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("simcube");

export function useSmartCube(): SmartCubeInfo {
  return useSyncExternalStore(
    (listener) => {
      infoListeners.add(listener);
      return () => infoListeners.delete(listener);
    },
    () => info,
  );
}

/** Every move from the cube (and the pattern after it). Returns an unsubscribe function. */
export function onSmartMove(listener: MoveListener): () => void {
  moveListeners.add(listener);
  return () => moveListeners.delete(listener);
}

/** The pattern a scramble makes from a solved cube (to know when the cube matches it). */
export async function scrambledPattern(scramble: string): Promise<KPattern> {
  const { cube3x3x3 } = await import("cubing/puzzles");
  return (await cube3x3x3.kpuzzle()).defaultPattern().applyAlg(scramble);
}

export async function connectSmartCube(kind: "bluetooth" | "keyboard"): Promise<void> {
  if (info.status !== "off") return;
  setInfo({ status: "connecting", error: null });
  try {
    const [{ connectSmartPuzzle, debugKeyboardConnect }, { cube3x3x3 }] = await Promise.all([
      import("cubing/bluetooth"),
      import("cubing/puzzles"),
    ]);
    const puzzle = kind === "bluetooth" ? await connectSmartPuzzle() : await debugKeyboardConnect(document.body, "3x3x3");
    solvedPattern = (await cube3x3x3.kpuzzle()).defaultPattern();
    // Cubes that report their real state start from it; others start as solved.
    pattern = await puzzle.getPattern().catch(() => solvedPattern!);
    puzzle.addAlgLeafListener((event) => {
      if (!pattern) return;
      pattern = event.pattern ?? pattern.applyMove(event.latestAlgLeaf.toString());
      const move = event.latestAlgLeaf.toString();
      const at = performance.now();
      moveListeners.forEach((listener) => listener(move, pattern!, at));
    });
    disconnectCube = () => puzzle.disconnect();
    setInfo({ status: "on", name: puzzle.name() ?? (kind === "keyboard" ? "Keyboard cube" : "Smart cube") });
  } catch (error) {
    // Closing the browser's device picker lands here too.
    const cancelled = error instanceof Error && /cancel|chosen/i.test(error.message);
    setInfo({ status: "off", error: cancelled ? null : "Couldn't connect to the cube. Is it on and close by?" });
  }
}

export function disconnectSmartCube(): void {
  disconnectCube?.();
  disconnectCube = null;
  pattern = null;
  setInfo({ status: "off", name: null });
}

/** The cube's current pattern (null when no cube is connected). */
export function currentSmartPattern(): KPattern | null {
  return pattern;
}

/** "My cube is solved now": for cubes that can't report their state, after they drift. */
export function markSmartCubeSolved(): void {
  if (solvedPattern) pattern = solvedPattern;
}
