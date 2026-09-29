/*
 * RoomView: the whole room screen, built only from props.
 * The real room (pages/RoomPage.tsx) and the /dev/states page both render it.
 *
 * Layouts (see DESIGN.md): phone = stage + bottom sheet, landscape = stage +
 * compact standings, wide = stage + room panel. While the timer runs, the room
 * is in "focus mode": only the digits stay visible, and everything except the
 * timer is frozen (it doesn't re-render until the solve is over).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Penalty, PlayerSnapshot, RoomSettings, RoomSnapshot } from "@cube-racing/shared";
import { useNewScrambleAlert } from "../alerts";
import { settingsSummary } from "../labels";
import { useLayout } from "../layout";
import { setPref, usePrefs, type InputMode, type RunningDisplay } from "../prefs";
import { useSessionStats } from "../session";
import type { TimerPhase } from "../timer/useSpeedTimer";
import { useWakeLock } from "../wakeLock";
import { DEBUG, DebugPanel } from "./DebugPanel";
import { Lobby } from "./Lobby";
import { HostPanel, MatchOver, SessionPanel, SetResult, SolveReview, waitingNames, waitingText } from "./RoomPanels";
import { preloadScramblePreview, ScrambleBlock } from "./Scramble";
import { Standings } from "./Standings";
import { Timer, type TimerDemo } from "./Timer";
import { TopBar } from "./TopBar";
import { ProgressBar } from "./ui";

export interface RoomActions {
  leave: () => void;
  start: () => void;
  updateSettings: (changes: Partial<RoomSettings>) => void;
  kick: (player: PlayerSnapshot) => void;
  skip: (player: PlayerSnapshot) => void;
  endMatch: () => void;
  /** After a match, or in the middle of one; optionally with another event / format / time limit. */
  rematch: (changes?: Partial<Pick<RoomSettings, "cubeEvent" | "format" | "solveTimeLimit">>) => void;
  backToLobby: () => void;
  changePenalty: (solveIndex: number, penalty: Penalty) => void;
  dismissError: () => void;
}

/** Only for /dev/states. */
export interface RoomDemo {
  timer?: TimerDemo;
  sheetOpen?: boolean;
  menuOpen?: boolean;
  inputMode?: InputMode;
  runningDisplay?: RunningDisplay;
}

export interface RoomViewProps {
  room: RoomSnapshot;
  youId: string | null;
  connected: boolean;
  notice: string | null;
  error: string | null;
  starting: boolean;
  actions: RoomActions;
  demo?: RoomDemo;
}

/** Keeps showing the old value while `frozen` is true. */
function useFrozen<T>(value: T, frozen: boolean): T {
  const kept = useRef(value);
  if (!frozen) kept.current = value;
  return kept.current;
}

/** Every nickname we've seen, so players who left still have a name in the results. */
function useNames(room: RoomSnapshot): Record<string, string> {
  const names = useRef<Record<string, string>>({});
  for (const p of room.players) names.current[p.id] = p.nickname;
  return names.current;
}

