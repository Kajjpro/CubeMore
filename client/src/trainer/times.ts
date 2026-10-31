/*
 * YOUR OLL AND PLL TIMES for the case trainer.
 *
 *   Guests      kept in this browser (localStorage): drills, and the cases of
 *               solves analyzed in the solve analyzer.
 *   Signed in   kept with the account: the server reads them from your kept
 *               analyzer solves and your drills. Times a guest made in this
 *               browser are sent once, on sign-in, then forgotten here.
 */

import { useCallback, useEffect, useState } from "react";
import { ClientEvents, TRAINER_SAVE_MAX, type CaseTime } from "@cube-racing/shared";
import { profileKey } from "../storage";
import { request, socket } from "../socket";

const KEY = profileKey("case-times");
/** The browser keeps at most this many (the newest). */
const LOCAL_MAX = 3000;

export function localTimes(): CaseTime[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(list) ? (list as CaseTime[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(times: CaseTime[]): void {
  try {
    if (times.length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(times.slice(-LOCAL_MAX)));
  } catch {
    // Storage full or blocked: the times of this visit still show.
  }
}

/** Adds times to this browser's list. */
export function addLocalTimes(times: CaseTime[]): void {
  if (times.length > 0) writeLocal([...localTimes(), ...times]);
}

/** Sends this browser's times to the account, in chunks; forgets each chunk once it's kept. */
async function sendLocalTimes(): Promise<boolean> {
  let left = localTimes();
  while (left.length > 0) {
    const chunk = left.slice(0, TRAINER_SAVE_MAX);
    const r = await request(ClientEvents.TRAINER_SAVE, { times: chunk });
    if (!r.ok) return false;
    left = left.slice(chunk.length);
    writeLocal(left);
  }
  return true;
}

export interface CaseTimes {
  /** Null while loading. */
  times: CaseTime[] | null;
  /** Where they're kept, in a few words for the page. */
  keptIn: "browser" | "account" | "server-memory";
  add: (times: CaseTime[]) => void;
}

export function useCaseTimes(signedIn: boolean, accountLoaded: boolean): CaseTimes {
  const [times, setTimes] = useState<CaseTime[] | null>(null);
  const [kept, setKept] = useState(true);

  useEffect(() => {
    if (!accountLoaded) return;
    if (!signedIn) {
      setTimes(localTimes());
      return;
    }
    let cancelled = false;
    const load = async () => {
      await sendLocalTimes();
      const r = await request(ClientEvents.TRAINER_TIMES, {});
      if (cancelled) return;
      if (r.ok) {
        setTimes([...r.times, ...localTimes()]);
        setKept(r.kept);
      } else {
        setTimes((current) => current ?? localTimes());
      }
    };
    const onConnect = () => void load();
    socket.on("connect", onConnect);
    if (socket.connected) void load();
    return () => {
      cancelled = true;
      socket.off("connect", onConnect);
    };
  }, [signedIn, accountLoaded]);

  const add = useCallback(
    (added: CaseTime[]) => {
      if (added.length === 0) return;
      setTimes((current) => [...(current ?? []), ...added]);
      if (!signedIn) return addLocalTimes(added);
      // Not kept (offline, a hiccup): keep them here, they're sent with the next load.
      void request(ClientEvents.TRAINER_SAVE, { times: added }).then((r) => {
        if (!r.ok) addLocalTimes(added);
      });
    },
    [signedIn],
  );

  return { times, keptIn: !signedIn ? "browser" : kept ? "account" : "server-memory", add };
}
