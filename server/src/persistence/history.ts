/*
 * MATCH HISTORY EVENTS (pure).
 *
 * Every time a room changes, `historyEvents(before, next)` compares the two and
 * says what is worth keeping forever:
 *   match_started  a new match began
 *   set_started    a set began (who is in it, with their nicknames)
 *   set_finished   a set ended: every solve, with its scramble
 *   match_ended    the match is over (winners, points), or was abandoned
 *                  (the host restarted it or went back to the lobby mid-match)
 *
 * The store writes them in order. Players are kept by their PUBLIC id only.
 */

import type { RoomSettings } from "@cube-racing/shared";
import type { SmartSolveData } from "@cube-racing/shared/smartSolve";
import type { FinishedSet, Match } from "../match/types";
import type { ServerRoom } from "../rooms/types";

export type HistoryEvent =
  | { kind: "match_started"; matchId: string; roomCode: string; settings: RoomSettings; weeklyId: string | null; at: number }
  | { kind: "set_started"; matchId: string; setIndex: number; players: { publicId: string; nickname: string }[] }
  | {
      kind: "set_finished";
      matchId: string;
      cubeEvent: string;
      set: FinishedSet;
      scrambles: string[];
      /** Verified smart cube solves of the set, by "publicId/solveIndex". */
      replays: Record<string, SmartSolveData>;
      at: number;
    }
  | {
      kind: "match_ended";
      matchId: string;
      status: "finished" | "abandoned";
      winnerIds: string[];
      points: Record<string, number>;
      at: number;
    };

export function historyEvents(before: ServerRoom, next: ServerRoom, now: number): HistoryEvent[] {
  const old = before.match;
  const current = next.match;
  const events: HistoryEvent[] = [];
  const sameMatch = old !== null && current !== null && old.matchId === current.matchId;

  // The old match is gone before it was over: the host restarted it or went back to the lobby.
  if (old && !sameMatch && old.phase !== "match_over") {
    events.push(matchEnded(old, "abandoned", now));
  }
  if (!current) return events;

  if (!sameMatch) {
    events.push({
      kind: "match_started",
      matchId: current.matchId,
      roomCode: next.code,
      settings: current.settings,
      weeklyId: next.scheduled?.weeklyId ?? null,
      at: now,
    });
  }
  if (!sameMatch || old.setIndex !== current.setIndex) {
    const nicknames = new Map(next.players.map((p) => [p.publicId, p.nickname]));
    events.push({
      kind: "set_started",
      matchId: current.matchId,
      setIndex: current.setIndex,
      players: current.roster.map((publicId) => ({ publicId, nickname: nicknames.get(publicId) ?? publicId })),
    });
  }

  const alreadyFinished = sameMatch ? old.finishedSets.length : 0;
  for (const set of current.finishedSets.slice(alreadyFinished)) {
    // The scrambles and replays stay on the match until the next set starts.
    const thisSet = set.setIndex === current.setIndex;
    const scrambles = thisSet ? current.scrambles.map((s) => s.text) : [];
    const replays = thisSet ? current.replays : {};
    events.push({ kind: "set_finished", matchId: current.matchId, cubeEvent: current.settings.cubeEvent, set, scrambles, replays, at: now });
  }

  if (current.phase === "match_over" && !(sameMatch && old.phase === "match_over")) {
    events.push(matchEnded(current, "finished", now));
  }
  return events;
}

function matchEnded(match: Match, status: "finished" | "abandoned", at: number): HistoryEvent {
  return { kind: "match_ended", matchId: match.matchId, status, winnerIds: match.winnerIds, points: match.points, at };
}
