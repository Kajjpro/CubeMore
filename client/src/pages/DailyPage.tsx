/*
 * /daily: the daily scramble. One 3x3 scramble per day for everyone, one attempt.
 *
 *   new      -> what it is, "Start my attempt" (the scramble stays hidden until then)
 *   started  -> the scramble, the timer, and how long is left of the 10 minutes
 *   done     -> your time, your rank, share, and today's leaderboard
 *
 * A stopped time is saved in the browser before it's sent, so a reload or a
 * dropped connection never loses it.
 */

import { useCallback, useEffect, useState } from "react";
import { ClientEvents, NICKNAME_MAX_LENGTH, type DailyStatus, type Penalty } from "@cube-racing/shared";
import { serverNow, updateServerOffset } from "../clock";
import { ScrambleBlock } from "../components/Scramble";
import { RunningDigits, TypeIn } from "../components/Timer";
import { copyText } from "../components/TopBar";
import { EventIcon } from "../components/ui";
import { setPref, usePrefs } from "../prefs";
import { navigate } from "../router";
import { request, socket } from "../socket";
import { loadIdentity, profileKey, saveNickname } from "../storage";
import { formatResult, formatResultLong, formatSolve } from "../time";
import { useSpeedTimer, type TimerPhase } from "../timer/useSpeedTimer";

const PENDING_KEY = profileKey("daily-pending");

/** A stopped daily time that hasn't reached the server yet. */
interface Pending {
  day: string;
  timeMs: number;
}

function loadPending(day: string): Pending | null {
  try {
    const pending = JSON.parse(localStorage.getItem(PENDING_KEY) ?? "null") as Pending | null;
    return pending?.day === day ? pending : null;
  } catch {
    return null;
  }
}

function savePending(pending: Pending | null): void {
  try {
    if (pending) localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    // Storage blocked: the time is still on screen until it's sent.
  }
}

/** Talks to the server: today's status, start, submit. */
function useDaily() {
  const [daily, setDaily] = useState<DailyStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((response: { ok: true; daily: DailyStatus } | { ok: false; error: string }) => {
    if (response.ok) {
      updateServerOffset(response.daily.serverTime);
      setDaily(response.daily);
      setError(null);
    } else {
      setError(response.error);
    }
    return response.ok;
  }, []);

  useEffect(() => {
    const load = () => void request(ClientEvents.DAILY_STATUS, { playerId: loadIdentity().playerId }).then(apply);
    socket.on("connect", load);
    if (socket.connected) load();
    return () => void socket.off("connect", load);
  }, [apply]);

  return {
    daily,
    error,
    start: async (nickname: string) => apply(await request(ClientEvents.DAILY_START, { playerId: loadIdentity().playerId, nickname })),
    submit: async (timeMs: number, penalty: Penalty) =>
      apply(await request(ClientEvents.DAILY_SUBMIT, { playerId: loadIdentity().playerId, timeMs, penalty })),
  };
}

export function DailyPage() {
  const { daily, error, start, submit } = useDaily();
  return <DailyView daily={daily} error={error} onStart={start} onSubmit={submit} />;
}

/** The page for a daily status (also used by /dev/states). */
export function DailyView(props: {
  daily: DailyStatus | null;
  error: string | null;
  onStart: (nickname: string) => Promise<boolean>;
  onSubmit: (timeMs: number, penalty: Penalty) => Promise<boolean>;
  demoPhase?: TimerPhase;
}) {
  const { daily } = props;
  const [phase, setPhase] = useState<TimerPhase>("idle");
  const shownPhase = props.demoPhase ?? phase;
  const focus = shownPhase === "holding" || shownPhase === "ready" || shownPhase === "running";

  return (
    <div className="daily" data-focus={focus}>
      <header className="daily-head">
        <button type="button" className="quiet" onClick={() => navigate("/")}>
          Cube Racing
        </button>
        <span className="grow" />
        {daily && <NextIn nextAt={daily.nextAt} />}
      </header>

      <main className="daily-main">
        <div className="daily-title">
          <EventIcon id="333" />
          <div>
            <h1>Daily scramble</h1>
            <p className="small muted">{daily ? dayLabel(daily.day) : "Loading…"} · 3x3 · one attempt</p>
          </div>
        </div>

        {props.error && <p className="banner banner-error">{props.error}</p>}

        {daily?.status === "new" && <StartCard daily={daily} onStart={props.onStart} />}
        {daily?.status === "started" && (
          <Attempt daily={daily} onSubmit={props.onSubmit} onPhase={setPhase} demoPhase={props.demoPhase} />
        )}
        {daily?.status === "done" && <DoneCard daily={daily} />}

        {daily && <Leaderboard daily={daily} />}
      </main>
    </div>
  );
}

