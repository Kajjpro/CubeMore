/*
 * /train: THE OLL AND PLL TRAINER.
 *
 *   Your cases  every case with your time, from analyzer solves and drills;
 *               the ones that cost you the most on top (shared/analysis/trainer.ts)
 *   Drill       a scramble that lands on a case, timed. With a smart cube the
 *               recognition is timed apart and the end is seen on the cube;
 *               otherwise the spacebar / touch, or a Stackmat or GAN timer.
 *               Slow and missed cases come back more often.
 *
 * Loaded only when someone opens the page.
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClientEvents, type CaseTime, type TrainerStep } from "@cube-racing/shared";
import { TRAINER_FAQ } from "@cube-racing/shared/content/sitePages";
import { caseDiagram } from "@cube-racing/shared/content/algorithmPages";
import { allCases, caseById, type CaseInfo } from "@cube-racing/shared/analysis/caseInfo";
import { caseReport, pickNextCase, stepOf, totalMs, type CaseRow } from "@cube-racing/shared/analysis/trainer";
import { COLOR_NAMES } from "@cube-racing/shared/analysis";
import { FACES, type Face } from "@cube-racing/shared/cube3";
import { useAccount, AUTH_ENABLED } from "../auth";
import { useBtTimer } from "../btTimer";
import { GuestHint } from "../components/Account";
import { CompetitionTimerControls } from "../components/CompetitionTimer";
import { ScrambleBlock } from "../components/Scramble";
import { Link, SiteFooter, SiteHeader } from "../components/Site";
import { SmartCubeControls } from "../components/SmartCube";
import { RunningDigits } from "../components/Timer";
import { Segmented } from "../components/ui";
import { setPref, usePrefs } from "../prefs";
import { navigate } from "../router";
import { useSmartCube } from "../smartCube";
import { request, socket } from "../socket";
import { useBtTimerSolve } from "../timer/useBtTimerSolve";
import { useSpeedTimer } from "../timer/useSpeedTimer";
import { useCaseTimes } from "../trainer/times";
import { useDrillFlow } from "../trainer/useDrillFlow";

const STEP_NAME: Record<TrainerStep, string> = { oll: "OLL", pll: "PLL" };
const seconds = (ms: number) => (ms / 1000).toFixed(2);
const capital = (text: string) => text[0].toUpperCase() + text.slice(1);

/** "OLL 27 (Sune)", "T perm". */
const caseTitle = (c: CaseInfo) => (c.step === "oll" ? `${c.id} (${c.name})` : c.name);

// ---- The cross colour (the drills' scrambles are made for it) ----

const CROSS_KEY = "cube-racing:trainer-cross";

function useCross(): [Face, (face: Face) => void] {
  const [cross, setCross] = useState<Face>(() => {
    const saved = localStorage.getItem(CROSS_KEY);
    return FACES.includes(saved as Face) ? (saved as Face) : "U";
  });
  const set = useCallback((face: Face) => {
    localStorage.setItem(CROSS_KEY, face);
    setCross(face);
  }, []);
  return [cross, set];
}

