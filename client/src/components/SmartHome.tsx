/*
 * The home page's smart cube section (below the rooms): the weekly race and
 * the verified leaderboard. Only smart cube solves the server replayed and
 * checked count here, so the times mean something. Tap a leaderboard row to
 * watch that solve again, move by move.
 */

import { useEffect, useRef, useState } from "react";
import { ClientEvents, type LeaderboardRow, type Replay, type WeeklyRow, type WeeklyStatus } from "@cube-racing/shared";
import { serverNow, updateServerOffset } from "../clock";
import { navigate } from "../router";
import { request, socket } from "../socket";
import { formatMark, formatTime } from "../time";
import { Segmented } from "./ui";

export function SmartHome() {
  return (
    <section className="smart-home" aria-labelledby="smart-home-title">
      <div className="smart-home-head">
        <h2 id="smart-home-title">Smart cube racing</h2>
        <p className="small muted">Every solve is replayed move by move on the server: only real smart cube solves count, and anyone can watch the best ones.</p>
      </div>
      <div className="smart-home-grid">
        <WeeklyCard />
        <VerifiedLeaderboard />
      </div>
    </section>
  );
}

/** Loads something when connected (and again on every reconnect), and every `everyMs`. */
function useLoad(load: () => void, everyMs: number, deps: unknown[]): void {
  useEffect(() => {
    socket.on("connect", load);
    if (socket.connected) load();
    const interval = setInterval(load, everyMs);
    return () => {
      socket.off("connect", load);
      clearInterval(interval);
    };
  }, deps);
}

// ---------------------------------------------------------------------------

function WeeklyCard() {
  const [weekly, setWeekly] = useState<WeeklyStatus | null>(null);
  useLoad(
    () =>
      void request(ClientEvents.WEEKLY_STATUS, {}).then((r) => {
        if (!r.ok) return;
        updateServerOffset(r.weekly.serverTime);
        setWeekly(r.weekly);
      }),
    30_000,
    [],
  );

  const starts = weekly ? new Date(weekly.startsAt) : null;
  const when = starts?.toLocaleString(undefined, { weekday: "long", hour: "2-digit", minute: "2-digit" });

  return (
    <section className="panel weekly-card" aria-labelledby="weekly-title">
      <div className="weekly-head">
        <h3 id="weekly-title">Weekly race</h3>
        <span className="tag tag-smart">Smart cubes</span>
      </div>
      <p className="small muted">3x3, one ao5, everyone at the same time. {when ? `${when} (your time).` : ""}</p>

      {weekly && (weekly.phase === "upcoming" || weekly.phase === "open") && (
        <div className="weekly-countdown">
          <Countdown to={weekly.startsAt} />
          {weekly.phase === "open" && weekly.roomCode ? (
            <button type="button" className="primary" onClick={() => navigate(`/room/${weekly.roomCode}`)}>
              Join the race
            </button>
          ) : (
            <span className="tiny muted">Opens 30 min before</span>
          )}
        </div>
      )}
      {weekly?.phase === "racing" && weekly.roomCode && (
        <div className="weekly-countdown">
          <span className="weekly-live">Racing now</span>
          <button type="button" onClick={() => navigate(`/room/${weekly.roomCode}`)}>
            Watch
          </button>
        </div>
      )}
      {weekly?.phase === "over" &&
        (weekly.results.length > 0 ? <WeeklyResults rows={weekly.results} /> : <p className="small muted">Nobody raced this week.</p>)}
      {weekly?.phase !== "over" && weekly?.previous && (
        <>
          <p className="tiny muted weekly-last">Last week</p>
          <WeeklyResults rows={weekly.previous.results.slice(0, 3)} />
        </>
      )}
    </section>
  );
}

/** "2d 4h", "3:12:45", "12:34": counting down every second. */
function Countdown({ to }: { to: number }) {
  const [now, setNow] = useState(serverNow());
  useEffect(() => {
    const interval = setInterval(() => setNow(serverNow()), 1000);
    return () => clearInterval(interval);
  }, []);
  const left = Math.max(0, Math.floor((to - now) / 1000));
  const days = Math.floor(left / 86_400);
  const hours = Math.floor((left % 86_400) / 3600);
  const minutes = Math.floor((left % 3600) / 60);
  const seconds = left % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const text = days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
  return (
    <span className="weekly-timer">
      <span className="tiny muted">Starts in</span> <span className="mono">{text}</span>
    </span>
  );
}