/** "Wed, Sep 30" for "2026-09-30" (the day is in UTC). */
function dayLabel(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

/** Re-renders every `ms` (for countdowns). */
function useTick(ms: number): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), ms);
    return () => clearInterval(interval);
  }, [ms]);
}

/** "New scramble in 5h 12m". */
function NextIn({ nextAt }: { nextAt: number }) {
  useTick(30_000);
  const minutes = Math.max(0, Math.ceil((nextAt - serverNow()) / 60_000));
  const text = minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
  return <span className="small muted">New scramble in {text}</span>;
}

function StartCard({ daily, onStart }: { daily: DailyStatus; onStart: (nickname: string) => Promise<boolean> }) {
  const [nickname, setNickname] = useState(() => loadIdentity().nickname);
  const [busy, setBusy] = useState(false);

  async function start(): Promise<void> {
    const name = nickname.trim();
    if (!name || busy) return;
    saveNickname(name);
    setBusy(true);
    await onStart(name);
    setBusy(false);
  }

  return (
    <section className="panel section daily-start">
      <ul className="daily-rules">
        <li>Everyone in the world gets the same scramble today.</li>
        <li>You get one attempt. The scramble shows when you start; then you have 10 minutes to scramble your cube and solve.</li>
        <li>{daily.total ? `${daily.total} ${daily.total === 1 ? "cuber has" : "cubers have"} finished today.` : "Nobody has finished yet today. Be the first."}</li>
      </ul>
      <label className="field">
        <span className="field-label">Nickname on the leaderboard</span>
        <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={NICKNAME_MAX_LENGTH} placeholder="Your name" autoComplete="nickname" />
      </label>
      <button type="button" className="primary" onClick={start} disabled={busy || !nickname.trim()}>
        {busy ? "Starting…" : "Start my attempt"}
      </button>
    </section>
  );
}

/** The scramble, the timer, and the clock running down. */
function Attempt(props: {
  daily: DailyStatus;
  onSubmit: (timeMs: number, penalty: Penalty) => Promise<boolean>;
  onPhase: (phase: TimerPhase) => void;
  demoPhase?: TimerPhase;
}) {
  const { daily } = props;
  const prefs = usePrefs();
  const [pending, setPending] = useState<Pending | null>(() => loadPending(daily.day));
  const [sending, setSending] = useState(false);

  async function send(timeMs: number, penalty: Penalty): Promise<void> {
    setSending(true);
    const ok = await props.onSubmit(timeMs, penalty);
    setSending(false);
    if (ok) savePending(null);
  }

  return (
    <section className="daily-attempt">
      {daily.scramble && (
        <ScrambleBlock
          scramble={daily.scramble}
          preview={prefs.preview}
          onTogglePreview={() => setPref("preview", prefs.preview === "3d" ? "2d" : "3d")}
        />
      )}
      {daily.deadline !== null && <TimeLeft deadline={daily.deadline} />}

      {pending ? (
        <div className="daily-confirm">
          <p className="timer-digits mono">{formatSolve(pending.timeMs, "OK")}</p>
          <p className="small muted">Pick one to send your time. This is your only attempt.</p>
          <div className="penalty" role="group" aria-label="Penalty">
            {(["OK", "+2", "DNF"] as const).map((penalty) => (
              <button
                key={penalty}
                type="button"
                className={penalty === "DNF" ? "danger" : ""}
                disabled={sending}
                onClick={() => void send(pending.timeMs, penalty)}
              >
                {penalty === "+2" ? formatSolve(pending.timeMs, "+2") : penalty}
              </button>
            ))}
          </div>
        </div>
      ) : prefs.inputMode === "typing" ? (
        <TypeIn onSubmit={(timeMs, penalty) => void send(timeMs, penalty)} />
      ) : (
        <DailyTimer
          demoPhase={props.demoPhase}
          onPhase={props.onPhase}
          onStop={(timeMs) => {
            const next = { day: daily.day, timeMs };
            savePending(next); // saved the moment it stops
            setPending(next);
          }}
        />
      )}
    </section>
  );
}

