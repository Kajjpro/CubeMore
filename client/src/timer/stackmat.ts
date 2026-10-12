/*
 * STACKMAT: reading a SpeedStacks competition timer through the audio input.
 *
 * A Stackmat (Gen 2 to Gen 5, and its copies) sends what it shows out of its
 * data port, the round jack, all the time: a serial signal at 1200 baud, one
 * packet roughly every 80 ms. A cable into the headset / mic jack (a TRRS
 * adapter on most phones and laptops) turns it into sound we can read.
 *
 * Packet (ASCII):  status, 5 or 6 digits, checksum, "\n", "\r"
 *   status    "I" reset, "A" ready (green), " " running or idle, "S" stopped,
 *             "L" / "R" one hand on, "C" both hands on (not ready yet)
 *   digits    minutes, seconds (2), then hundredths (2) or thousandths (3)
 *   checksum  64 + the sum of the digits
 *
 *   StackmatDecoder  sound samples -> packets (any sample rate, either polarity)
 *   StackmatTracker  packets -> the same events as a Bluetooth timer (btTimer.ts)
 */

import type { BtTimerEvent } from "../btTimer";

export interface StackmatPacket {
  status: string;
  timeMs: number;
}

const BAUD = 1200;
const STATUSES = " ACILRS";

/** The time and status in a packet's bytes (ending with \n\r), or null if it isn't a valid packet. */
export function parsePacket(bytes: number[]): StackmatPacket | null {
  for (const length of [10, 9]) {
    if (bytes.length < length) continue;
    const p = bytes.slice(-length);
    if (p[length - 2] !== 0x0a || p[length - 1] !== 0x0d) continue;
    const status = String.fromCharCode(p[0]);
    if (!STATUSES.includes(status)) continue;
    const digits = p.slice(1, length - 3).map((b) => b - 0x30);
    if (digits.some((d) => d < 0 || d > 9)) continue;
    if (p[length - 3] !== 64 + digits.reduce((a, b) => a + b, 0)) continue;
    const [m, s1, s2, f1, f2, f3 = 0] = digits;
    return { status, timeMs: m * 60_000 + (s1 * 10 + s2) * 1000 + f1 * 100 + f2 * 10 + f3 };
  }
  return null;
}

/** A serial line reader: bits in, bytes out (start bit 0, 8 data bits low first, stop bit 1). */
class SerialReader {
  private bitIndex = -1;
  private byte = 0;
  private bytes: number[] = [];

  constructor(private readonly onPacket: (packet: StackmatPacket) => void) {}

  /** `count` bits of the same value in a row. */
  bits(value: 0 | 1, count: number): void {
    // A long quiet line between packets (after the last byte's stop bit): start over.
    if (count > 20) {
      if (value === 1) this.bit(1);
      this.bitIndex = -1;
      this.bytes = [];
      return;
    }
    for (let i = 0; i < count; i++) this.bit(value);
  }

  private bit(value: 0 | 1): void {
    if (this.bitIndex === -1) {
      if (value === 0) {
        this.bitIndex = 0; // the start bit
        this.byte = 0;
      }
      return;
    }
    if (this.bitIndex < 8) {
      this.byte |= value << this.bitIndex;
      this.bitIndex++;
      return;
    }
    // The stop bit: must be 1, or we weren't in step with the bytes.
    this.bitIndex = -1;
    if (value !== 1) {
      this.bytes = [];
      return;
    }
    this.bytes.push(this.byte);
    if (this.bytes.length > 12) this.bytes.shift();
    if (this.byte === 0x0d) {
      const packet = parsePacket(this.bytes);
      this.bytes = [];
      if (packet) this.onPacket(packet);
    }
  }
}

/**
 * Sound samples in, packets out. The signal is a square wave of unknown
 * loudness and polarity, and an audio input lets no steady level through: after
 * a long run of the same bit the level drifts back to zero. So we look for the
 * EDGES (a sudden jump up or down within a quarter of a bit), with an
 * automatic loudness; the time between two edges tells how many bits the run
 * holds. Both polarities are read at once; only the right one gives valid packets.
 */
export class StackmatDecoder {
  private readonly samplesPerBit: number;
  private readonly decay: number;
  /** The last quarter bit of samples (to see a jump). */
  private readonly history: Float32Array;
  private position = 0;
  /** The size of recent jumps. */
  private level = 0;
  private high = false;
  private run = 0;
  private readonly normal: SerialReader;
  private readonly inverted: SerialReader;

  constructor(sampleRate: number, onPacket: (packet: StackmatPacket) => void) {
    this.samplesPerBit = sampleRate / BAUD;
    this.history = new Float32Array(Math.max(2, Math.round(this.samplesPerBit / 4)));
    // The level forgets a loud signal in about 0.2 s.
    this.decay = Math.exp(-1 / (sampleRate * 0.2));
    this.normal = new SerialReader(onPacket);
    this.inverted = new SerialReader(onPacket);
  }

  push(samples: Float32Array): void {
    const history = this.history;
    for (let i = 0; i < samples.length; i++) {
      const x = samples[i];
      const jump = x - history[this.position];
      history[this.position] = x;
      this.position = (this.position + 1) % history.length;
      const size = Math.abs(jump);
      this.level = size > this.level ? size : this.level * this.decay;
      const threshold = Math.max(0.004, this.level * 0.4);
      this.run++;
      if (this.high ? jump < -threshold : jump > threshold) {
        this.flush();
        this.high = !this.high;
        this.run = 0;
      }
    }
  }

  /** A run ended: hand its bits to both readers. */
  private flush(): void {
    const count = Math.round(this.run / this.samplesPerBit);
    if (count === 0) return;
    this.normal.bits(this.high ? 1 : 0, count);
    this.inverted.bits(this.high ? 0 : 1, count);
  }
}

/**
 * What a Stackmat does, as timer events (the same as a GAN timer's): hands on,
 * ready, running, stopped with its time, reset. Packets repeat many times a
 * second, so only changes count.
 */
export class StackmatTracker {
  private last: StackmatPacket | null = null;
  private running = false;
  /** Packets in a row with the same running time (a missed "S": it stopped). */
  private still = 0;

  update(packet: StackmatPacket): BtTimerEvent | null {
    const last = this.last;
    this.last = packet;
    const changed = !last || last.status !== packet.status;

    if (this.running) {
      if (packet.status === "S" || packet.status === "I" || (packet.timeMs === last?.timeMs && ++this.still >= 5)) {
        this.running = false;
        this.still = 0;
        // Reset while running (status I, time 0): not a solve.
        return packet.status === "I" && packet.timeMs === 0 ? { kind: "idle" } : { kind: "stopped", timeMs: packet.timeMs };
      }
      if (packet.timeMs !== last?.timeMs) this.still = 0;
      return null;
    }

    if (packet.status === " " && packet.timeMs > 0 && last && packet.timeMs > last.timeMs && last.status !== "S") {
      this.running = true;
      this.still = 0;
      return { kind: "running" };
    }
    if (!changed) return null;
    switch (packet.status) {
      case "C":
        return { kind: "hands-on" };
      case "A":
        return { kind: "ready" };
      case "L":
      case "R":
        return last?.status === "C" || last?.status === "A" ? { kind: "hands-off" } : null;
      case "I":
        return { kind: "idle" };
      default:
        return null;
    }
  }
}
