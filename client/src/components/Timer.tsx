import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { AUTO_CONFIRM_MS, ClientEvents, SMART_CUBE_EVENTS, type MatchSnapshot, type Penalty, type SolveResult } from "@cube-racing/shared";
import { turnsPerSecond, type SmartSolveData } from "@cube-racing/shared/smartSolve";
import { addSolve, confirmSolve, solveKey, useOutbox, useRejection } from "../outbox";
import type { InputMode, RunningDisplay } from "../prefs";
import { request } from "../socket";
import { formatResult, formatRunning, formatSolve, parseTypedTime } from "../time";
import { useBtTimer } from "../btTimer";
import { useSmartCube } from "../smartCube";
import type { FlowView } from "../smart/flow";
import { useBtTimerSolve } from "../timer/useBtTimerSolve";
import { useSmartSolve } from "../timer/useSmartSolve";
import { HOLD_MS, useSpeedTimer, type TimerPhase } from "../timer/useSpeedTimer";
import { SmartCubeControls } from "./SmartCube";

/** Only for /dev/states: shows a timer state without real input. */
export interface TimerDemo {
  phase?: TimerPhase;
  elapsedMs?: number;
  pending?: { timeMs: number; penalty: Penalty; confirmed: boolean; smart?: SmartSolveData };
}

interface Props {
  roomCode: string;
  match: MatchSnapshot;
  youId: string;
  inputMode: InputMode;
  runningDisplay: RunningDisplay;
  /** A smart-cube room: only verified smart cube solves count. */
  smartOnly: boolean;
  /** "Waiting for Bat, Nomin and 3 others", shown once your time is in. */
  waiting: string | null;
  onPhaseChange: (phase: TimerPhase) => void;
  demo?: TimerDemo;
}

/** Tells the others whether we're solving. Only the status, never the running time. */
function sendTimerStatus(status: "solving" | "idle"): void {
  void request(ClientEvents.TIMER_STATUS, { status });
}