function TimeLeft({ deadline }: { deadline: number }) {
  useTick(1_000);
  const left = Math.max(0, deadline - serverNow());
  const minutes = Math.floor(left / 60_000);
  const seconds = Math.floor((left % 60_000) / 1000);
  return (
    <p className={`daily-left small ${left < 60_000 ? "t-amber" : "muted"}`} role="timer">
      {minutes}:{String(seconds).padStart(2, "0")} left to solve
    </p>
  );
}

/** The hold-to-start timer, like in a race. */
function DailyTimer(props: { onStop: (timeMs: number) => void; onPhase: (phase: TimerPhase) => void; demoPhase?: TimerPhase }) {
  const [touchArea, setTouchArea] = useState<HTMLDivElement | null>(null);
  const { runningDisplay } = usePrefs();
  const timer = useSpeedTimer({ canStart: !props.demoPhase, onStart: () => {}, onStop: props.onStop, touchArea });
  const phase = props.demoPhase ?? timer.phase;
  const { onPhase } = props;
  useEffect(() => onPhase(phase), [phase, onPhase]);

  return (
    <div className="timer-zone" data-phase={phase}>
      <div ref={setTouchArea} className="timer-touch" role="button" tabIndex={-1} aria-label="Timer. Hold, then let go to start.">
        {phase === "running" && !props.demoPhase ? (
          <RunningDigits startedAt={timer.startedAt} display={runningDisplay} />
        ) : (
          <div className="timer-digits mono">0.00</div>
        )}
        <p className="timer-hint">
          {phase === "holding" ? (
            "Hold…"
          ) : phase === "ready" ? (
            "Release to start"
          ) : phase === "idle" ? (
            <>
              <span className="hint-keys">Hold spacebar to ready</span>
              <span className="hint-touch">Hold the timer to ready</span>
            </>
          ) : (
            ""
          )}
        </p>
      </div>
    </div>
  );
}

function DoneCard({ daily }: { daily: DailyStatus }) {
  const [shared, setShared] = useState<string | null>(null);
  const result = daily.result!;

  async function share(): Promise<void> {
    const text = `Cube Racing daily ${daily.day}: ${formatResult(result)} · #${daily.rank} of ${daily.total}\n${window.location.origin}/daily`;
    if (navigator.share) {
      try {
        await navigator.share({ text });
        setShared("Shared");
        return;
      } catch {
        return; // closed the share sheet
      }
    }
    if (await copyText(text)) setShared("Copied");
  }

  return (
    <section className="panel section daily-done">
      <p className="small muted">Your time today</p>
      <p className={`daily-result mono ${result.penalty === "DNF" ? "t-red" : ""}`}>{formatResultLong(result)}</p>
      <p>
        <b>#{daily.rank}</b> <span className="muted">of {daily.total} today</span>
      </p>
      <div className="row">
        <button type="button" className="primary grow" onClick={share}>
          {shared ?? "Share my result"}
        </button>
        <button type="button" className="grow" onClick={() => navigate("/")}>
          Race someone
        </button>
      </div>
    </section>
  );
}

function Leaderboard({ daily }: { daily: DailyStatus }) {
  const rows = daily.leaderboard;
  const youInTop = rows.some((row) => row.playerId === daily.youId);
  return (
    <section className="panel daily-board" aria-labelledby="daily-board-title">
      <div className="panel-head">
        <h3 id="daily-board-title">Today's leaderboard</h3>
        <span className="tiny muted">{daily.total} finished</span>
      </div>
      {rows.length === 0 ? (
        <p className="small muted daily-empty">No times yet.</p>
      ) : (
        <ol className="daily-rows">
          {rows.map((row) => (
            <li key={row.playerId} className={row.playerId === daily.youId ? "me" : ""}>
              <span className="rank">{row.rank}</span>
              <span className="name">{row.name}</span>
              <span className={`time ${row.result.penalty === "DNF" ? "t-red" : row.rank === 1 ? "t-green" : ""}`}>
                {formatResult(row.result)}
              </span>
            </li>
          ))}
          {!youInTop && daily.status === "done" && daily.result && (
            <li className="me">
              <span className="rank">{daily.rank}</span>
              <span className="name">You</span>
              <span className="time">{formatResult(daily.result)}</span>
            </li>
          )}
        </ol>
      )}
    </section>
  );
}
