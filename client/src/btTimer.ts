/*
 * BLUETOOTH TIMER: a GAN Smart Timer or GAN Halo Smart Timer (gan-web-bluetooth).
 *
 * Practise like at a competition: hands on the timer, lift to start, slap to
 * stop. The web timer follows it (red while your hands are on, green when
 * ready, running), and the time that counts is the one the timer itself
 * measured, to the millisecond, not one measured over Bluetooth.
 */

import { useSyncExternalStore } from "react";

export interface BtTimerInfo {
  status: "off" | "connecting" | "on";
  name: string | null;
  error: string | null;
}

/** What the timer did: hands on / ready / running / stopped (with its time) / back to idle. */
export type BtTimerEvent =
  | { kind: "hands-on" }
  | { kind: "ready" }
  | { kind: "hands-off" }
  | { kind: "running" }
  | { kind: "stopped"; timeMs: number }
  | { kind: "idle" };

let info: BtTimerInfo = { status: "off", name: null, error: null };
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
  setInfo({ status: "connecting", error: null });
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
    setInfo({ status: "off", error: cancelled ? null : "Couldn't connect to the timer. Is it on and close by?" });
  }
}

export function disconnectBtTimer(): void {
  disconnectTimer?.();
  disconnectTimer = null;
  setInfo({ status: "off", name: null });
}