export function Timer({ roomCode, match, youId, inputMode, runningDisplay, smartOnly, waiting, onPhaseChange, demo }: Props) {
  const [touchArea, setTouchArea] = useState<HTMLDivElement | null>(null);
  const outbox = useOutbox();

  const solveId = { roomCode, matchId: match.matchId, setIndex: match.setIndex, solveIndex: match.solveIndex };
  const key = solveKey(solveId);
  const pending = demo ? demo.pending : outbox.find((e) => solveKey(e) === key);
  const myResult = match.results[youId]?.[match.solveIndex] ?? null;
  const canStart = match.phase === "solving" && !myResult && !pending;

  const stopSolve = (timeMs: number, smart?: SmartSolveData) => {
    // Saved in the outbox the very moment the timer stops.
    addSolve({ ...solveId, timeMs, penalty: "OK", ...(smart ? { smart } : {}) });
    sendTimerStatus("idle");
  };

  // A connected smart cube times 3x3 solves by itself (no spacebar). In a
  // smart-cube room it's the only way to time a solve.
  const smartCube = useSmartCube();
  const smartEvent = SMART_CUBE_EVENTS.includes(match.scramble?.cubeEvent ?? "");
  const smartUsable = !demo && smartCube.status === "on" && smartEvent && (inputMode === "timer" || smartOnly);
  const needsCube = !demo && smartOnly && smartCube.status !== "on" && canStart;
  const smart = useSmartSolve({
    active: smartUsable && canStart,
    scramble: match.scramble?.text ?? "",
    onStart: () => sendTimerStatus("solving"),
    onStop: stopSolve,
  });

  // A Bluetooth timer (GAN) times solves like at a competition, with its own exact time.
  const btTimer = useBtTimer();
  const btUsable = !demo && btTimer.status === "on" && inputMode === "timer" && !smartUsable && !smartOnly;
  const bt = useBtTimerSolve({
    active: btUsable && canStart,
    onStart: () => sendTimerStatus("solving"),
    onStop: (timeMs) => stopSolve(timeMs),
  });

  const timer = useSpeedTimer({
    canStart: !demo && canStart && inputMode === "timer" && !smartUsable && !smartOnly && !btUsable,
    onStart: () => sendTimerStatus("solving"),
    onStop: (timeMs) => stopSolve(timeMs),
    touchArea,
  });
  const smartPhase: TimerPhase | null =
    smart && (smart.phase === "running" ? "running" : smart.phase === "solved" ? "stopped" : "idle");
  const phase = demo?.phase ?? smartPhase ?? bt?.phase ?? timer.phase;
  const startedAt = smart?.startedAt ?? bt?.startedAt ?? timer.startedAt;
  const rejection = useRejection();

  // A new scramble: the timer starts fresh.
  const { reset } = timer;
  useEffect(() => reset(), [key, reset]);

  useEffect(() => onPhaseChange(phase), [phase, onPhaseChange]);

  const typing = inputMode === "typing" && canStart && phase === "idle" && !smartOnly;
  // Just stopped: the time and OK / +2 / DNF float over the blurred room.
  const choosing = !!pending && !pending.confirmed;

  let text = "0.00";
  if (pending) text = formatSolve(pending.timeMs, pending.penalty);
  else if (myResult) text = formatResult(myResult);

  return (
    <div className="timer-zone" data-phase={phase} data-choosing={choosing}>
      {needsCube ? (
        <div className="smart-required">
          <p className="smart-required-title">This room is for smart cubes</p>
          <p className="tiny muted">Every solve is checked move by move. Connect your cube to race.</p>
          <SmartCubeControls />
        </div>
      ) : typing ? (
        <TypeIn onSubmit={(timeMs, penalty) => addSolve({ ...solveId, timeMs, penalty })} />
      ) : (
        <div
          ref={setTouchArea}
          className="timer-touch"
          role="button"
          tabIndex={-1}
          aria-label="Timer. Hold, then let go to start. Tap or press any key to stop."
        >
          {smart?.phase === "inspecting" && smart.inspectionEndsAt !== null ? (
            <InspectionDigits endsAt={smart.inspectionEndsAt} />
          ) : phase === "running" ? (
            demo ? (
              <div className={`timer-digits mono ${runningDisplay === "hidden" ? "as-text" : ""}`}>
                {formatRunning(demo.elapsedMs ?? 0, runningDisplay)}
              </div>
            ) : (
              <RunningDigits startedAt={startedAt} display={runningDisplay} />
            )
          ) : (
            <div className="timer-digits mono" aria-live="polite">
              {text}
            </div>
          )}
          <HoldMeter />
          {smart?.phase === "running" && <LiveTurns view={smart} />}
          <p className="timer-hint">{hintFor(phase, canStart, !!myResult, smart, !!bt)}</p>
        </div>
      )}

      {choosing &&
        createPortal(
          <div className="choose-overlay" role="dialog" aria-modal="true" aria-label="OK, +2 or DNF">
            <div className="choose-card">
              <div className="timer-digits mono" aria-live="polite">
                {text}
              </div>
              <ConfirmSolve solveKeyText={key} timeMs={pending.timeMs} penalty={pending.penalty} auto={!demo} />
            </div>
          </div>,
          document.body,
        )}

      <div className="timer-below">
        <SmartSummary pending={pending?.smart ? { timeMs: pending.timeMs, smart: pending.smart } : null} result={myResult} />
        {pending?.confirmed && <p className="status-line">Sending…</p>}
        {!pending && myResult && <p className="status-line done-line">{waiting ?? "Time in"}</p>}
        {!pending && !myResult && rejection?.key === key && <p className="status-line error-text">{rejection.message}</p>}
      </div>
    </div>
  );
}

/** The bar under the digits that fills while you hold (red), then turns green: ready. */
export function HoldMeter() {
  return (
    <span className="hold-meter" aria-hidden>
      <span style={{ animationDuration: `${HOLD_MS}ms` }} />
    </span>
  );
}

