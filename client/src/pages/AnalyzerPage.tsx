/*
 * /analyze: THE SOLVE ANALYZER. Solve with a smart cube, see every stage.
 *
 *   Practice      connect the cube, pick Single or Average of 5, solve the
 *                 scrambles; each solve is analyzed right away (analyzer/)
 *   Your sessions signed-in players' kept sessions, with the coach summary
 *   Top solves    the fastest verified smart cube solves on CubeMore, analyzed
 *
 * Loaded only when someone opens the page (it brings the analyzer and the 3D cube).
 */

import { useEffect, useMemo, useState } from "react";
import { ClientEvents, PRACTICE_SIZE, formatTime, type PracticeKind, type PracticeSession, type PracticeSessionInfo, type TopSolve } from "@cube-racing/shared";
import { summarizeSession, type SolveAnalysis } from "@cube-racing/shared/analysis";
import { warmAnalyzer } from "../analyzer/analyze";
import { usePractice, type LocalSolve } from "../analyzer/usePractice";
import { useAccount, AUTH_ENABLED } from "../auth";
import { GuestHint } from "../components/Account";
import { ConfirmButton } from "../components/ConfirmButton";
import { ScrambleBlock } from "../components/Scramble";
import { SiteFooter, SiteHeader } from "../components/Site";
import { SmartCubeControls } from "../components/SmartCube";
import { InspectionDigits, LiveTurns, RunningDigits } from "../components/Timer";
import { CoachCard, SessionReport, SolveReport } from "../components/analyzer/Report";
import { Segmented } from "../components/ui";
import { setPref, usePrefs } from "../prefs";
import { keyboardCubeAllowed, useSmartCube } from "../smartCube";
import { request, socket } from "../socket";
import { useSmartSolve } from "../timer/useSmartSolve";

type Tab = "practice" | "sessions" | "top";

/** What the server says about keeping solves and the coach (from PRACTICE_LIST). */
interface Abilities {
  coach: boolean;
  kept: boolean;
}

export function AnalyzerPage() {
  const account = useAccount();
  const [tab, setTab] = useState<Tab>("practice");
  const [abilities, setAbilities] = useState<Abilities>({ coach: false, kept: false });
  const [sessions, setSessions] = useState<PracticeSessionInfo[] | null>(null);

  // The search tables are built while the player connects their cube.
  useEffect(() => warmAnalyzer(), []);

  // Development only (?simcube=1): __cubemoreDev.solve() scrambles and solves the keyboard cube.
  useEffect(() => {
    if (!import.meta.env.DEV || !keyboardCubeAllowed) return;
    void import("../dev/simSolve").then(({ cfopSolution }) => {
      const turn = (window as unknown as { __cubemoreTurn: (moves: string[], gapMs: number) => Promise<void> }).__cubemoreTurn;
      (window as unknown as { __cubemoreDev: object }).__cubemoreDev = {
        solve: async (pauseMs = 700) => {
          const scramble = document.querySelector(".scramble-text")?.getAttribute("aria-label")?.replace("Scramble: ", "") ?? "";
          await turn(scramble.split(" "), 15);
          await new Promise((resolve) => setTimeout(resolve, 400));
          for (const stage of cfopSolution(scramble)) {
            await turn(stage, 180);
            await new Promise((resolve) => setTimeout(resolve, pauseMs));
          }
        },
      };
    });
  }, []);

  useEffect(() => {
    if (!account.loaded) return;
    const load = () =>
      void request(ClientEvents.PRACTICE_LIST, {}).then((r) => {
        if (!r.ok) return;
        setAbilities({ coach: r.coach, kept: r.kept });
        setSessions(r.sessions);
      });
    socket.on("connect", load);
    if (socket.connected) load();
    return () => void socket.off("connect", load);
  }, [account.loaded, account.signedIn, tab]);

  return (
    <div className="home analyzer-page">
      <SiteHeader />
      <main className="analyzer">
        <div className="analyzer-title">
          <h1>Solve analyzer</h1>
          <p className="muted">Solve with your smart cube. See every stage timed, and what to practice next.</p>
        </div>

        <div className="analyzer-tabs" role="tablist" aria-label="Analyzer">
          <TabButton tab="practice" current={tab} onSelect={setTab}>
            Practice
          </TabButton>
          {account.signedIn && (
            <TabButton tab="sessions" current={tab} onSelect={setTab}>
              Your sessions
            </TabButton>
          )}
          <TabButton tab="top" current={tab} onSelect={setTab}>
            Top solves
          </TabButton>
        </div>

        {tab === "practice" && <Practice signedIn={account.signedIn} loaded={account.loaded} abilities={abilities} />}
        {tab === "sessions" && account.signedIn && <Sessions sessions={sessions} abilities={abilities} onDeleted={(id) => setSessions((list) => list?.filter((s) => s.id !== id) ?? null)} />}
        {tab === "top" && <TopSolves />}
      </main>
      <SiteFooter />
    </div>
  );
}

