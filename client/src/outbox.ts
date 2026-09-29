/*
 * THE OUTBOX: how a solve is never lost.
 *
 * 1. The moment the timer stops, the solve is saved here (and in localStorage).
 * 2. When the player confirms it (OK / +2 / DNF, or automatically after 5 s),
 *    it is marked "confirmed" and sent to the server.
 * 3. It stays here until the server answers:
 *      - ok            -> it's recorded (or was already): remove it.
 *      - NOT_CURRENT   -> that solve is over, the snapshot has the truth: remove it.
 *      - anything else -> (offline, timeout, "not in room" while rejoining...)
 *                         keep it and try again in a moment.
 *    It is also resent after every (re)join, including after a page refresh.
 *
 * Sending the same solve twice is harmless: the server ignores duplicates.
 */

import { useSyncExternalStore } from "react";
import { ClientEvents, type Penalty } from "@cube-racing/shared";
import { request } from "./socket";
import { profileKey } from "./storage";

export interface OutboxEntry {
  roomCode: string;
  matchId: string;
  setIndex: number;
  solveIndex: number;
  timeMs: number;
  penalty: Penalty;
  /** false while the player can still pick OK / +2 / DNF. */
  confirmed: boolean;
  createdAt: number;
}

const STORAGE_KEY = profileKey("outbox");
const RETRY_MS = 2_000;

let entries: OutboxEntry[] = load();
const listeners = new Set<() => void>();

export function solveKey(e: Pick<OutboxEntry, "roomCode" | "matchId" | "setIndex" | "solveIndex">): string {
  return `${e.roomCode}/${e.matchId}/${e.setIndex}/${e.solveIndex}`;
}

function load(): OutboxEntry[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as OutboxEntry[];
    if (!Array.isArray(saved)) return [];
    // After a refresh, the 5-second choice is over: unconfirmed solves count as confirmed.
    // (Their penalty can still be changed by tapping the solve in the table.)
    // Solves older than a day belong to rooms that are long gone.
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    return saved.filter((e) => e.createdAt > dayAgo).map((e) => ({ ...e, confirmed: true }));
  } catch {
    return [];
  }
}

function update(next: OutboxEntry[]): void {
  entries = next;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  listeners.forEach((listener) => listener());
}

/** Saves a solve the moment the timer stops (not sent yet). */
export function addSolve(entry: Omit<OutboxEntry, "confirmed" | "createdAt">): void {
  const key = solveKey(entry);
  if (entries.some((e) => solveKey(e) === key)) return;
  update([...entries, { ...entry, confirmed: false, createdAt: Date.now() }]);
}

/** The player picked a penalty (or 5 s passed): send it. */
export function confirmSolve(key: string, penalty: Penalty): void {
  update(entries.map((e) => (solveKey(e) === key ? { ...e, penalty, confirmed: true } : e)));
  const entry = entries.find((e) => solveKey(e) === key);
  if (entry) void flushOutbox(entry.roomCode);
}

/** Forget everything for a room we can't be in anymore (closed, kicked). */
export function clearRoom(roomCode: string): void {
  update(entries.filter((e) => e.roomCode !== roomCode));
}

export function outboxSize(): number {
  return entries.length;
}

/** The outbox as React state: re-renders when it changes. */
export function useOutbox(): OutboxEntry[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => entries,
  );
}

// ---- Sending ----

let sending = false;
let sendAgain = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Sends every confirmed solve for this room, one by one. Safe to call any
 * time and as often as you like (e.g. after joining, after confirming).
 */
export async function flushOutbox(roomCode: string): Promise<void> {
  if (sending) {
    sendAgain = true; // something new came in while sending: go round once more
    return;
  }
  sending = true;
  try {
    do {
      sendAgain = false;
      for (const entry of entries.filter((e) => e.roomCode === roomCode && e.confirmed)) {
        const response = await request(ClientEvents.SUBMIT_SOLVE, {
          matchId: entry.matchId,
          setIndex: entry.setIndex,
          solveIndex: entry.solveIndex,
          timeMs: entry.timeMs,
          penalty: entry.penalty,
        });
        if (response.ok || response.code === "NOT_CURRENT") {
          const key = solveKey(entry);
          update(entries.filter((e) => solveKey(e) !== key));
        }
      }
    } while (sendAgain);
  } finally {
    sending = false;
  }

  // Anything left (offline, timeout...)? Try again soon.
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  if (entries.some((e) => e.roomCode === roomCode && e.confirmed)) {
    retryTimer = setTimeout(() => void flushOutbox(roomCode), RETRY_MS);
  }
}