export function RoomView(props: RoomViewProps) {
  const { youId, actions, demo } = props;
  const layout = useLayout();
  const prefs = usePrefs();

  const [timerPhase, setTimerPhase] = useState<TimerPhase>("idle");
  const running = (demo?.timer?.phase ?? timerPhase) === "running";
  // During a solve, everything but the timer keeps the last state (no re-renders).
  const room = useFrozen(props.room, running);
  const names = useNames(room);
  const stats = useSessionStats(props.room, youId);

  const [sheetOpen, setSheetOpen] = useState(demo?.sheetOpen ?? false);
  const [menuOpen, setMenuOpen] = useState(demo?.menuOpen ?? false);
  useEffect(() => {
    // Getting ready or solving: never cover the timer.
    if (timerPhase === "holding" || timerPhase === "ready" || timerPhase === "running") {
      setSheetOpen(false);
      setMenuOpen(false);
    }
  }, [timerPhase]);

  useWakeLock(true);

  const lobbyEvent = room.match ? null : room.settings.cubeEvent;
  useEffect(() => {
    if (lobbyEvent) preloadScramblePreview(lobbyEvent);
  }, [lobbyEvent]);

  const live = props.room.match;
  const mustSolve = !!live && !!youId && live.phase === "solving" && live.results[youId]?.[live.solveIndex] === null;
  useNewScrambleAlert(live?.phase === "solving" ? `${live.matchId}/${live.setIndex}/${live.solveIndex}` : null, mustSolve);

  const onPhaseChange = useCallback((phase: TimerPhase) => setTimerPhase(phase), []);
  const toggleMenu = useCallback(() => setMenuOpen((open) => !open), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const togglePreview = useCallback(() => setPref("preview", prefs.preview === "3d" ? "2d" : "3d"), [prefs.preview]);

  const match = room.match;
  const isHost = room.hostId === youId;

  return (
    <div className={`room ${match ? "in-match" : "in-lobby"} format-${room.settings.format}`} data-focus={running}>
      <TopBar
        code={room.code}
        pin={room.pin}
        name={room.settings.name}
        summary={settingsSummary(room.settings)}
        connected={props.connected}
        menuOpen={menuOpen}
        onToggleMenu={toggleMenu}
        onCloseMenu={closeMenu}
        onLeave={actions.leave}
      />

      <div className="banners" aria-live="polite">
        {props.notice && (
          <div className="banner banner-warn">
            <p>{props.notice}</p>
          </div>
        )}
        {!props.connected && !props.notice && (
          <div className="banner banner-warn">
            <p>Connection lost. Reconnecting. Your times are kept and sent when you're back.</p>
          </div>
        )}
        {props.error && (
          <div className="banner banner-error">
            <p>{props.error}</p>
            <button type="button" className="quiet" onClick={actions.dismissError}>
              Dismiss
            </button>
          </div>
        )}
      </div>

      {!match ? (
        <Lobby
          room={room}
          youId={youId}
          isHost={isHost}
          starting={props.starting}
          onStart={actions.start}
          onKick={actions.kick}
          onUpdateSettings={actions.updateSettings}
        />
      ) : (
        <div className="room-body">
          <section className="stage" aria-label="Solve">
            {match.scramble && (match.phase === "solving" || match.phase === "solve_review") && (
              <ScrambleBlock scramble={match.scramble} preview={prefs.preview} onTogglePreview={togglePreview} />
            )}
            {match.phase === "solving" && match.solveDeadline !== null && room.settings.solveTimeLimit !== "off" && (
              <div className="limit-bar">
                <span>{room.settings.solveTimeLimit} min limit</span>
                <ProgressBar endsAt={match.solveDeadline} totalMs={room.settings.solveTimeLimit * 60_000} label="Time left for this solve" />
              </div>
            )}
            <div className="stage-main">
              {match.phase === "solving" &&
                (youId && match.roster.includes(youId) && live ? (
                  <Timer
                    roomCode={room.code}
                    match={live}
                    youId={youId}
                    inputMode={demo?.inputMode ?? prefs.inputMode}
                    runningDisplay={demo?.runningDisplay ?? prefs.runningDisplay}
                    waiting={waitingText(waitingNames(props.room, live, youId))}
                    onPhaseChange={onPhaseChange}
                    demo={demo?.timer}
                  />
                ) : (
                  <div className="result-screen">
                    <h2>Spectating</h2>
                    <p className="small muted">You joined during this set. You race from the next set.</p>
                    <p className="small">{waitingText(waitingNames(room, match, youId))}</p>
                  </div>
                ))}
              {match.phase === "solve_review" && (
                <div className="stage-scroll">
                  <SolveReview match={match} names={names} youId={youId} />
                </div>
              )}
              {match.phase === "set_result" && (
                <div className="stage-scroll">
                  <SetResult match={match} names={names} youId={youId} />
                </div>
              )}
              {match.phase === "match_over" && (
                <div className="stage-scroll">
                  <MatchOver
                    match={match}
                    names={names}
                    youId={youId}
                    isHost={isHost}
                    busy={props.starting}
                    cubeEvent={room.settings.cubeEvent}
                    onRematch={actions.rematch}
                    onBackToLobby={actions.backToLobby}
                  />
                </div>
              )}
            </div>
          </section>

          {layout === "phone" ? (
            <div className="sheet" data-open={sheetOpen}>
              <button
                type="button"
                className="sheet-handle"
                aria-expanded={sheetOpen}
                onClick={() => setSheetOpen((open) => !open)}
              >
                <span>Room ({room.players.length})</span>
                <span className="muted small">{sheetOpen ? "Close" : sheetSummary(room, youId)}</span>
              </button>
              <div className="sheet-body" inert={!sheetOpen}>
                <SidePanel {...{ room, match, youId, names, isHost, actions, stats, layout }} />
              </div>
            </div>
          ) : (
            <aside className="side" aria-label="Room">
              <SidePanel {...{ room, match, youId, names, isHost, actions, stats, layout }} />
            </aside>
          )}
        </div>
      )}

      <div className="focus-offline" role="status">
        {!props.connected && (
          <>
            <span className="dot warn" aria-hidden />
            reconnecting
          </>
        )}
      </div>
      {DEBUG && <DebugPanel room={props.room} />}
    </div>
  );
}

/** What the collapsed sheet handle says next to "Room (N)". */
function sheetSummary(room: RoomSnapshot, youId: string | null): string {
  const match = room.match;
  if (!match) return "";
  const waiting = waitingNames(room, match, youId).length;
  if (match.phase === "solving" && waiting > 0) return `${waiting} still solving`;
  const mine = youId ? match.points[youId] : undefined;
  return mine === undefined ? "Standings" : `You: ${mine} pt${mine === 1 ? "" : "s"}`;
}

function SidePanel(props: {
  room: RoomSnapshot;
  match: NonNullable<RoomSnapshot["match"]>;
  youId: string | null;
  names: Record<string, string>;
  isHost: boolean;
  actions: RoomActions;
  stats: ReturnType<typeof useSessionStats>;
  layout: ReturnType<typeof useLayout>;
}) {
  const { room, match, youId, actions } = props;
  const waiting = waitingText(waitingNames(room, match, youId));
  return (
    <>
      <div className="side-section">
        {props.layout === "wide" && <h3>Standings</h3>}
        {waiting && <p className="waiting-line">{waiting}</p>}
        <Standings
          room={room}
          match={match}
          youId={youId}
          names={props.names}
          pinMe={props.layout !== "wide"}
          compact={props.layout === "landscape"}
          onChangePenalty={actions.changePenalty}
        />
      </div>
      {props.isHost && (
        <HostPanel
          room={room}
          match={match}
          youId={youId}
          onSkip={actions.skip}
          onKick={actions.kick}
          onEndMatch={actions.endMatch}
          onRestart={actions.rematch}
        />
      )}
      <SessionPanel stats={props.stats} />
    </>
  );
}