function TabButton({ tab, current, onSelect, children }: { tab: Tab; current: Tab; onSelect: (tab: Tab) => void; children: string }) {
  return (
    <button type="button" role="tab" aria-selected={tab === current} className="analyzer-tab" onClick={() => onSelect(tab)}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Practice

function Practice({ signedIn, loaded, abilities }: { signedIn: boolean; loaded: boolean; abilities: Abilities }) {
  const cube = useSmartCube();
  const { state, complete, onSolved, restart } = usePractice(signedIn);
  const [selected, setSelected] = useState<number | null>(null);
  const size = PRACTICE_SIZE[state.kind];
  const latest = state.solves[state.solves.length - 1] ?? null;
  // The solve shown in full: the one picked, else the newest.
  const shown = selected !== null ? state.solves[selected] : state.kind === "single" ? latest : complete ? null : latest;
  const canSolve = cube.status === "on" && !complete;

  const summary = useMemo(() => {
    if (state.kind !== "ao5" || !complete) return null;
    const analyses = state.solves.map((s) => s.analysis);
    return analyses.every(Boolean) ? summarizeSession(analyses as SolveAnalysis[]) : null;
  }, [state.kind, complete, state.solves]);

  const start = (kind: PracticeKind) => {
    setSelected(null);
    restart(kind);
  };

  return (
    <div className="practice">
      <section className="panel practice-setup" aria-label="Your cube and the session">
        <div className="practice-cube">
          <h2 className="small-title">Your smart cube</h2>
          <SmartCubeControls />
        </div>
        <div className="practice-mode">
          <Segmented<PracticeKind>
            label="Session"
            value={state.kind}
            options={[
              { value: "single", label: "Single" },
              { value: "ao5", label: "Average of 5" },
            ]}
            onChange={(kind) => kind !== state.kind && start(kind)}
          />
          {state.kind === "ao5" && <SessionStrip solves={state.solves} size={size} selected={selected} onSelect={setSelected} />}
        </div>
      </section>

      {canSolve && (
        <SolveArea
          scramble={state.scramble?.text ?? null}
          error={state.scrambleError}
          number={state.solves.length + 1}
          size={size}
          onSolved={(timeMs, smart) => {
            setSelected(null);
            onSolved(timeMs, smart);
          }}
        />
      )}
      {!canSolve && !complete && <p className="practice-wait small muted">Connect your cube to get a scramble.</p>}

      {loaded && !signedIn && state.solves.length > 0 && (
        <div className="practice-guest">
          <p className="small">Your solves are analyzed here but not kept. {AUTH_ENABLED ? "Sign in to keep them and see your history." : ""}</p>
          <GuestHint />
        </div>
      )}

      {complete && (
        <div className="practice-again">
          <button type="button" className="primary" onClick={() => start(state.kind)}>
            {state.kind === "single" ? "Next solve" : "Another average of 5"}
          </button>
        </div>
      )}

      {summary && (
        <SessionReport summary={summary} times={state.solves.map((s) => s.timeMs)} selected={selected} onOpen={(i) => setSelected(selected === i ? null : i)} />
      )}
      {complete && state.kind === "ao5" && !summary && <p className="small muted">Analyzing…</p>}

      {shown && <LocalReport solve={shown} title={state.kind === "ao5" ? `Solve ${state.solves.indexOf(shown) + 1} of ${size}` : undefined} />}

      {complete && (
        <LiveCoach sessionId={state.sessionId} solves={state.solves} signedIn={signedIn} abilities={abilities} key={state.sessionId} />
      )}
    </div>
  );
}

/** 1/5 ... 5/5 with the times so far. */
function SessionStrip({ solves, size, selected, onSelect }: { solves: LocalSolve[]; size: number; selected: number | null; onSelect: (i: number | null) => void }) {
  return (
    <ol className="session-strip" aria-label="Solves in this average">
      {Array.from({ length: size }, (_, i) => {
        const solve = solves[i];
        return (
          <li key={i}>
            {solve ? (
              <button type="button" className="session-slot" aria-pressed={selected === i} onClick={() => onSelect(selected === i ? null : i)}>
                <span className="tiny muted">{i + 1}</span>
                <span className="mono">{formatTime(solve.timeMs)}</span>
              </button>
            ) : (
              <span className="session-slot empty" data-next={i === solves.length}>
                <span className="tiny muted">{i + 1}</span>
                <span className="mono muted">–</span>
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** The scramble and the smart cube timer. */
function SolveArea(props: { scramble: string | null; error: string | null; number: number; size: number; onSolved: (timeMs: number, smart: { moves: string[]; times: number[] }) => void }) {
  const prefs = usePrefs();
  const [running, setRunning] = useState(false);
  const view = useSmartSolve({
    active: props.scramble !== null,
    scramble: props.scramble ?? "",
    onStart: () => setRunning(true),
    onStop: (timeMs, smart) => {
      setRunning(false);
      props.onSolved(timeMs, smart);
    },
    broadcast: false,
  });

  if (props.error) return <p className="banner banner-error">{props.error}</p>;
  if (!props.scramble) return <p className="practice-wait small muted">Getting a scramble…</p>;

  return (
    <section className="practice-solve" data-running={running} aria-label={props.size > 1 ? `Solve ${props.number} of ${props.size}` : "Your solve"}>
      <ScrambleBlock
        scramble={{ cubeEvent: "333", text: props.scramble }}
        preview={prefs.preview}
        onTogglePreview={() => setPref("preview", prefs.preview === "3d" ? "2d" : "3d")}
        round={props.size > 1 ? <span className="tiny muted mono">{`${props.number}/${props.size}`}</span> : undefined}
      />
      <div className="practice-timer">
        {view?.phase === "inspecting" && view.inspectionEndsAt !== null ? (
          <InspectionDigits endsAt={view.inspectionEndsAt} />
        ) : view?.phase === "running" && view.startedAt !== null ? (
          <RunningDigits startedAt={view.startedAt} display="full" />
        ) : (
          <div className="timer-digits mono">0.00</div>
        )}
        {view?.phase === "running" && <LiveTurns view={view} />}
        <p className="timer-hint">{hint(view?.phase ?? null, view?.guide.kind ?? null)}</p>
      </div>
    </section>
  );
}

function hint(phase: string | null, guide: string | null): string {
  if (phase === "inspecting") return "Inspection: your first turn starts the timer";
  if (phase === "running") return "";
  if (guide === "solve-first") return "Solve your cube first, then follow the scramble";
  if (guide === "lost") return "Lost track of your cube: solve it, then follow the scramble";
  if (guide === "off-track") return "Wrong move: undo it as shown on the scramble";
  return "Follow the scramble on your cube";
}

/** A solve of this session: its analysis, or why there isn't one yet. */
function LocalReport({ solve, title }: { solve: LocalSolve; title?: string }) {
  if (solve.analysisError) {
    return (
      <p className="banner banner-error">
        This solve couldn't be analyzed: {solve.analysisError} The analyzer reads CFOP solves (cross, F2L, OLL, PLL).
      </p>
    );
  }
  if (!solve.analysis) return <p className="small muted practice-wait">Analyzing your solve…</p>;
  const status =
    solve.save === "saved" ? (
      <p className="tiny muted">Kept in your sessions.</p>
    ) : solve.save === "saving" ? (
      <p className="tiny muted">Keeping…</p>
    ) : solve.save === "error" ? (
      <p className="tiny error-text">{solve.saveError}</p>
    ) : null;
  return <SolveReport scramble={solve.scramble} moves={solve.moves} times={solve.times} analysis={solve.analysis} title={title} status={status} />;
}

/** The coach for the session that was just finished (once every solve is kept). */
function LiveCoach({ sessionId, solves, signedIn, abilities }: { sessionId: string; solves: LocalSolve[]; signedIn: boolean; abilities: Abilities }) {
  const allKept = solves.every((s) => s.save === "saved");
  const reason = !signedIn ? "Sign in to get a coach summary." : !allKept ? "Waiting for your solves to be kept…" : null;
  return <Coach sessionId={sessionId} initial={null} available={abilities.coach} canAsk={signedIn && allKept} reason={reason} />;
}

function Coach({ sessionId, initial, available, canAsk, reason }: { sessionId: string; initial: string | null; available: boolean; canAsk: boolean; reason: string | null }) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ask = async () => {
    setBusy(true);
    setError(null);
    // The AI can take a few seconds: wait longer than for other requests.
    const r = await requestSlow(sessionId);
    setBusy(false);
    if (r.ok) setText(r.text);
    else setError(r.error);
  };
  return <CoachCard text={text} available={available} canAsk={canAsk} reason={reason} busy={busy} error={error} onAsk={() => void ask()} />;
}

/** PRACTICE_COACH with a longer wait than request()'s 5 s (the AI takes a few seconds). */
function requestSlow(sessionId: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    if (!socket.connected) return resolve({ ok: false, error: "Not connected to the server. Please try again in a moment." });
    (socket as unknown as import("socket.io-client").Socket)
      .timeout(30_000)
      .emit(ClientEvents.PRACTICE_COACH, { sessionId }, (error: Error | null, response: { ok: true; text: string } | { ok: false; error: string }) =>
        resolve(error ? { ok: false, error: "The coach took too long. Please try again." } : response),
      );
  });
}

// ---------------------------------------------------------------------------
// Your sessions

function Sessions({ sessions, abilities, onDeleted }: { sessions: PracticeSessionInfo[] | null; abilities: Abilities; onDeleted: (id: string) => void }) {
  const [open, setOpen] = useState<PracticeSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openSession = async (id: string) => {
    setError(null);
    const r = await request(ClientEvents.PRACTICE_SESSION, { sessionId: id });
    if (r.ok) setOpen(r.session);
    else setError(r.error);
  };

  const remove = async (id: string) => {
    const r = await request(ClientEvents.PRACTICE_DELETE, { sessionId: id });
    if (!r.ok) return setError(r.error);
    onDeleted(id);
    if (open?.id === id) setOpen(null);
  };

  if (open) return <SavedSession session={open} abilities={abilities} onBack={() => setOpen(null)} onDelete={() => void remove(open.id)} />;

  return (
    <section className="panel sessions" aria-label="Your sessions">
      {!abilities.kept && <p className="tiny muted">This server keeps sessions only until it restarts.</p>}
      {error && <p className="error-text small">{error}</p>}
      {sessions === null ? (
        <p className="small muted">Loading…</p>
      ) : sessions.length === 0 ? (
        <p className="small muted">No sessions yet. Your analyzed solves will show up here.</p>
      ) : (
        <ul className="session-list">
          {sessions.map((s) => (
            <li key={s.id}>
              <button type="button" className="session-row" onClick={() => void openSession(s.id)}>
                <span className="session-when">{new Date(s.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>
                <span className="session-kind tiny muted">{s.kind === "single" ? "Single" : `Average of 5${s.times.length < 5 ? `, ${s.times.length} of 5` : ""}`}</span>
                <span className="session-result mono">{s.resultMs !== null ? formatTime(s.resultMs) : "–"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SavedSession({ session, abilities, onBack, onDelete }: { session: PracticeSession; abilities: Abilities; onBack: () => void; onDelete: () => void }) {
  const [selected, setSelected] = useState<number | null>(session.kind === "single" ? 0 : null);
  const shown = selected !== null ? session.solves[selected] : null;
  return (
    <div className="practice">
      <div className="saved-head">
        <button type="button" onClick={onBack}>
          Back to your sessions
        </button>
        <span className="small muted">{new Date(session.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>
        <span className="grow" />
        <ConfirmButton label="Delete" confirmLabel="Tap again to delete" className="link-button danger" onConfirm={onDelete} />
      </div>
      {session.summary && session.solves.length >= 5 && (
        <SessionReport summary={session.summary} times={session.solves.map((s) => s.timeMs)} selected={selected} onOpen={(i) => setSelected(selected === i ? null : i)} />
      )}
      {session.kind === "ao5" && session.solves.length < 5 && (
        <p className="small muted">This average has {session.solves.length} of 5 solves.</p>
      )}
      {session.kind === "ao5" && (
        <div className="saved-solves">
          {session.solves.map((s, i) => (
            <button key={s.id} type="button" className="session-slot" aria-pressed={selected === i} onClick={() => setSelected(selected === i ? null : i)}>
              <span className="tiny muted">Solve {i + 1}</span>
              <span className="mono">{formatTime(s.timeMs)}</span>
            </button>
          ))}
        </div>
      )}
      {shown && (
        <SolveReport
          scramble={shown.scramble}
          moves={shown.moves}
          times={shown.times}
          analysis={shown.analysis}
          title={session.kind === "ao5" ? `Solve ${shown.index + 1} of 5` : undefined}
        />
      )}
      <Coach sessionId={session.id} initial={session.coach} available={abilities.coach} canAsk reason={null} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top solves on CubeMore

function TopSolves() {
  const [solves, setSolves] = useState<TopSolve[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    const load = () => void request(ClientEvents.PRACTICE_TOP, {}).then((r) => (r.ok ? setSolves(r.solves) : setError(r.error)));
    socket.on("connect", load);
    if (socket.connected) load();
    return () => void socket.off("connect", load);
  }, []);

  if (error) return <p className="banner banner-error">{error}</p>;
  if (solves === null) return <p className="small muted">Loading…</p>;
  if (solves.length === 0) {
    return (
      <section className="panel sessions">
        <p className="small muted">No verified smart cube solves yet. They come from smart cube races and the weekly race.</p>
      </section>
    );
  }
  const shown = open !== null ? solves[open] : null;
  return (
    <div className="practice">
      <section className="panel sessions" aria-label="The fastest verified smart cube solves">
        <p className="small muted">The fastest verified smart cube solves on CubeMore. Open one to see how it was done.</p>
        <ol className="session-list">
          {solves.map((s, i) => (
            <li key={i}>
              <button type="button" className="session-row" aria-pressed={open === i} onClick={() => setOpen(open === i ? null : i)}>
                <span className="session-when">{s.name}</span>
                <span className="session-kind tiny muted">
                  {s.analysis.moves} moves, {s.analysis.tps.toFixed(1)} TPS
                </span>
                <span className="session-result mono">{formatTime(s.timeMs)}</span>
              </button>
            </li>
          ))}
        </ol>
      </section>
      {shown && <SolveReport scramble={shown.scramble} moves={shown.moves} times={shown.times} analysis={shown.analysis} title={shown.name} />}
    </div>
  );
}
