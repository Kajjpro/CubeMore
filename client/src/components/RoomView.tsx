/*
 * RoomView: the whole room screen, built only from props.
 * The real room (pages/RoomPage.tsx) and the /dev/states page both render it.
 *
 * Layouts (see DESIGN.md): phone = stage + bottom sheet with tabs,
 * landscape = stage + sidebar with tabs, wide = stage + 320 px sidebar with
 * Live Standings above Room Chat.
 *
 * Focus mode: from the moment you hold the timer until the solve is over, the
 * header, scramble, standings and chat fade out and only the digits stay.
 * While the timer runs everything except the timer is also frozen (it doesn't
 * re-render until the solve is over).
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { ChatMessage, Penalty, PlayerSnapshot, RoomSettings, RoomSnapshot } from "@cube-racing/shared";
import { useNewScrambleAlert } from "../alerts";
import { useLayout } from "../layout";
import { setPref, usePrefs, type InputMode, type RunningDisplay } from "../prefs";
import { useSessionStats } from "../session";
import type { TimerPhase } from "../timer/useSpeedTimer";
import type { CubeMoves } from "../useRoom";
import { useWakeLock } from "../wakeLock";
import { ChatPanel } from "./ChatPanel";
import { DEBUG, DebugPanel } from "./DebugPanel";
import { Lobby } from "./Lobby";
import { FinishLine, HostPanel, MatchOver, SessionPanel, SetResult, waitingNames, waitingText } from "./RoomPanels";
import { useReactionPops, type Reaction, type ReactionPops } from "./Reactions";
import { preloadScramblePreview, ScrambleBlock } from "./Scramble";
import { Standings } from "./Standings";
import { Timer, type TimerDemo } from "./Timer";
import { TopBar } from "./TopBar";
import { formatMark } from "../time";
import { Icon, ProgressBar } from "./ui";

export interface RoomActions {
  leave: () => void;
  start: () => void;
  /** In the lobby. `pin` is sent when the room becomes private or its PIN changes. */
  updateSettings: (changes: Partial<RoomSettings>, pin?: string) => void;
  kick: (player: PlayerSnapshot) => void;
  skip: (player: PlayerSnapshot) => void;
  endMatch: () => void;
  /** After a match, or in the middle of one; optionally with another event / format / time limit. */
  rematch: (changes?: Partial<Pick<RoomSettings, "cubeEvent" | "format" | "solveTimeLimit">>) => void;
  backToLobby: () => void;
  changePenalty: (solveIndex: number, penalty: Penalty) => void;
  dismissError: () => void;
  /** Returns an error to show, or null when sent. */
  sendChat: (text: string) => Promise<string | null>;
  /** React to another player's latest time. */
  react: (targetId: string, emoji: Reaction) => void;
}

/** Only for /dev/states. */
export interface RoomDemo {
  timer?: TimerDemo;
  sheetOpen?: boolean;
  menuOpen?: boolean;
  tab?: SideTab;
  unread?: number;
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
  chat: ChatMessage[];
  /** Other players' smart cube moves in the current solve. */
  cubeMoves?: CubeMoves;
  actions: RoomActions;
  demo?: RoomDemo;
}

