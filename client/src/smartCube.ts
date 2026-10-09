/*
 * SMART CUBE: one Bluetooth cube for the whole app.
 *
 * Two ways to connect:
 *   "gan"    GAN cubes (Gen2, Gen3, Gen4: 356 i3, i Carry 2, 12 ui, 14 ui...)
 *            through gan-web-bluetooth. The cube sends each move the moment it
 *            happens, stamped with its OWN clock, recovers moves Bluetooth lost,
 *            and reports its full state when asked: the most exact timing.
 *   "qiyi"   QiYi cubes (QY-QYSC, X-Man Tornado V4 AI...) with our own driver
 *            (smart/qiyi.ts): the cube's own clock, lost turns recovered, its
 *            state with every turn.
 *   "other"  GoCube, Giiker, the first GAN 356i... through cubing.js
 *            (moves are timed when they arrive).
 *   "keyboard"  development only (?simcube=1): turn the cube with keys.
 *
 * The cube's state is kept as facelets (shared/cube3.ts), the same format GAN
 * cubes report, so a full state from the cube replaces ours exactly.
 */

import { useSyncExternalStore } from "react";
import {
  SOLVED_FACELETS,
  applyMove,
  applyMoves,
  invertMoves,
  isFaceMove,
  parseMoves,
  type Facelets,
} from "@cube-racing/shared/cube3";
import { connectQiyi } from "./smart/qiyi";
import { ClockFit, type TimedMove } from "./smart/timing";

export type CubeKind = "gan" | "qiyi" | "other" | "keyboard";

export interface SmartCubeInfo {
  status: "off" | "connecting" | "on";
  kind: CubeKind | null;
  name: string | null;
  error: string | null;
  battery: number | null;
  /** Waiting for the user to type the cube's MAC address (some GAN and QiYi cubes need it). */
  askingMac: string | null;
  askingMacBrand?: "gan" | "qiyi";
}

type MoveListener = (move: TimedMove, state: Facelets) => void;
type StateListener = (state: Facelets) => void;

let info: SmartCubeInfo = { status: "off", kind: null, name: null, error: null, battery: null, askingMac: null };
const infoListeners = new Set<() => void>();
const moveListeners = new Set<MoveListener>();
const stateListeners = new Set<StateListener>();

let state: Facelets | null = null;
const clock = new ClockFit();
let disconnectCube: (() => void) | null = null;
let requestState: (() => void) | null = null;
let resetCube: (() => void) | null = null;
let answerMac: ((mac: string | null) => void) | null = null;

function setInfo(next: Partial<SmartCubeInfo>): void {
  info = { ...info, ...next };
  infoListeners.forEach((listener) => listener());
}

/**
 * Downloads the cube libraries ahead of time (called when the connect buttons
 * show). Browsers only open the Bluetooth picker shortly after a tap (about 5 s
 * in Chrome); downloading a library first on a slow phone could take longer, and
 * the picker would then be refused.
 */