function CrossSelect({ cross, onChange }: { cross: Face; onChange: (face: Face) => void }) {
  return (
    <label className="cross-select small">
      <span className="muted">Cross</span>
      <select value={cross} onChange={(event) => onChange(event.target.value as Face)}>
        {FACES.map((face) => (
          <option key={face} value={face}>
            {capital(COLOR_NAMES[face])}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Cases asked for in the address (?case=PLL%20T,PLL%20Gb), for "Drill this case" links. */
function casesFromUrl(): string[] | null {
  const list = new URLSearchParams(window.location.search).get("case");
  const ids = (list ?? "").split(",").filter((id) => caseById(id));
  return ids.length ? ids : null;
}

function Diagram({ info, size }: { info: CaseInfo; size: number }) {
  return <span className="case-pic" aria-hidden dangerouslySetInnerHTML={{ __html: caseDiagram(info, size) }} />;
}

export function TrainerPage() {
  const account = useAccount();
  const data = useCaseTimes(account.signedIn, account.loaded);
  const [cross, setCross] = useCross();
  const [drill, setDrill] = useState<string[] | null>(casesFromUrl);

  const start = (cases: string[]) => {
    setDrill(cases);
    window.scrollTo(0, 0);
  };
  const end = () => {
    setDrill(null);
    if (window.location.search) window.history.replaceState(null, "", "/train");
  };

  return (
    <div className="home trainer-page">
      <SiteHeader />
      <main className="analyzer trainer">
        <div className="analyzer-title">
          <h1>OLL and PLL trainer</h1>
          <p className="muted">Find the cases that slow you down, then drill them until they're fast.</p>
        </div>

        {drill ? (
          <Drill cases={drill} times={data.times ?? []} onTimes={data.add} cross={cross} onCross={setCross} onEnd={end} />
        ) : (
          <Overview times={data.times} keptIn={data.keptIn} cross={cross} onCross={setCross} onDrill={start} signedIn={account.signedIn} />
        )}

        <section className="about-block faq analyzer-faq" aria-labelledby="trainer-faq-title">
          <h2 id="trainer-faq-title">Questions</h2>
          <dl>
            {TRAINER_FAQ.map((f) => (
              <Fragment key={f.q}>
                <dt>{f.q}</dt>
                <dd>{f.a}</dd>
              </Fragment>
            ))}
          </dl>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Your cases

function Overview(props: {
  times: CaseTime[] | null;
  keptIn: "browser" | "account" | "server-memory";
  cross: Face;
  onCross: (face: Face) => void;
  onDrill: (cases: string[]) => void;
  signedIn: boolean;
}) {
  const [step, setStep] = useState<TrainerStep>("pll");
  const [picked, setPicked] = useState<string[]>([]);
  const report = useMemo(() => (props.times ? caseReport(props.times, step) : null), [props.times, step]);

  const toggle = (id: string) => setPicked((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  const cases = allCases()[step];
  const groups = [...new Set(cases.map((c) => c.group))];
  const pickGroup = (ids: string[]) => setPicked((list) => [...list.filter((id) => !ids.includes(id)), ...ids]);

  return (
    <div className="practice">
      <div className="trainer-bar">
        <Segmented<TrainerStep>
          label="Cases"
          value={step}
          options={[
            { value: "pll", label: "PLL (21)" },
            { value: "oll", label: "OLL (57)" },
          ]}
          onChange={setStep}
        />
        <CrossSelect cross={props.cross} onChange={props.onCross} />
      </div>

      {report === null ? (
        <p className="small muted">Loading your times…</p>
      ) : (
        <section className="panel trainer-focus" aria-labelledby="focus-title">
          <h2 id="focus-title" className="small-title">
            Train first
          </h2>
          {report.count > 0 && <p className="small">{summaryLine(report.count, report.averageMs, report.rows, step)}</p>}
          {report.focus.length > 0 ? (
            <>
              <ol className="trainer-focus-list">
                {report.focus.map((row) => (
                  <FocusRow key={row.info.id} row={row} averageMs={report.averageMs} />
                ))}
              </ol>
              <div className="trainer-actions">
                <button type="button" className="primary" onClick={() => props.onDrill(report.focus.map((r) => r.info.id))}>
                  Drill these {report.focus.length}
                </button>
              </div>
            </>
          ) : (
            <p className="small muted">
              {report.count === 0 ? "No times yet. " : "Not enough times yet to tell which cases are slow. "}
              Solve with a smart cube in the <Link to="/analyze">solve analyzer</Link>, or drill any cases below: your slowest {STEP_NAME[step]} cases show up here.
            </p>
          )}
          <KeptLine keptIn={props.keptIn} signedIn={props.signedIn} />
        </section>
      )}

      <section className="panel trainer-cases" aria-labelledby="cases-title">
        <div className="trainer-cases-head">
          <h2 id="cases-title" className="small-title">
            All {STEP_NAME[step]} cases
          </h2>
          <span className="tiny muted">Tap cases to drill them</span>
        </div>
        <div className="chip-row">
          <button type="button" className="chip" onClick={() => pickGroup(cases.filter((c) => c.twoLook).map((c) => c.id))} data-dense>
            2-look set
          </button>
          {groups.map((group) => (
            <button key={group} type="button" className="chip" onClick={() => pickGroup(cases.filter((c) => c.group === group).map((c) => c.id))} data-dense>
              {group}
            </button>
          ))}
          <button type="button" className="chip" onClick={() => pickGroup(cases.map((c) => c.id))} data-dense>
            All
          </button>
        </div>
        <ul className="trainer-grid">
          {cases.map((info) => {
            const row = report?.rows.find((r) => r.info.id === info.id);
            const on = picked.includes(info.id);
            return (
              <li key={info.id}>
                <button type="button" className="trainer-case" aria-pressed={on} onClick={() => toggle(info.id)}>
                  <Diagram info={info} size={64} />
                  <span className="trainer-case-name">{info.step === "oll" ? info.short : `${info.short} perm`}</span>
                  <span className="tiny mono">{row?.meanMs != null ? `${seconds(row.meanMs)} s` : "–"}</span>
                  <span className="tiny muted">{row?.twoLook ? "2-look" : row ? capital(row.status) : ""}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {picked.length > 0 && (
        <div className="drill-bar" role="region" aria-label="Your drill">
          <span className="small">
            {picked.length} {picked.length === 1 ? "case" : "cases"}
          </span>
          <button type="button" className="link-button" onClick={() => setPicked([])}>
            Clear
          </button>
          <span className="grow" />
          <button type="button" className="primary" onClick={() => props.onDrill(picked)}>
            Drill {picked.length === 1 ? "it" : "them"}
          </button>
        </div>
      )}
    </div>
  );
}

function summaryLine(count: number, averageMs: number | null, rows: CaseRow[], step: TrainerStep): string {
  const good = rows.filter((r) => r.status === "good").length;
  if (averageMs === null) return "";
  return `Your ${STEP_NAME[step]} average: ${seconds(averageMs)} s, from ${count} ${count === 1 ? "time" : "times"}. Good: ${good} of ${rows.length} cases.`;
}

/** Why a case is on the "train first" list. */
function reason(row: CaseRow, averageMs: number | null): string {
  if (row.twoLook) return "You solve it in two looks: learn its algorithm.";
  if (row.missed > 0) return `Missed ${row.missed === 1 ? "once" : `${row.missed} times`} in your last drills.`;
  if (row.slowerMs !== null && averageMs !== null) return `${seconds(row.slowerMs)} s slower than your average.`;
  return "";
}

function FocusRow({ row, averageMs }: { row: CaseRow; averageMs: number | null }) {
  const parts = [
    row.meanMs !== null ? `${seconds(row.meanMs)} s` : null,
    row.recognitionMs !== null ? `recognition ${seconds(row.recognitionMs)} s` : null,
    `${row.count} ${row.count === 1 ? "time" : "times"}`,
  ].filter(Boolean);
  return (
    <li className="trainer-focus-row">
      <Diagram info={row.info} size={56} />
      <div className="trainer-case-text">
        <a
          href={row.info.path}
          className="trainer-case-title"
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
            event.preventDefault();
            navigate(row.info.path);
          }}
        >
          {caseTitle(row.info)}
        </a>
        <span className="small">{parts.join(", ")}</span>
        <span className="small muted">{reason(row, averageMs)}</span>
      </div>
    </li>
  );
}

function KeptLine({ keptIn, signedIn }: { keptIn: "browser" | "account" | "server-memory"; signedIn: boolean }) {
  if (keptIn === "account") return <p className="tiny muted">Your times are kept with your account.</p>;
  if (keptIn === "server-memory") return <p className="tiny muted">This server keeps times only until it restarts.</p>;
  return (
    <div className="practice-guest">
      <p className="tiny muted">Your times are kept in this browser.{AUTH_ENABLED && !signedIn ? " Sign in to keep them on every device." : ""}</p>
      {AUTH_ENABLED && !signedIn && <GuestHint />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drill

interface Current {
  caseId: string;
  scramble: string;
  /** The answer was shown: this go counts as a miss. */
  revealed: boolean;
}

interface Last {
  time: CaseTime;
  info: CaseInfo;
}

function Drill(props: { cases: string[]; times: CaseTime[]; onTimes: (times: CaseTime[]) => void; cross: Face; onCross: (face: Face) => void; onEnd: () => void }) {
  const prefs = usePrefs();
  const cube = useSmartCube();
  const timer = useBtTimer();
  const [current, setCurrent] = useState<Current | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reps, setReps] = useState<CaseTime[]>([]);
  const [last, setLast] = useState<Last | null>(null);
  const [touchArea, setTouchArea] = useState<HTMLElement | null>(null);
  const timesRef = useRef(props.times);
  timesRef.current = props.times;
  const lastCase = useRef<string | null>(null);

  const smart = cube.status === "on";
  const realTimer = !smart && timer.status === "on";

  /** The next case and its scramble. */
  const loadNext = useCallback(() => {
    const caseId = pickNextCase(props.cases, timesRef.current, lastCase.current);
    lastCase.current = caseId;
    setCurrent(null);
    void request(ClientEvents.TRAINER_SCRAMBLE, { caseId, cross: props.cross }).then((r) => {
      if (r.ok) {
        setCurrent({ caseId, scramble: r.scramble, revealed: false });
        setError(null);
      } else {
        setError(r.error);
      }
    });
  }, [props.cases, props.cross]);

  // The first scramble (again after a reconnect if it never came, or when the cross colour changes).
  useEffect(() => {
    const load = () => loadNext();
    socket.on("connect", load);
    if (socket.connected) load();
    return () => void socket.off("connect", load);
  }, [loadNext]);

  const record = useCallback(
    (result: { recognitionMs: number | null; executionMs: number; moves: number | null }, missed: boolean) => {
      if (!current) return;
      const time: CaseTime = { caseId: current.caseId, at: Date.now(), source: "drill", ...result, looks: 1, missed: missed || current.revealed };
      props.onTimes([time]);
      setReps((list) => [...list, time]);
      setLast({ time, info: caseById(current.caseId)! });
      loadNext();
    },
    [current, props, loadNext],
  );

  const step = current ? stepOf(current.caseId) : "pll";
  const flow = useDrillFlow({
    active: smart && current !== null,
    scramble: current?.scramble ?? "",
    step,
    cross: props.cross,
    onDone: (result) => record(result, false),
    onLost: () => record({ recognitionMs: null, executionMs: 0, moves: null }, true),
  });

  const bt = useBtTimerSolve({
    active: realTimer && current !== null,
    onStart: () => {},
    onStop: (ms) => record({ recognitionMs: null, executionMs: ms, moves: null }, false),
  });
  const keys = useSpeedTimer({
    canStart: !smart && !realTimer && current !== null,
    onStart: () => {},
    onStop: (ms) => record({ recognitionMs: null, executionMs: ms, moves: null }, false),
    touchArea,
  });
  const { reset } = keys;
  useEffect(() => reset(), [current?.scramble, reset]);

  const skip = () => record({ recognitionMs: null, executionMs: 0, moves: null }, true);
  const reveal = () => setCurrent((c) => (c ? { ...c, revealed: true } : c));

  const phase = bt?.phase ?? keys.phase;
  const running = smart ? flow?.phase === "looking" || flow?.phase === "turning" : phase === "running";
  const startedAt = smart ? (flow?.shownAt ?? null) : (bt?.startedAt ?? keys.startedAt);
  const info = current ? caseById(current.caseId)! : null;

  return (
    <div className="practice drill">
      <div className="trainer-bar">
        <button type="button" onClick={props.onEnd}>
          End drill
        </button>
        <span className="small muted">
          {props.cases.length} {props.cases.length === 1 ? "case" : "cases"}, {reps.length} done
        </span>
        <span className="grow" />
        <CrossSelect cross={props.cross} onChange={props.onCross} />
      </div>

      <details className="panel drill-tools">
        <summary className="small">
          {smart ? `Timing with your smart cube (${cube.name ?? "connected"})` : realTimer ? `Timing with your ${timer.name}` : "Time with the spacebar or a touch, a Stackmat, a GAN timer or a smart cube"}
        </summary>
        <div className="practice-setup">
          <div className="practice-cube">
            <h3 className="small-title">Smart cube</h3>
            <p className="tiny muted">Times your recognition apart, counts your moves, and sees when the case is done.</p>
            <SmartCubeControls />
          </div>
          <div className="practice-cube">
            <h3 className="small-title">Timer</h3>
            <CompetitionTimerControls />
          </div>
        </div>
      </details>

      {error && <p className="banner banner-error">{error}</p>}

      {current && info ? (
        <section className="practice-solve" data-running={running} aria-label="This case">
          <ScrambleBlock scramble={{ cubeEvent: "333", text: current.scramble }} preview={prefs.preview} onTogglePreview={() => setPref("preview", prefs.preview === "3d" ? "2d" : "3d")} />
          <div className="practice-timer" ref={setTouchArea} data-phase={smart ? undefined : phase}>
            {running && startedAt !== null ? <RunningDigits startedAt={startedAt} display="full" /> : <div className="timer-digits mono">{last && !running ? seconds(totalMs(last.time)) : "0.00"}</div>}
            <p className="timer-hint">{drillHint(smart, realTimer, flow?.phase ?? null, flow?.guide.kind ?? null, phase, step)}</p>
            {current.revealed && (
              <p className="drill-answer">
                <span className="mono">{info.alg}</span>
                <span className="tiny muted">Shown: this one counts as a miss.</span>
              </p>
            )}
          </div>
          <div className="drill-buttons">
            {!current.revealed && (
              <button type="button" onClick={reveal}>
                Show the algorithm
              </button>
            )}
            <button type="button" onClick={skip}>
              Skip (a miss)
            </button>
          </div>
        </section>
      ) : (
        !error && <p className="practice-wait small muted">Getting a scramble…</p>
      )}

      {last && <LastCase last={last} times={props.times} />}
      {reps.length > 0 && <DrillTable cases={props.cases} reps={reps} />}
    </div>
  );
}

function drillHint(smart: boolean, realTimer: boolean, flowPhase: string | null, guide: string | null, phase: string, step: TrainerStep): string {
  if (smart) {
    if (flowPhase === "looking") return "Go: your recognition is timed";
    if (flowPhase === "turning") return "";
    if (guide === "solve-first") return step === "oll" ? "Solve your cube (finish the last one), then follow the scramble" : "Solve your cube first, then follow the scramble";
    if (guide === "lost") return "Lost track of your cube: solve it, then follow the scramble";
    if (guide === "off-track") return "Wrong move: undo it as shown on the scramble";
    return "Follow the scramble on your cube";
  }
  if (realTimer) {
    if (phase === "holding") return "Hold…";
    if (phase === "ready") return "Lift to start";
    if (phase === "running") return "";
    return "Scramble your cube, then put your hands on the timer";
  }
  if (phase === "holding") return "Hold…";
  if (phase === "ready") return "Let go to start";
  if (phase === "running") return "Any key or a touch stops";
  return "Scramble your cube, then hold space (or touch here) and let go";
}

/** The case just done: its picture, the algorithm and how it went. */
function LastCase({ last, times }: { last: Last; times: CaseTime[] }) {
  const { info, time } = last;
  const mine = times.filter((t) => t.caseId === info.id && !t.missed).slice(-10).map(totalMs);
  const average = mine.length ? mine.reduce((a, b) => a + b, 0) / mine.length : null;
  const details = [
    time.recognitionMs !== null ? `recognition ${seconds(time.recognitionMs)} s` : null,
    time.moves !== null ? `${time.moves} moves (the algorithm: ${info.moves})` : null,
  ].filter(Boolean);
  return (
    <section className="panel last-case" aria-label="The last case">
      <Diagram info={info} size={72} />
      <div className="trainer-case-text">
        <span className="trainer-case-title">{caseTitle(info)}</span>
        <span className="small">
          {time.missed ? "Missed" : `${seconds(totalMs(time))} s`}
          {details.length > 0 && !time.missed ? `: ${details.join(", ")}` : ""}
        </span>
        <span className="mono small alg-line">{info.alg}</span>
        {average !== null && (
          <span className="tiny muted">
            Your average on it: {seconds(average)} s ({mine.length} {mine.length === 1 ? "time" : "times"})
          </span>
        )}
      </div>
    </section>
  );
}

/** Every case of this drill: how many times, and its average in this drill. */
function DrillTable({ cases, reps }: { cases: string[]; reps: CaseTime[] }) {
  const rows = cases
    .map((id) => {
      const mine = reps.filter((t) => t.caseId === id);
      const timed = mine.filter((t) => !t.missed).map(totalMs);
      return { info: caseById(id)!, count: mine.length, missed: mine.length - timed.length, average: timed.length ? timed.reduce((a, b) => a + b, 0) / timed.length : null };
    })
    .filter((r) => r.count > 0)
    .sort((a, b) => (b.average ?? Infinity) - (a.average ?? Infinity));
  const timed = reps.filter((t) => !t.missed).map(totalMs);
  return (
    <section className="panel drill-table" aria-label="This drill">
      <h2 className="small-title">This drill</h2>
      {timed.length > 0 && (
        <p className="small">
          {reps.length} done, average {seconds(timed.reduce((a, b) => a + b, 0) / timed.length)} s.
        </p>
      )}
      <table className="stage-table">
        <thead>
          <tr>
            <th scope="col">Case</th>
            <th scope="col">Done</th>
            <th scope="col">Average</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.info.id}>
              <td>{caseTitle(r.info)}</td>
              <td className="mono">
                {r.count}
                {r.missed > 0 ? ` (${r.missed} missed)` : ""}
              </td>
              <td className="mono">{r.average !== null ? `${seconds(r.average)} s` : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
