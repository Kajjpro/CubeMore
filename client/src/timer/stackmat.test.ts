import { describe, expect, it } from "vitest";
import { StackmatDecoder, StackmatTracker, parsePacket, type StackmatPacket } from "./stackmat";

/** The bytes a Stackmat sends for this status and time (5 digits, or 6 for a Gen 4+). */
function packetBytes(status: string, timeMs: number, sixDigits: boolean): number[] {
  const m = Math.floor(timeMs / 60_000);
  const s = Math.floor((timeMs % 60_000) / 1000);
  const ms = timeMs % 1000;
  const digits = [m, Math.floor(s / 10), s % 10, Math.floor(ms / 100), Math.floor(ms / 10) % 10, ...(sixDigits ? [ms % 10] : [])];
  return [status.charCodeAt(0), ...digits.map((d) => d + 0x30), 64 + digits.reduce((a, b) => a + b, 0), 0x0a, 0x0d];
}

/** A pseudo-random number generator, so the noise is the same every run. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

/**
 * The sound a Stackmat cable gives: serial bits at about 1200 baud, through an
 * audio input (which lets no steady level through), with noise.
 */
function signal(
  packets: StackmatPacket[],
  options: { rate: number; baud: number; invert: boolean; amplitude: number; sixDigits: boolean; gapBits: number; cutoffHz?: number },
): Float32Array {
  const bits: number[] = [];
  for (const p of packets) {
    for (let i = 0; i < options.gapBits; i++) bits.push(1);
    for (const byte of packetBytes(p.status, p.timeMs, options.sixDigits)) {
      bits.push(0);
      for (let i = 0; i < 8; i++) bits.push((byte >> i) & 1);
      bits.push(1);
    }
  }
  // The timer goes on sending: the start of the next packet ends the last one.
  for (let i = 0; i < 30; i++) bits.push(1);
  bits.push(0, 0);
  const perBit = options.rate / options.baud;
  const out = new Float32Array(Math.ceil(bits.length * perBit));
  const random = seeded(42);
  // A high-pass filter (about 20 Hz on a sound card's input; much higher on some phone headset inputs).
  const alpha = 1 / (1 + (2 * Math.PI * (options.cutoffHz ?? 20)) / options.rate);
  let previousIn = 0;
  let previousOut = 0;
  for (let i = 0; i < out.length; i++) {
    const bit = bits[Math.min(bits.length - 1, Math.floor(i / perBit))];
    const level = (bit ? 1 : -1) * (options.invert ? -1 : 1) * options.amplitude;
    const filtered = alpha * (previousOut + level - previousIn);
    previousIn = level;
    previousOut = filtered;
    out[i] = filtered + (random() - 0.5) * options.amplitude * 0.15;
  }
  return out;
}

function decode(samples: Float32Array, rate: number): StackmatPacket[] {
  const got: StackmatPacket[] = [];
  const decoder = new StackmatDecoder(rate, (p) => got.push(p));
  // In chunks, like the audio callback gives them.
  for (let i = 0; i < samples.length; i += 2048) decoder.push(samples.subarray(i, i + 2048));
  return got;
}

const SOLVE: StackmatPacket[] = [
  { status: "I", timeMs: 0 },
  { status: "C", timeMs: 0 },
  { status: "A", timeMs: 0 },
  { status: " ", timeMs: 80 },
  { status: " ", timeMs: 160 },
  { status: " ", timeMs: 7_350 },
  { status: "S", timeMs: 7_420 },
  { status: "S", timeMs: 7_420 },
  { status: " ", timeMs: 83_450 },
];

describe("Stackmat packets", () => {
  it("reads 5 and 6 digit packets and checks the checksum", () => {
    expect(parsePacket(packetBytes("S", 12_340, false))).toEqual({ status: "S", timeMs: 12_340 });
    expect(parsePacket(packetBytes(" ", 61_234, true))).toEqual({ status: " ", timeMs: 61_234 });
    const broken = packetBytes("S", 12_340, false);
    broken[3] += 1;
    expect(parsePacket(broken)).toBeNull();
    expect(parsePacket([0x41, 0x0a, 0x0d])).toBeNull();
  });
});

describe("decoding the sound", () => {
  for (const rate of [44_100, 48_000]) {
    for (const invert of [false, true]) {
      for (const sixDigits of [false, true]) {
        it(`${rate} Hz, ${invert ? "inverted" : "normal"}, ${sixDigits ? 6 : 5} digits`, () => {
          const expected = sixDigits ? SOLVE.map((p) => ({ ...p, timeMs: p.timeMs + 3 })) : SOLVE;
          const samples = signal(expected, { rate, baud: 1203, invert, amplitude: 0.4, sixDigits, gapBits: 30 });
          expect(decode(samples, rate)).toEqual(expected);
        });
      }
    }
  }

  it("a quiet signal, and packets sent back to back", () => {
    const samples = signal(SOLVE, { rate: 48_000, baud: 1197, invert: false, amplitude: 0.03, sixDigits: false, gapBits: 0 });
    expect(decode(samples, 48_000)).toEqual(SOLVE);
  });

  it("a phone input that keeps mostly the edges (high-pass at 300 Hz)", () => {
    const samples = signal(SOLVE, { rate: 48_000, baud: 1200, invert: true, amplitude: 0.2, sixDigits: false, gapBits: 40, cutoffHz: 300 });
    expect(decode(samples, 48_000)).toEqual(SOLVE);
  });

  it("silence and noise give nothing", () => {
    const random = seeded(1);
    const noise = Float32Array.from({ length: 48_000 }, () => (random() - 0.5) * 0.002);
    expect(decode(noise, 48_000)).toEqual([]);
  });
});

describe("Stackmat to timer events", () => {
  it("hands on, ready, running, stopped once with the timer's time", () => {
    const tracker = new StackmatTracker();
    const events = [...SOLVE.slice(0, 8), { status: "I", timeMs: 0 }].map((p) => tracker.update(p)).filter(Boolean);
    expect(events).toEqual([{ kind: "idle" }, { kind: "hands-on" }, { kind: "ready" }, { kind: "running" }, { kind: "stopped", timeMs: 7_420 }, { kind: "idle" }]);
  });

  it("a stop it didn't see: the time stays the same, so it stopped", () => {
    const tracker = new StackmatTracker();
    const packets = [{ status: "A", timeMs: 0 }, { status: " ", timeMs: 50 }, { status: " ", timeMs: 900 }, ...Array.from({ length: 6 }, () => ({ status: " ", timeMs: 950 }))];
    const events = packets.map((p) => tracker.update(p)).filter(Boolean);
    expect(events).toEqual([{ kind: "ready" }, { kind: "running" }, { kind: "stopped", timeMs: 950 }]);
  });
});
