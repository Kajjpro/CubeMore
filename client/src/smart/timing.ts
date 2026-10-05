/*
 * SMART CUBE TIMING: as exact as the cube allows.
 *
 * GAN cubes stamp every move with their own clock, so a solve's time is
 * measured on the cube itself: Bluetooth delays don't change it. Two details:
 *   - a cube's clock can run a little fast or slow. ClockFit compares the cube's
 *     clock with this computer's over the whole session (minutes of moves, so the
 *     Bluetooth jitter averages out) and corrects for it.
 *   - a move the cube missed and later recovered has no time: it gets one from
 *     its neighbours (50 ms apart), like gan-web-bluetooth does.
 * Cubes without their own clock use the time each move arrived.
 */

export interface TimedMove {
  move: string;
  /** performance.now() when the move arrived, or null (a recovered move). */
  hostAt: number | null;
  /** The cube's own clock (ms), or null if the cube has none (or missed it). */
  cubeAt: number | null;
}

/** How the solve started: with its first move, or when the inspection ran out (performance.now()). */
export type SolveStart = { kind: "first-move" } | { kind: "at"; hostAt: number };

const MIN_FIT_SPAN_MS = 3_000;
const MIN_FIT_POINTS = 10;
const MAX_POINTS = 400;

/** Host milliseconds per cube millisecond, fitted by least squares over the session. */
export class ClockFit {
  private points: [number, number][] = [];

  add(cubeAt: number | null, hostAt: number | null): void {
    if (cubeAt === null || hostAt === null) return;
    this.points.push([cubeAt, hostAt]);
    if (this.points.length > MAX_POINTS) this.points.shift();
  }

  reset(): void {
    this.points = [];
  }

  ratio(): number {
    const n = this.points.length;
    if (n < MIN_FIT_POINTS) return 1;
    const xs = this.points.map((p) => p[0]);
    if (Math.max(...xs) - Math.min(...xs) < MIN_FIT_SPAN_MS) return 1;
    const meanX = xs.reduce((a, b) => a + b, 0) / n;
    const meanY = this.points.reduce((a, p) => a + p[1], 0) / n;
    let sxy = 0;
    let sxx = 0;
    for (const [x, y] of this.points) {
      sxy += (x - meanX) * (y - meanY);
      sxx += (x - meanX) ** 2;
    }
    const slope = sxy / sxx;
    // A real clock is never off by this much: something's wrong (a cube reset), don't correct.
    return Number.isFinite(slope) && slope > 0.95 && slope < 1.05 ? slope : 1;
  }
}

/** Fills missing timestamps from the neighbours: 50 ms before the next move, or after the previous one. */
function filled(values: (number | null)[]): number[] | null {
  if (!values.some((v) => v !== null)) return null;
  const result = [...values];
  for (let i = result.length - 2; i >= 0; i--) {
    if (result[i] === null && result[i + 1] !== null) result[i] = result[i + 1]! - 50;
  }
  for (let i = 1; i < result.length; i++) {
    if (result[i] === null && result[i - 1] !== null) result[i] = result[i - 1]! + 50;
  }
  return result as number[];
}

/**
 * Each move's time from the start of the solve (whole ms, never going down).
 * The last one is the solve's time.
 */
export function solveTimes(moves: TimedMove[], start: SolveStart, ratio: number): number[] {
  if (moves.length === 0) return [];
  const cube = filled(moves.map((m) => m.cubeAt));
  const host = filled(moves.map((m) => m.hostAt));
  const fromFirst = cube
    ? cube.map((t) => (t - cube[0]) * ratio)
    : host
      ? host.map((t) => t - host[0])
      : moves.map(() => 0);

  // Started by the inspection running out: the time before the first move counts too.
  const offset = start.kind === "at" && host ? Math.max(0, host[0] - start.hostAt) : 0;

  const times: number[] = [];
  for (const t of fromFirst) {
    const time = Math.max(0, Math.round(offset + t));
    times.push(times.length > 0 ? Math.max(times[times.length - 1], time) : time);
  }
  return times;
}
