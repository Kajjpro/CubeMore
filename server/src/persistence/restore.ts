/*
 * RESTORING A ROOM after a restart (pure).
 *
 * The saved room is from just before the server stopped. Since then:
 *   - every connection is gone, so every player is "reconnecting" and gets the
 *     usual 30 seconds (from now) to come back. Their browsers rejoin by themselves.
 *   - time passed while the server was down. That time shouldn't count against
 *     anyone, so the deadlines (time limit, review screen, set result, lobby
 *     countdown, empty room) move forward by the downtime.
 *   - browsers may have seen versions a little newer than the saved one (it's
 *     saved every ~0.5 s, and a crash loses the last bit). They ignore snapshots
 *     older than what they've seen, so the version jumps far ahead.
 */

import { DEFAULT_SETTINGS } from "@cube-racing/shared";
import type { ServerRoom } from "../rooms/types";

/** Far more changes than a room could make between two saves. */
export const RESTORE_VERSION_JUMP = 100_000;

export function restoreRoom(room: ServerRoom, savedAt: number, now: number): ServerRoom {
  const downtime = Math.max(0, now - savedAt);
  const later = (time: number | null) => (time === null ? null : time + downtime);

  return {
    ...room,
    // Fields added in later versions of the server get their defaults.
    settings: { ...DEFAULT_SETTINGS, ...room.settings },
    scheduled: room.scheduled ?? null,
    version: room.version + RESTORE_VERSION_JUMP,
    players: room.players.map((player) => ({
      ...player,
      status: "reconnecting",
      disconnectedAt: now,
      timerStatus: "idle",
      solvingSince: null,
    })),
    emptySince: later(room.emptySince),
    autoStartAt: later(room.autoStartAt),
    match: room.match && {
      ...room.match,
      settings: { ...DEFAULT_SETTINGS, ...room.match.settings },
      replays: room.match.replays ?? {},
      phaseEndsAt: later(room.match.phaseEndsAt),
      solveDeadline: later(room.match.solveDeadline),
    },
  };
}