type SideTab = "standings" | "chat";

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
  const phase = demo?.timer?.phase ?? timerPhase;
  const running = phase === "running";
  // Holding, ready or running: only the digits stay visible.
  const focus = phase === "holding" || phase === "ready" || running;
  // During a solve, everything but the timer keeps the last state (no re-renders).
  const room = useFrozen(props.room, running);
  const names = useNames(room);
  const stats = useSessionStats(props.room, youId);

  const [sheetOpen, setSheetOpen] = useState(demo?.sheetOpen ?? false);
  const [menuOpen, setMenuOpen] = useState(demo?.menuOpen ?? false);
  const [tab, setTab] = useState<SideTab>(demo?.tab ?? "standings");
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

  // The chat is "on screen" in the lobby, in the wide sidebar, or when its tab is open.
  const chatVisible = !match || layout === "wide" || (tab === "chat" && (layout === "landscape" || sheetOpen));
  const liveUnread = useUnread(props.chat, youId, chatVisible);
  const unread = demo?.unread ?? liveUnread;
  const online = room.players.filter((p) => p.status === "connected").length;
  const pops = useReactionPops(props.chat);
  const sidePanel = match && (
    <SidePanel
      {...{ room, match, youId, names, isHost, actions, stats, pops }}
      cubeMoves={props.cubeMoves ?? {}}
      pinMe={layout !== "wide"}
      showSession={layout === "landscape"}
    />
  );
  const chatPanel = (
    <ChatPanel
      messages={props.chat}
      youId={youId}
      online={online}
      connected={props.connected}
      active={chatVisible}
      onSend={actions.sendChat}
    />
  );

  return (
    <div className={`room ${match ? "in-match" : "in-lobby"} format-${room.settings.format}`} data-focus={focus}>
      <TopBar
        code={room.code}
        pin={room.pin}
        name={room.settings.name}
        settings={room.settings}
        status={roomStatus(room)}
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
          chat={chatPanel}
        />
      ) : (
        <div className="room-body">
          <section className="stage" aria-label="Solve">
            {match.scramble && (match.phase === "solving" || match.phase === "solve_review") && (
              <ScrambleBlock
                scramble={match.scramble}
                preview={prefs.preview}
                onTogglePreview={togglePreview}
                round={<RoundPips match={match} />}
              />
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
                  <div className="result-screen spectating">
                    <span className="hero-icon" aria-hidden>
                      <Icon name="eye" size={28} />
                    </span>
                    <h2>Spectating</h2>
                    <p className="small muted">You joined during this set. You race from the next set.</p>
                    <p className="small">{waitingText(waitingNames(room, match, youId))}</p>
                  </div>
                ))}
              {match.phase === "solve_review" && (
                <div className="stage-scroll">
                  <FinishLine match={match} names={names} youId={youId} pops={pops} onReact={actions.react} />
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
                    settings={room.settings}
                    onRematch={actions.rematch}
                    onBackToLobby={actions.backToLobby}
                  />
                </div>
              )}
            </div>
            {match.phase === "solving" && <SessionStrip stats={stats} />}
          </section>

          {layout === "phone" ? (
            <>
              <div className="scrim" data-open={sheetOpen} onClick={() => setSheetOpen(false)} aria-hidden />
              <div className="sheet" data-open={sheetOpen}>
                <button
                  type="button"
                  className="sheet-handle"
                  aria-expanded={sheetOpen}
                  onClick={() => setSheetOpen((open) => !open)}
                >
                  <span className="grabber" aria-hidden />
                  <Icon name="users" />
                  <span>Room · {room.players.length}</span>
                  {unread > 0 && !sheetOpen && <span className="badge">{unread}</span>}
                  <span className="grow" />
                  <span className="sheet-summary">{sheetOpen ? "Close" : sheetSummary(room, youId)}</span>
                  <Icon name="chevronUp" className="sheet-chevron" />
                </button>
                <div className="sheet-body" inert={!sheetOpen}>
                  <SideTabs tab={tab} onTab={setTab} unread={unread} standings={sidePanel} chat={chatPanel} />
                </div>
              </div>
            </>
          ) : layout === "landscape" ? (
            <aside className="side" aria-label="Room">
              <SideTabs tab={tab} onTab={setTab} unread={unread} standings={sidePanel} chat={chatPanel} />
            </aside>
          ) : (
            <aside className="side" aria-label="Room">
              <section className="side-panel standings-panel" aria-label="Live standings">
                <div className="panel-head">
                  <h3>
                    <Icon name="trophy" size={14} />
                    Live Standings
                  </h3>
                  <span className="tiny muted mono">{setLabel(match)}</span>
                </div>
                <div className="panel-scroll">{sidePanel}</div>
              </section>
              <section className="side-panel chat-panel" aria-label="Room chat">
                {chatPanel}
              </section>
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

/** The header's live status: "3/5 Solved", "6 players", "Set 2 done"... */
function roomStatus(room: RoomSnapshot): string {
  const match = room.match;
  if (!match) return `${room.players.length} player${room.players.length === 1 ? "" : "s"}`;
  if (match.phase === "set_result") return `Set ${match.setIndex + 1} done`;
  if (match.phase === "match_over") return "Match over";
  const solved = match.roster.filter((id) => match.results[id]?.[match.solveIndex]).length;
  return `${solved}/${match.roster.length} Solved`;
}

/** Above the scramble: "Set 2" and a pip for every solve of the set (done, now, still to come). */
function RoundPips({ match }: { match: NonNullable<RoomSnapshot["match"]> }) {
  const solves = match.solvesPerSet;
  return (
    <span className="round">
      <span className="round-set">Set {match.setIndex + 1}</span>
      {solves > 1 && (
        <>
          <span className={`pips ${solves > 5 ? "many" : ""}`} aria-hidden>
            {Array.from({ length: solves }, (_, i) => (
              <span key={i} className={`pip ${i < match.solveIndex ? "done" : i === match.solveIndex ? "now" : ""}`} />
            ))}
          </span>
          <span className="round-solve mono">
            <span className="sr-only">Solve </span>
            {match.solveIndex + 1}/{solves}
          </span>
        </>
      )}
    </span>
  );
}

/**
 * Under the timer: your session, like csTimer's stats (the current ao5 and
 * ao12). A new session best single or ao5 gets a "new" badge.
 */
function SessionStrip({ stats }: { stats: ReturnType<typeof useSessionStats> }) {
  const show = (value: number | null | undefined) => (value === undefined ? "–" : formatMark(value ?? "DNF"));
  const newBest = stats.solves > 1 && stats.last != null && stats.last === stats.best;
  const newAo5 = stats.solves > 5 && stats.ao5 != null && stats.ao5 === stats.bestAo5;
  const items: { label: string; value: string; fresh?: boolean }[] = [
    { label: "solves", value: String(stats.solves) },
    { label: "best", value: stats.solves ? show(stats.best) : "–", fresh: newBest },
    { label: "ao5", value: show(stats.ao5), fresh: newAo5 },
    { label: "ao12", value: show(stats.ao12) },
    { label: "mean", value: stats.solves ? show(stats.mean) : "–" },
  ];
  return (
    <dl className="session-strip" aria-label="Your session">
      {items.map(({ label, value, fresh }) => (
        <div key={label} className={fresh ? "fresh" : ""}>
          <dt>{label}</dt>
          <dd>{value}</dd>
          {fresh && <span className="pb-badge">new best</span>}
        </div>
      ))}
    </dl>
  );
}

/** "Set 2 · Solve 3/5" above the standings. */
function setLabel(match: NonNullable<RoomSnapshot["match"]>): string {
  const solve = match.solvesPerSet > 1 ? ` · Solve ${match.solveIndex + 1}/${match.solvesPerSet}` : "";
  return `Set ${match.setIndex + 1}${solve}`;
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

/**
 * How many chat messages from other players arrived while the chat was not on
 * screen. Messages from before you joined (the history) count as read.
 */
function useUnread(messages: ChatMessage[], youId: string | null, visible: boolean): number {
  // Server time of the newest message you have seen (null until the history arrives).
  const [seenAt, setSeenAt] = useState<number | null>(null);
  const newest = messages.at(-1)?.at ?? null;
  useEffect(() => {
    if (newest !== null && (visible || seenAt === null)) setSeenAt(newest);
  }, [newest, visible, seenAt]);
  if (visible || seenAt === null) return 0;
  return messages.filter((m) => m.kind === "user" && m.senderId !== youId && m.at > seenAt).length;
}

/** Standings | Chat tabs, for the landscape sidebar and the phone sheet. Both stay mounted (the chat keeps its draft). */
function SideTabs(props: { tab: SideTab; onTab: (tab: SideTab) => void; unread: number; standings: ReactNode; chat: ReactNode }) {
  const tabs: { id: SideTab; label: string }[] = [
    { id: "standings", label: "Standings" },
    { id: "chat", label: "Chat" },
  ];
  return (
    <div className="side-tabs">
      <div className="tabs" role="tablist" aria-label="Room">
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={props.tab === id}
            aria-controls={`tabpanel-${id}`}
            onClick={() => props.onTab(id)}
            data-dense
          >
            {label}
            {id === "chat" && props.unread > 0 && <span className="badge">{props.unread}</span>}
          </button>
        ))}
      </div>
      <div className="tab-panel standings-panel" role="tabpanel" id="tabpanel-standings" aria-labelledby="tab-standings" hidden={props.tab !== "standings"}>
        {props.standings}
      </div>
      <div className="tab-panel chat-panel" role="tabpanel" id="tabpanel-chat" aria-labelledby="tab-chat" hidden={props.tab !== "chat"}>
        {props.chat}
      </div>
    </div>
  );
}

function SidePanel(props: {
  room: RoomSnapshot;
  match: NonNullable<RoomSnapshot["match"]>;
  youId: string | null;
  names: Record<string, string>;
  isHost: boolean;
  actions: RoomActions;
  stats: ReturnType<typeof useSessionStats>;
  /** Phones and landscape: your own row first. */
  pinMe: boolean;
  /** Landscape phones have no room for the session strip under the timer: the stats go here. */
  showSession: boolean;
  pops: ReactionPops;
  cubeMoves: CubeMoves;
}) {
  const { room, match, youId, actions } = props;
  const waiting = waitingText(waitingNames(room, match, youId));
  return (
    <>
      <div className="side-section">
        {waiting && (
          <p className="waiting-line">
            <span className="dot live" aria-hidden />
            {waiting}
          </p>
        )}
        <Standings
          room={room}
          match={match}
          youId={youId}
          names={props.names}
          pinMe={props.pinMe}
          pops={props.pops}
          cubeMoves={props.cubeMoves}
          onChangePenalty={actions.changePenalty}
          onReact={actions.react}
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
      {props.showSession && <SessionPanel stats={props.stats} />}
    </>
  );
}
