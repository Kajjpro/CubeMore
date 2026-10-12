/*
 * A REAL TIMER: a GAN Smart Timer / GAN Halo over Bluetooth (gan-web-bluetooth),
 * or a Stackmat through a cable into the audio input (timer/stackmat.ts).
 *
 * Practise like at a competition: hands on the timer, lift to start, slap to
 * stop. The web timer follows it (red while your hands are on, green when
 * ready, running), and the time that counts is the one the timer itself
 * measured, not one measured over Bluetooth or sound.
 */

import { useSyncExternalStore } from "react";
import { StackmatDecoder, StackmatTracker } from "./timer/stackmat";

export interface BtTimerInfo {
  status: "off" | "connecting" | "on";
  kind: "gan" | "stackmat" | null;
  name: string | null;
  error: string | null;
  /** Stackmat: its signal is coming in (it's on and plugged in). */
  signal: boolean;
  /** Stackmat: the sound inputs to choose from, once allowed. */
  inputs: { id: string; label: string }[];
  inputId: string | null;
}

export type BtTimerEvent =
  | { kind: "hands-on" }
  | { kind: "ready" }
  | { kind: "hands-off" }
  | { kind: "running" }
  | { kind: "stopped"; timeMs: number }
  | { kind: "idle" };

const OFF: BtTimerInfo = { status: "off", kind: null, name: null, error: null, signal: false, inputs: [], inputId: null };
let info: BtTimerInfo = OFF;
const infoListeners = new Set<() => void>();
const eventListeners = new Set<(event: BtTimerEvent) => void>();
let disconnectTimer: (() => void) | null = null;

function setInfo(next: Partial<BtTimerInfo>): void {
  info = { ...info, ...next };
  infoListeners.forEach((listener) => listener());
}

export function useBtTimer(): BtTimerInfo {
  return useSyncExternalStore(
    (listener) => {
      infoListeners.add(listener);
      return () => infoListeners.delete(listener);
    },
    () => info,
  );
}

export function onBtTimer(listener: (event: BtTimerEvent) => void): () => void {
  eventListeners.add(listener);
  return () => eventListeners.delete(listener);
}

function emit(event: BtTimerEvent): void {
  eventListeners.forEach((listener) => listener(event));
}

export async function connectBtTimer(): Promise<void> {
  if (info.status !== "off") return;
  setInfo({ ...OFF, status: "connecting", kind: "gan" });
  try {
    const { connectGanTimer, GanTimerState } = await import("gan-web-bluetooth");
    const connection = await connectGanTimer();
    const subscription = connection.events$.subscribe((event) => {
      switch (event.state) {
        case GanTimerState.HANDS_ON:
          return emit({ kind: "hands-on" });
        case GanTimerState.GET_SET:
          return emit({ kind: "ready" });
        case GanTimerState.HANDS_OFF:
          return emit({ kind: "hands-off" });
        case GanTimerState.RUNNING:
          return emit({ kind: "running" });
        case GanTimerState.STOPPED:
          if (event.recordedTime) emit({ kind: "stopped", timeMs: event.recordedTime.asTimestamp });
          return;
        case GanTimerState.IDLE:
          return emit({ kind: "idle" });
        case GanTimerState.DISCONNECT:
          disconnectBtTimer();
          setInfo({ error: "The timer disconnected." });
          return;
      }
    });
    disconnectTimer = () => {
      subscription.unsubscribe();
      connection.disconnect();
    };
    setInfo({ status: "on", name: "GAN timer" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const cancelled = /cancel|chosen/i.test(message);
    setInfo({ ...OFF, error: cancelled ? null : "Couldn't connect to the timer. Is it on and close by?" });
  }
}

// ---------------------------------------------------------------------------
// Stackmat

/** True if this browser can read a sound input. */
export const audioInputSupported = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof AudioContext !== "undefined";

const INPUT_KEY = "cube-racing:stackmat-input";
/** No packet for this long: the timer is off or unplugged. */
const SIGNAL_LOST_MS = 1500;

/** Listens to the Stackmat on a sound input (the one chosen before, or the default). */
export async function connectStackmat(inputId: string | null = localStorage.getItem(INPUT_KEY)): Promise<void> {
  if (info.status !== "off") return;
  setInfo({ ...OFF, status: "connecting", kind: "stackmat" });
  let stream: MediaStream;
  try {
    // The raw signal: no echo cancelling, noise removal or automatic volume, which would ruin it.
    const raw = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 };
    stream = await navigator.mediaDevices.getUserMedia({ audio: inputId ? { ...raw, deviceId: { exact: inputId } } : raw }).catch((error: unknown) => {
      // The input chosen before is gone: use the default one.
      if (inputId && error instanceof Error && error.name === "OverconstrainedError") return navigator.mediaDevices.getUserMedia({ audio: raw });
      throw error;
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    setInfo({
      ...OFF,
      error:
        name === "NotAllowedError" || name === "SecurityError"
          ? "The browser wasn't allowed to use the sound input. Allow the microphone in the address bar, then try again."
          : name === "NotFoundError"
            ? "No sound input found. Plug the Stackmat cable into the headset or mic jack."
            : "Couldn't open the sound input.",
    });
    return;
  }

  const context = new AudioContext();
  await context.resume().catch(() => {});
  const source = context.createMediaStreamSource(stream);
  // A ScriptProcessor works in every browser and needs no extra file; its output stays silent.
  const processor = context.createScriptProcessor(2048, 1, 1);
  const tracker = new StackmatTracker();
  let lastPacketAt = 0;
  const decoder = new StackmatDecoder(context.sampleRate, (packet) => {
    lastPacketAt = performance.now();
    if (!info.signal) setInfo({ signal: true, error: null });
    const event = tracker.update(packet);
    if (event) emit(event);
  });
  processor.onaudioprocess = (event) => decoder.push(event.inputBuffer.getChannelData(0));
  source.connect(processor);
  processor.connect(context.destination);
  const watch = setInterval(() => {
    if (info.signal && performance.now() - lastPacketAt > SIGNAL_LOST_MS) setInfo({ signal: false });
  }, 500);

  const track = stream.getAudioTracks()[0];
  const usedId = track?.getSettings().deviceId ?? null;
  disconnectTimer = () => {
    clearInterval(watch);
    processor.disconnect();
    source.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    void context.close().catch(() => {});
  };
  // The labels of the inputs are only known once the browser was allowed in.
  const inputs = (await navigator.mediaDevices.enumerateDevices().catch(() => []))
    .filter((d) => d.kind === "audioinput" && d.deviceId)
    .map((d, i) => ({ id: d.deviceId, label: d.label || `Input ${i + 1}` }));
  setInfo({ status: "on", name: "Stackmat", inputs, inputId: usedId });
}

/** Listen on another sound input (remembered for next time). */
export async function chooseStackmatInput(inputId: string): Promise<void> {
  localStorage.setItem(INPUT_KEY, inputId);
  disconnectBtTimer();
  await connectStackmat(inputId);
}

export function disconnectBtTimer(): void {
  disconnectTimer?.();
  disconnectTimer = null;
  setInfo(OFF);
}
