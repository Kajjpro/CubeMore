import { useEffect, useRef, useState, type FormEvent } from "react";
import { AUTO_CONFIRM_MS, ClientEvents, type MatchSnapshot, type Penalty } from "@cube-racing/shared";
import { addSolve, confirmSolve, solveKey, useOutbox } from "../outbox";
import type { InputMode, RunningDisplay } from "../prefs";
import { request } from "../socket";
import { formatResult, formatRunning, formatSolve, parseTypedTime } from "../time";
import { useSmartCube, type SmartState } from "../smartCube";
import { useSmartSolve } from "../timer/useSmartSolve";
import { useSpeedTimer, type TimerPhase } from "../timer/useSpeedTimer";

/** Events a smart cube can time: the 3x3 ones. */
const SMART_EVENTS = new Set(["333", "333oh"]);

/** Only for /dev/states: shows a timer state without real input. */
export interface TimerDemo {
  phase?: TimerPhase;
  elapsedMs?: number;
  pending?: { timeMs: number; penalty: Penalty; confirmed: boolean };
}

interface Props {
  roomCode: string;
  match: MatchSnapshot;
  youId: string;
  inputMode: InputMode;
  runningDisplay: RunningDisplay;
  /** "Waiting for Bat, Nomin and 3 others", shown once your time is in. */
  waiting: string | null;
  onPhaseChange: (phase: TimerPhase) => void;
  demo?: TimerDemo;
}

/** Tells the others whether we're solving. Only the status, never the running time. */
function sendTimerStatus(status: "solving" | "idle"): void {
  void request(ClientEvents.TIMER_STATUS, { status });
}

export function Timer({ roomCode, match, youId, inputMode, runningDisplay, waiting, onPhaseChange, demo }: Props) {
  const [touchArea, setTouchArea] = useState<HTMLDivElement | null>(null);
  const outbox = useOutbox();

  const solveId = { roomCode, matchId: match.matchId, setIndex: match.setIndex, solveIndex: match.solveIndex };
  const key = solveKey(solveId);
  const pending = demo ? demo.pending : outbox.find((e) => solveKey(e) === key);
  const myResult = match.results[youId]?.[match.solveIndex] ?? null;
  const canStart = match.phase === "solving" && !myResult && !pending;

  const stopSolve = (timeMs: number) => {
    // Saved in the outbox the very moment the timer stops.
    addSolve({ ...solveId, timeMs, penalty: "OK" });
    sendTimerStatus("idle");
  };

  // A connected smart cube times 3x3 solves by itself (no spacebar).
  const smartCube = useSmartCube();
  const smartUsable = !demo && smartCube.status === "on" && inputMode === "timer" && SMART_EVENTS.has(match.scramble?.cubeEvent ?? "");
  const smart = useSmartSolve({
    active: smartUsable && canStart,
    scramble: match.scramble?.text ?? "",
    onStart: () => sendTimerStatus("solving"),
    onStop: stopSolve,
  });

  const timer = useSpeedTimer({
    canStart: !demo && canStart && inputMode === "timer" && !smartUsable,
    onStart: () => sendTimerStatus("solving"),
    onStop: stopSolve,
    touchArea,
  });
  const smartPhase: TimerPhase | null = smart && (smart.state === "running" ? "running" : smart.state === "solved" ? "stopped" : "idle");
  const phase = demo?.phase ?? smartPhase ?? timer.phase;
  const startedAt = smart ? smart.startedAt : timer.startedAt;

  // A new scramble: the timer starts fresh.
  const { reset } = timer;
  useEffect(() => reset(), [key, reset]);

  useEffect(() => onPhaseChange(phase), [phase, onPhaseChange]);

  const typing = inputMode === "typing" && canStart && phase === "idle";

  let text = "0.00";
  if (pending) text = formatSolve(pending.timeMs, pending.penalty);
  else if (myResult) text = formatResult(myResult);

  return (
    <div className="timer-zone" data-phase={phase}>
      {typing ? (
        <TypeIn onSubmit={(timeMs, penalty) => addSolve({ ...solveId, timeMs, penalty })} />
      ) : (
        <div
          ref={setTouchArea}
          className="timer-touch"
          role="button"
          tabIndex={-1}
          aria-label="Timer. Hold, then let go to start. Tap or press any key to stop."
        >
          {phase === "running" ? (
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
          <p className="timer-hint">{hintFor(phase, canStart, !!myResult, smart?.state)}</p>
        </div>
      )}

      <div className="timer-below">
        {pending && !pending.confirmed && <ConfirmSolve solveKeyText={key} penalty={pending.penalty} auto={!demo} />}
        {pending?.confirmed && <p className="status-line">Sending…</p>}
        {!pending && myResult && waiting && <p className="status-line">{waiting}</p>}
      </div>
    </div>
  );
}

function hintFor(phase: TimerPhase, canStart: boolean, done: boolean, smart?: SmartState): React.ReactNode {
  if (smart === "scrambling" && canStart) return "Scramble your smart cube to match";
  if (smart === "armed" && canStart) return "Scrambled. Your first turn starts the timer";
  if (phase === "holding") return "Hold…";
  if (phase === "ready") return "Release to start";
  if (phase === "running" || phase === "stopped") return "";
  if (done || !canStart) return "";
  return (
    <>
      <span className="hint-keys">Hold spacebar to ready</span>
      <span className="hint-touch">Hold the timer to ready</span>
    </>
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
function ConfirmSolve({ solveKeyText, penalty, auto }: { solveKeyText: string; penalty: Penalty; auto: boolean }) {
  useEffect(() => {
    if (!auto) return;
    const timeout = setTimeout(() => confirmSolve(solveKeyText, penalty), AUTO_CONFIRM_MS);
    return () => clearTimeout(timeout);
  }, [solveKeyText, penalty, auto]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
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
      <div className="penalty" role="group" aria-label="Penalty">
        {(["OK", "+2", "DNF"] as const).map((choice, i) => (
          <button
            key={choice}
            type="button"
            aria-pressed={choice === penalty}
            className={choice === "DNF" ? "danger" : ""}
            onClick={() => confirmSolve(solveKeyText, choice)}
          >
            {choice}
            <span className="kbd">{i + 1}</span>
          </button>
        ))}
      </div>
      <div className="progress" aria-label="Sends as OK in 5 seconds">
        <div
          className="progress-fill"
          style={{ animationDuration: `${AUTO_CONFIRM_MS}ms`, animationPlayState: auto ? "running" : "paused" }}
        />
      </div>
    </>
  );
}

/** For stackmat users: type the time. Accepts 12.34, 1:02.34 and DNF. */
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
        12.34, 1:02.34 or DNF
      </p>
      {error && <p className="error-text">{error}</p>}
      <button className="primary" type="submit">
        Submit
      </button>
    </form>
  );
}
