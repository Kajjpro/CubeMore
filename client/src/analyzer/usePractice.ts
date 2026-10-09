/*
 * ONE ANALYZER SESSION: a single, or an ao5.
 *
 *   1. The server gives a scramble (it remembers it, so the solve can be kept).
 *   2. The smart cube solve ends: it's analyzed in the background right away.
 *   3. Signed in: the server checks it, analyzes it again and keeps it.
 *   4. Next scramble, until the session has its solves.
 *
 * Guests get the same analysis; their solves just aren't kept.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ClientEvents, PRACTICE_SIZE, type PracticeKind } from "@cube-racing/shared";
import type { SolveAnalysis } from "@cube-racing/shared/analysis";
import type { SmartSolveData } from "@cube-racing/shared/smartSolve";
import { request, socket } from "../socket";
import { analyzeInBackground } from "./analyze";

export type SaveState = "guest" | "saving" | "saved" | "error";

export interface LocalSolve {
  key: string;
  scramble: string;
  timeMs: number;
  moves: string[];
  times: number[];
  analysis: SolveAnalysis | null;
  analysisError: string | null;
  save: SaveState;
  saveError: string | null;
}

export interface PracticeState {
  kind: PracticeKind;
  sessionId: string;
  solves: LocalSolve[];
  /** The scramble to solve now (null while loading or when the session is complete). */
  scramble: { id: string; text: string } | null;
  scrambleError: string | null;
}

const newState = (kind: PracticeKind): PracticeState => ({ kind, sessionId: crypto.randomUUID(), solves: [], scramble: null, scrambleError: null });

export function usePractice(signedIn: boolean) {
  const [state, setState] = useState<PracticeState>(() => newState("single"));
  const latest = useRef(state);
  latest.current = state;
  const complete = state.solves.length >= PRACTICE_SIZE[state.kind];

  const update = useCallback((sessionId: string, key: string, change: Partial<LocalSolve>) => {
    setState((s) => (s.sessionId !== sessionId ? s : { ...s, solves: s.solves.map((solve) => (solve.key === key ? { ...solve, ...change } : solve)) }));
  }, []);

  // A scramble whenever the session needs one (and again after a reconnect: the server forgot the old one).
  const needScramble = !complete && state.scramble === null;
  useEffect(() => {
    if (!needScramble) return;
    const sessionId = state.sessionId;
    let cancelled = false;
    const load = () =>
      void request(ClientEvents.PRACTICE_SCRAMBLE, {}).then((r) => {
        if (cancelled) return;
        setState((s) =>
          s.sessionId !== sessionId ? s : r.ok ? { ...s, scramble: { id: r.scrambleId, text: r.scramble }, scrambleError: null } : { ...s, scrambleError: r.error },
        );
      });
    socket.on("connect", load);
    if (socket.connected) load();
    return () => {
      cancelled = true;
      socket.off("connect", load);
    };
  }, [needScramble, state.sessionId]);

  /** The smart cube solve ended. */
  const onSolved = useCallback(
    (timeMs: number, smart: SmartSolveData) => {
      const current = latest.current;
      if (!current.scramble) return;
      const { sessionId, kind } = current;
      const scramble = current.scramble;
      const index = current.solves.length;
      const solve: LocalSolve = {
        key: crypto.randomUUID(),
        scramble: scramble.text,
        timeMs,
        moves: smart.moves,
        times: smart.times,
        analysis: null,
        analysisError: null,
        save: signedIn ? "saving" : "guest",
        saveError: null,
      };
      setState((s) => (s.sessionId !== sessionId ? s : { ...s, solves: [...s.solves, solve], scramble: null }));

      analyzeInBackground(scramble.text, smart.moves, smart.times).then(
        (analysis) => update(sessionId, solve.key, { analysis }),
        (error: Error) => update(sessionId, solve.key, { analysisError: error.message }),
      );
      if (signedIn) {
        void request(ClientEvents.PRACTICE_SAVE, { scrambleId: scramble.id, sessionId, kind, index, timeMs, moves: smart.moves, times: smart.times }).then((r) =>
          update(sessionId, solve.key, r.ok ? { save: "saved" } : { save: "error", saveError: r.error }),
        );
      }
    },
    [signedIn, update],
  );

  /** Start again, with this kind of session. */
  const restart = useCallback((kind: PracticeKind) => setState(newState(kind)), []);

  return { state, complete, onSolved, restart };
}