function hintFor(phase: TimerPhase, canStart: boolean, done: boolean, smart: FlowView | null, btTimer: boolean): React.ReactNode {
  if (smart && canStart && smart.phase === "scrambling") {
    switch (smart.guide.kind) {
      case "solve-first":
        return "Solve your cube first, then follow the scramble";
      case "lost":
        return "Lost track of your cube: solve it, then follow the scramble again";
      case "off-track":
        return <span className="fix-hint">Wrong move: do {smart.guide.fix.join(" ")} to go back</span>;
      default:
        return "Follow the scramble on your cube";
    }
  }
  if (smart && canStart && smart.phase === "inspecting") return "Inspection: your first turn starts the timer";
  if (btTimer && canStart && phase === "idle") return "Put your hands on the timer";
  if (btTimer && phase === "holding") return "Hold…";
  if (btTimer && phase === "ready") return "Lift to start";
  if (phase === "holding") return "Hold…";
  if (phase === "ready") return "Release to start";
  if (phase === "running" || phase === "stopped") return "";
  if (done || !canStart) return "";
  return <IdleHint />;
}

/** "Space Hold to get ready" with a keyboard, "Hold the timer to get ready" on touch screens. */
export function IdleHint() {
  return (
    <>
      <span className="hint-keys">
        <kbd>Space</kbd> Hold to get ready
      </span>
      <span className="hint-touch">Hold the timer to get ready</span>
    </>
  );
}

/** The 15 s inspection counting down (written every frame, like the running time). */
function InspectionDigits({ endsAt }: { endsAt: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const left = Math.max(0, Math.ceil((endsAt - performance.now()) / 1000));
      if (ref.current) {
        ref.current.textContent = String(left);
        ref.current.dataset.urgent = String(left <= 3);
      }
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [endsAt]);
  return <div ref={ref} className="timer-digits mono inspection-digits" aria-label="Inspection seconds left" />;
}

/** While solving with a smart cube: moves so far and turns per second, small. */
function LiveTurns({ view }: { view: FlowView }) {
  const elapsed = view.startedAt === null ? 0 : performance.now() - view.startedAt;
  return (
    <p className="turns-line mono" aria-hidden>
      {view.moveCount} moves · {turnsPerSecond(view.moveCount, elapsed).toFixed(1)} TPS
    </p>
  );
}

/** After a smart cube solve: its moves and TPS, and ✓ once the server verified it. */
function SmartSummary({ pending, result }: { pending: { timeMs: number; smart: SmartSolveData } | null; result: SolveResult | null }) {
  if (result?.verified) {
    return (
      <p className="turns-line mono">
        <span className="verified-mark">✓ Verified</span> · {result.verified.moves} moves · {result.verified.tps.toFixed(2)} TPS
      </p>
    );
  }
  if (!pending) return null;
  const moves = pending.smart.moves.length;
  return (
    <p className="turns-line mono">
      {moves} moves · {turnsPerSecond(moves, pending.timeMs).toFixed(2)} TPS
    </p>
  );
}

/**
 * The running time. It is written straight into the page every frame
 * (not through React), so nothing else re-renders during a solve.
 * Final times are measured from timestamps in useSpeedTimer, not from this.
 */
export function RunningDigits({ startedAt, display }: { startedAt: number; display: RunningDisplay }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;
    let last = "";
    const draw = () => {
      const next = formatRunning(Math.max(0, performance.now() - startedAt), display);
      if (next !== last && ref.current) {
        ref.current.textContent = next;
        last = next;
      }
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [startedAt, display]);

  return <div ref={ref} className={`timer-digits mono ${display === "hidden" ? "as-text" : ""}`} />;
}