export function preloadCubeDrivers(): void {
  void import("gan-web-bluetooth").catch(() => {});
  void import("cubing/bluetooth").catch(() => {});
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

/** Every move, with the cube's state after it. Returns an unsubscribe function. */
export function onCubeMove(listener: MoveListener): () => void {
  moveListeners.add(listener);
  return () => moveListeners.delete(listener);
}

/** A fresh full state from the cube that differs from what the moves said (a lost move). */
export function onCubeState(listener: StateListener): () => void {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

/** The cube's current state (null when no cube is connected). */
export function cubeState(): Facelets | null {
  return state;
}

/** Host ms per cube ms: how fast this cube's clock runs compared to this computer's. */
export function cubeClockRatio(): number {
  return clock.ratio();
}

/** Asks the cube for its full state (GAN only; others can't). */
export function requestCubeState(): void {
  requestState?.();
}

function emitMove(move: TimedMove): void {
  if (!state || !isFaceMove(move.move)) return;
  state = applyMove(state, move.move);
  clock.add(move.cubeAt, move.hostAt);
  moveListeners.forEach((listener) => listener(move, state!));
}

function emitState(next: Facelets): void {
  if (next === state) return;
  state = next;
  stateListeners.forEach((listener) => listener(next));
}

/** "My cube is solved now": after the app lost track of it. GAN cubes are told too. */
export function markSmartCubeSolved(): void {
  if (!state) return;
  resetCube?.();
  emitState(SOLVED_FACELETS);
}

/** The user typed the MAC address (or cancelled with null). */
export function answerMacAddress(mac: string | null): void {
  answerMac?.(mac);
}

export async function connectSmartCube(kind: CubeKind): Promise<void> {
  if (info.status !== "off") return;
  setInfo({ status: "connecting", kind, error: null, battery: null, askingMac: null });
  clock.reset();
  try {
    if (kind === "gan") await connectGan();
    else if (kind === "qiyi") await connectQiyiCube();
    else await connectWithCubing(kind);
    setInfo({ status: "on" });
  } catch (error) {
    disconnectCube?.();
    disconnectCube = null;
    state = null;
    setInfo({ status: "off", kind: null, askingMac: null, error: connectErrorMessage(error) });
  }
}

/** What went wrong while connecting, in words a cuber can act on (null: they closed the picker). */
function connectErrorMessage(error: unknown): string | null {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (/cancel|chosen/i.test(message)) return null;
  if (name === "NotFoundError" && /adapter|bluetooth/i.test(message)) return "Bluetooth is off. Turn it on and try again.";
  if (name === "NotFoundError") return null; // the picker was closed
  if (name === "SecurityError" || name === "NotAllowedError") {
    return "The browser wasn't allowed to use Bluetooth. Allow it (and \"Nearby devices\" on Android), then try again.";
  }
  if (name === "NetworkError" || /gatt|disconnected/i.test(message)) {
    return "The cube disconnected while connecting. Turn a face to wake it up, close the cube's own app if it's open, and try again.";
  }
  return message || "Couldn't connect to the cube. Is it on and close by?";
}

export function disconnectSmartCube(): void {
  disconnectCube?.();
  disconnectCube = requestState = resetCube = null;
  state = null;
  setInfo({ status: "off", kind: null, name: null, battery: null, askingMac: null });
}

/**
 * Development only (?simcube=1): turns the connected keyboard cube by code, one
 * move every `gapMs`, so screens can be tried without a real cube.
 */
if (import.meta.env.DEV && keyboardCubeAllowed) {
  (window as unknown as { __cubemoreTurn: (moves: string[], gapMs: number) => Promise<void> }).__cubemoreTurn = async (moves, gapMs) => {
    for (const move of moves) {
      emitMove({ move, hostAt: performance.now(), cubeAt: null });
      await new Promise((resolve) => setTimeout(resolve, gapMs));
    }
  };
}

// ---------------------------------------------------------------------------
// GAN cubes (gan-web-bluetooth)

const MAC_KEY = "cube-racing:gan-macs";
const MAC_PATTERN = /^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/;

function savedMacs(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(MAC_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function saveMac(deviceName: string, mac: string | null): void {
  try {
    const macs = savedMacs();
    if (mac) macs[deviceName] = mac;
    else delete macs[deviceName];
    localStorage.setItem(MAC_KEY, JSON.stringify(macs));
  } catch {
    // Storage blocked: the MAC is asked again next time.
  }
}

/** Shows the MAC address form in the menu and waits for the answer. */
function askMac(deviceName: string): Promise<string | null> {
  setInfo({ askingMac: deviceName, askingMacBrand: /^(QY|XMD)/i.test(deviceName) ? "qiyi" : "gan" });
  return new Promise((resolve) => {
    answerMac = (mac) => {
      answerMac = null;
      setInfo({ askingMac: null });
      resolve(mac === null ? null : mac.trim().toUpperCase().replace(/-/g, ":"));
    };
  });
}

/** A cube this long without a move has sent everything: its full state can be trusted. */
const STILL_MS = 300;

/** The first full state must arrive this fast, or the cube's data can't be read (a wrong MAC). */
const FIRST_STATE_TIMEOUT_MS = 5_000;

async function connectGan(): Promise<void> {
  const { connectGanCube } = await import("gan-web-bluetooth");
  const connection = await connectGanCube(async (device, isFallbackCall) => {
    const name = device.name ?? "GAN cube";
    const saved = savedMacs()[name];
    if (saved) return saved;
    if (!isFallbackCall) return null; // let the library try to read it by itself first
    const typed = await askMac(name);
    if (!typed) throw new Error("cancelled");
    if (!MAC_PATTERN.test(typed)) throw new Error("That MAC address doesn't look right. It's like AB:12:CD:34:EF:56.");
    return typed;
  });

  let gotState: () => void = () => {};
  const firstState = new Promise<void>((resolve) => (gotState = resolve));
  // A full state can arrive just after a newer move: only trust it if it belongs to
  // the latest move (same serial), or if the cube has been still for a moment.
  let lastMove = { serial: -1, at: 0 };

  const subscription = connection.events$.subscribe((event) => {
    switch (event.type) {
      case "MOVE":
        lastMove = { serial: event.serial, at: performance.now() };
        emitMove({ move: event.move, hostAt: event.localTimestamp, cubeAt: event.cubeTimestamp });
        break;
      case "FACELETS":
        if (state === null) state = event.facelets;
        else if (event.serial === lastMove.serial || performance.now() - lastMove.at > STILL_MS) emitState(event.facelets);
        gotState();
        break;
      case "BATTERY":
        setInfo({ battery: event.batteryLevel });
        break;
      case "DISCONNECT":
        disconnectSmartCube();
        setInfo({ error: "The cube disconnected." });
        break;
    }
  });
  disconnectCube = () => {
    subscription.unsubscribe();
    void connection.disconnect();
  };
  requestState = () => void connection.sendCubeCommand({ type: "REQUEST_FACELETS" }).catch(() => {});
  resetCube = () => void connection.sendCubeCommand({ type: "REQUEST_RESET" }).catch(() => {});

  await connection.sendCubeCommand({ type: "REQUEST_FACELETS" });
  const timedOut = await Promise.race([
    firstState.then(() => false),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(true), FIRST_STATE_TIMEOUT_MS)),
  ]);
  if (timedOut) {
    saveMac(connection.deviceName, null); // probably a wrong MAC: ask again next time
    throw new Error("The cube connected but its data couldn't be read. Check the MAC address and try again.");
  }
  saveMac(connection.deviceName, connection.deviceMAC);
  void connection.sendCubeCommand({ type: "REQUEST_BATTERY" }).catch(() => {});
  setInfo({ name: connection.deviceName });
}

// ---------------------------------------------------------------------------
// QiYi cubes (smart/qiyi.ts)

async function connectQiyiCube(): Promise<void> {
  const connection = await connectQiyi(
    {
      move(move, cubeAt, recovered) {
        emitMove({ move, hostAt: recovered ? null : performance.now(), cubeAt });
      },
      state(facelets) {
        // The first state (the cube's hello) is where we start; later ones fix lost turns.
        if (state === null) state = facelets;
        else if (facelets !== state) emitState(facelets);
      },
      battery(level) {
        if (info.battery !== level) setInfo({ battery: level });
      },
      disconnect() {
        disconnectSmartCube();
        setInfo({ error: "The cube disconnected." });
      },
    },
    async (name, guess) => {
      const saved = savedMacs()[name];
      if (saved && saved !== guess) return saved;
      const typed = await askMac(name);
      if (!typed) return null;
      if (!MAC_PATTERN.test(typed)) throw new Error("That MAC address doesn't look right. It's like AB:12:CD:34:EF:56.");
      return typed;
    },
  );
  disconnectCube = () => connection.disconnect();
  if (state === null) state = SOLVED_FACELETS;
  saveMac(connection.name, connection.mac);
  setInfo({ name: connection.name });
}

// ---------------------------------------------------------------------------
// Other cubes and the keyboard cube (cubing.js)

async function connectWithCubing(kind: "other" | "keyboard"): Promise<void> {
  const { connectSmartPuzzle, debugKeyboardConnect } = await import("cubing/bluetooth");
  const puzzle = kind === "other" ? await connectSmartPuzzle() : await debugKeyboardConnect(document.body, "3x3x3");
  disconnectCube = () => puzzle.disconnect();
  // Cubes that report their real state start from it; others start as solved.
  state = await puzzle
    .getPattern()
    .then(faceletsOf)
    .catch(() => SOLVED_FACELETS);
  puzzle.addAlgLeafListener((event) => {
    emitMove({ move: event.latestAlgLeaf.toString(), hostAt: performance.now(), cubeAt: null });
  });
  setInfo({ name: puzzle.name() ?? (kind === "keyboard" ? "Keyboard cube" : "Smart cube") });
}

/** A cubing.js pattern as facelets: solve it, then undo the solution on a solved cube. */
async function faceletsOf(pattern: import("cubing/kpuzzle").KPattern): Promise<Facelets> {
  if (pattern.experimentalIsSolved({ ignorePuzzleOrientation: true, ignoreCenterOrientation: true })) return SOLVED_FACELETS;
  const { experimentalSolve3x3x3IgnoringCenters } = await import("cubing/search");
  const solution = await experimentalSolve3x3x3IgnoringCenters(pattern);
  return applyMoves(SOLVED_FACELETS, invertMoves(parseMoves(solution.toString())));
}
