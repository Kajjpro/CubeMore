// "Your session": every time you submit in this browser tab, kept in
// sessionStorage (so it survives a refresh, and starts fresh in a new tab).

import { useEffect, useState } from "react";
import type { RoomSnapshot, SolveResult } from "@cube-racing/shared";
import { sessionStats, type SessionStats } from "./stats";
import { profileKey } from "./storage";

const KEY = profileKey("session");

/** solve id -> result, in the order the solves happened. */
type Recorded = Record<string, SolveResult>;

function load(): Recorded {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "{}") as Recorded;
  } catch {
    return {};
  }
}

export function useSessionStats(room: RoomSnapshot | null, youId: string | null): SessionStats {
  const [recorded, setRecorded] = useState<Recorded>(load);

  useEffect(() => {
    const match = room?.match;
    const row = match && youId ? match.results[youId] : undefined;
    if (!match || !row) return;
    setRecorded((previous) => {
      let next = previous;
      row.forEach((result, solveIndex) => {
        if (!result || result.source !== "submitted") return;
        const key = `${match.matchId}/${match.setIndex}/${solveIndex}`;
        const old = previous[key];
        if (old && old.penalty === result.penalty) return;
        next = next === previous ? { ...previous } : next;
        next[key] = result; // a changed penalty replaces the old entry, keeping its place
      });
      if (next !== previous) {
        try {
          sessionStorage.setItem(KEY, JSON.stringify(next));
        } catch {
          // Storage blocked: stats just won't survive a refresh.
        }
      }
      return next;
    });
  }, [room, youId]);

  return sessionStats(Object.values(recorded));
}