/** OK / +2 / DNF after a solve. Keys: Enter or 1 = OK, 2 = +2, 3 = DNF. Sends by itself after 5 s. */
function ConfirmSolve({ solveKeyText, timeMs, penalty, auto }: { solveKeyText: string; timeMs: number; penalty: Penalty; auto: boolean }) {
  useEffect(() => {
    if (!auto) return;
    const timeout = setTimeout(() => confirmSolve(solveKeyText, penalty), AUTO_CONFIRM_MS);
    return () => clearTimeout(timeout);
  }, [solveKeyText, penalty, auto]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      // A key still held down from stopping the timer repeats: never let that pick a penalty.
      if (event.repeat) return;
      const choices: Record<string, Penalty> = { Enter: "OK", "1": "OK", "2": "+2", "3": "DNF" };
      const choice = choices[event.key];
      if (choice) {
        event.preventDefault();
        confirmSolve(solveKeyText, choice);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [solveKeyText]);

  return (
    <>
      <PenaltyChoices timeMs={timeMs} penalty={penalty} onChoose={(choice) => confirmSolve(solveKeyText, choice)} keys />
      <div className="auto-send">
        <span>Counts as OK in {AUTO_CONFIRM_MS / 1000} s</span>
        <div className="progress" aria-label={`Counts as OK in ${AUTO_CONFIRM_MS / 1000} seconds`}>
          <div
            className="progress-fill"
            style={{ animationDuration: `${AUTO_CONFIRM_MS}ms`, animationPlayState: auto ? "running" : "paused" }}
          />
        </div>
      </div>
    </>
  );
}

/**
 * The three penalty tiles, each showing what the time becomes: "11.87", "13.87+", "DNF".
 *
 * On phones you stop the timer with a tap, and the tiles appear right under
 * that finger: the phone then delivers the same tap as a click on whichever
 * tile is there (often DNF). So a click only counts if the press started on
 * that tile (a finger or mouse down on it, or Enter / Space while it has focus).
 */
export function PenaltyChoices(props: {
  timeMs: number;
  penalty?: Penalty;
  onChoose: (penalty: Penalty) => void;
  disabled?: boolean;
  /** Show the 1 / 2 / 3 key hints. */
  keys?: boolean;
}) {
  const pressedOn = useRef<Penalty | null>(null);
  return (
    <div className="penalty" role="group" aria-label="Penalty">
      {(["OK", "+2", "DNF"] as const).map((choice, i) => (
        <button
          key={choice}
          type="button"
          aria-pressed={props.penalty === undefined ? undefined : choice === props.penalty}
          className={`pen pen-${choice === "OK" ? "ok" : choice === "+2" ? "plus" : "dnf"}`}
          disabled={props.disabled}
          onPointerDown={() => (pressedOn.current = choice)}
          onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && (pressedOn.current = choice)}
          onClick={() => {
            if (pressedOn.current !== choice) return; // the tap that stopped the timer, not a press on this tile
            pressedOn.current = null;
            props.onChoose(choice);
          }}
        >
          <span className="pen-label">{choice}</span>
          <span className="pen-time">{choice === "DNF" ? `(${formatSolve(props.timeMs, "OK")})` : formatSolve(props.timeMs, choice)}</span>
          {props.keys && <span className="kbd">{i + 1}</span>}
        </button>
      ))}
    </div>
  );
}

/** For stackmat users: type the time, like csTimer (1235 = 12.35). See parseTypedTime. */
export function TypeIn({ onSubmit }: { onSubmit: (timeMs: number, penalty: Penalty) => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent): void {
    event.preventDefault();
    const parsed = parseTypedTime(text);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    setText("");
    onSubmit(parsed.timeMs, parsed.penalty);
  }

  return (
    <form className="type-in" onSubmit={submit}>
      <label className="field">
        <span className="field-label">Your time</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="0.00"
          inputMode="decimal"
          autoComplete="off"
          autoFocus
          aria-describedby="type-in-help"
        />
      </label>
      <p id="type-in-help" className="tiny muted">
        1235 = 12.35 · 10234 = 1:02.34 · + for +2 · DNF
      </p>
      {error && <p className="error-text">{error}</p>}
      <button className="primary xl" type="submit">
        Submit time
      </button>
    </form>
  );
}