function WeeklyResults({ rows }: { rows: WeeklyRow[] }) {
  return (
    <ol className="board">
      {rows.slice(0, 10).map((row) => (
        <li key={row.playerId}>
          <span className="board-rank mono">{row.rank}</span>
          <span className="board-name">{row.name}</span>
          <span className="board-time mono">{formatMark(row.average)}</span>
          <span className="board-extra mono muted">{formatMark(row.best)}</span>
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------------------

function VerifiedLeaderboard() {
  const [period, setPeriod] = useState<"week" | "all">("week");
  const [board, setBoard] = useState<{ rows: LeaderboardRow[]; available: boolean } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useLoad(
    () =>
      void request(ClientEvents.LEADERBOARD, { period }).then((r) => r.ok && setBoard({ rows: r.rows, available: r.available })),
    60_000,
    [period],
  );

  return (
    <section className="panel verified-board" aria-labelledby="board-title">
      <div className="weekly-head">
        <h3 id="board-title">Verified 3x3 singles</h3>
        <span className="grow" />
      </div>
      <Segmented
        label="Period"
        value={period}
        options={[
          { value: "week", label: "This week" },
          { value: "all", label: "All time" },
        ]}
        onChange={(value) => {
          setPeriod(value);
          setOpen(null);
        }}
      />
      {board && !board.available && <p className="small muted">The leaderboard needs the server's database.</p>}
      {board?.available && board.rows.length === 0 && (
        <p className="small muted">No verified solves yet. Connect a smart cube and race in a Smart room.</p>
      )}
      {board && board.rows.length > 0 && (
        <ol className="board">
          {board.rows.map((row) => (
            <li key={row.replayId} className={open === row.replayId ? "open" : ""}>
              <button
                type="button"
                className="board-row"
                aria-expanded={open === row.replayId}
                onClick={() => setOpen(open === row.replayId ? null : row.replayId)}
              >
                <span className="board-rank mono">{row.rank}</span>
                <span className="board-name">{row.name}</span>
                <span className="board-time mono">{formatTime(row.timeMs)}</span>
                <span className="board-extra mono muted">{row.tps.toFixed(1)} TPS</span>
              </button>
              {open === row.replayId && <ReplayView id={row.replayId} />}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** One verified solve, played back on a 3D cube: the scramble, then every move. */
function ReplayView({ id }: { id: string }) {
  const [replay, setReplay] = useState<Replay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void request(ClientEvents.REPLAY, { id }).then((r) => (r.ok ? setReplay(r.replay) : setError(r.error)));
  }, [id]);

  useEffect(() => {
    if (!replay) return;
    let cancelled = false;
    let player: HTMLElement | null = null;
    void import("cubing/twisty").then(({ TwistyPlayer }) => {
      if (cancelled || !boxRef.current) return;
      player = new TwistyPlayer({
        puzzle: "3x3x3",
        experimentalSetupAlg: replay.scramble,
        alg: replay.moves.join(" "),
        background: "none",
        controlPanel: "bottom-row",
        hintFacelets: "none",
        viewerLink: "none",
      });
      boxRef.current.append(player);
    });
    return () => {
      cancelled = true;
      player?.remove();
    };
  }, [replay]);

  if (error) return <p className="tiny error-text">{error}</p>;
  if (!replay) return <p className="tiny muted">Loading the solve…</p>;
  return (
    <div className="replay">
      <div className="replay-cube" ref={boxRef} />
      <p className="tiny muted mono">
        {formatTime(replay.timeMs)}
        {replay.penalty === "+2" ? " +2" : ""} · {replay.moves.length} moves · {replay.tps.toFixed(2)} TPS
      </p>
      <p className="tiny muted mono replay-scramble">{replay.scramble}</p>
    </div>
  );
}
