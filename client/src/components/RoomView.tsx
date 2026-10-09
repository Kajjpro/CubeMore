/*
 * RoomView: the whole room screen, built only from props.
 * The real room (pages/RoomPage.tsx) and the /dev/states page both render it.
 *
 * Layouts (see DESIGN.md). The standings are the most important thing after
 * the timer, so they are always on screen:
 *  phone     = stage with the standings right under the timer, plus a bottom
 *              sheet for the chat, your stats and the host controls
 *  landscape = stage + sidebar (Standings | Chat tabs)
 *  wide      = stage + a wide standings column (Standings | Chat tabs)
 *
 * Focus mode: from the moment you hold the timer until the solve is over, the
 * header, scramble, standings and chat fade out and only the digits stay.
 * While the timer runs everything except the timer is also frozen (it doesn't
 * re-render until the solve is over).
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { ChatMessage, CubeEventId, Penalty, PlayerSnapshot, RoomSettings, RoomSnapshot } from "@cube-racing/shared";
import { useNewScrambleAlert } from "../alerts";
import { solveKey, useOutbox } from "../outbox";
import { useLayout } from "../layout";
import { canPickEvent, eventOf, scrambleFor } from "../mixed";
import { setPref, usePrefs, type InputMode, type RunningDisplay } from "../prefs";
import { useSessionStats } from "../session";
import type { TimerPhase } from "../timer/useSpeedTimer";
import type { CubeMoves } from "../useRoom";
import { useWakeLock } from "../wakeLock";
import { ChatPanel } from "./ChatPanel";
import { ConfirmButton } from "./ConfirmButton";
import { DEBUG, DebugPanel } from "./DebugPanel";
import { Lobby } from "./Lobby";
import { RoomSetup, WarmupRoom } from "./WaitingRoom";
import { FinishLine, HostPanel, MatchOver, SessionPanel, SetResult, waitingNames, waitingText } from "./RoomPanels";
import { useReactionPops, type Reaction, type ReactionPops } from "./Reactions";
import { preloadScramblePreview, ScrambleBlock } from "./Scramble";
import { MixedEventPicker } from "./SettingsForm";
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
  /** Mixed rooms: the event you race. */
  chooseEvent: (cubeEvent: CubeEventId) => void;
  /** Step away and just watch (true), or race again from the next set (false). */
  setWatching: (watching: boolean) => void;
  /** Host: setup done, open the room. */
  openRoom: () => void;
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

type SideTab = "standings" | "chat" | "stats" | "host";

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
  // The phone sheet has no Standings tab (they're on the stage): it opens on the chat.
  const [sheetTab, setSheetTab] = useState<SideTab>(demo?.tab && demo.tab !== "standings" ? demo.tab : "chat");
  useEffect(() => {
    // Getting ready or solving: never cover the timer.
    if (timerPhase === "holding" || timerPhase === "ready" || timerPhase === "running") {
      setSheetOpen(false);
      setMenuOpen(false);
    }
  }, [timerPhase]);

  useWakeLock(true);

  const lobbyEvent = room.match ? null : eventOf(room, youId);
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
  const scramble = scrambleFor(room, youId);
  // Your time for this solve is in (or stopped and on its way): the scramble you
  // just solved is hidden while you wait for the others. The next one shows when it starts.
  const outbox = useOutbox();
  const doneThisSolve =
    !!match &&
    !!youId &&
    (match.results[youId]?.[match.solveIndex] != null ||
      !!(demo ? demo.timer?.pending : outbox.find((e) => solveKey(e) === solveKey({ roomCode: room.code, matchId: match.matchId, setIndex: match.setIndex, solveIndex: match.solveIndex }))));
  const me = room.players.find((p) => p.id === youId) ?? null;
  // Open and waiting alone (or still finishing a warm-up solve when someone
  // joins): the warm-up timer. Then the lobby and its countdown take over.
  const alone = room.players.filter((p) => p.id !== youId && !p.watching).length === 0;
  const midWarmup = phase === "holding" || phase === "ready" || phase === "running" || me?.timerStatus === "solving";
  const warmingUp = !room.weekly && !room.setup && !!me && !me.watching && !room.bestOfLocked && (alone || midWarmup);
  // Stepping away during a set you're in turns your remaining solves into DNFs (the menu asks first).
  const awayCostsSolves =
    !!match && !!youId && (match.phase === "solving" || match.phase === "solve_review") && !!match.results[youId]?.some((r) => r === null);

  // The chat is "on screen" in the lobby, or when its tab is open.
  const chatVisible = !match || (layout === "phone" ? sheetOpen && sheetTab === "chat" : tab === "chat");
  const liveUnread = useUnread(props.chat, youId, chatVisible);
  const unread = demo?.unread ?? liveUnread;
  const online = room.players.filter((p) => p.status === "connected").length;
  const pops = useReactionPops(props.chat);
  const standings = match && (
    <StandingsBlock
      {...{ room, match, youId, names, actions, pops }}
      cubeMoves={props.cubeMoves ?? {}}
      pinMe={layout === "landscape"}
      showWaiting={layout !== "phone"}
    />
  );
  const hostPanel = match && isHost && (
    <HostPanel
      room={room}
      match={match}
      youId={youId}
      onSkip={actions.skip}
      onKick={actions.kick}
      onEndMatch={actions.endMatch}
      onRestart={actions.rematch}
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
        setup={room.setup}
        watching={me ? me.watching : null}
        awayCostsSolves={awayCostsSolves}
        onSetWatching={actions.setWatching}
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

      {!match && room.setup && isHost ? (
        <RoomSetup
          room={room}
          busy={props.starting}
          onUpdateSettings={actions.updateSettings}
          onOpen={actions.openRoom}
          onLeave={actions.leave}
        />
      ) : !match && warmingUp ? (
        <WarmupRoom
          room={room}
          youId={youId}
          isHost={isHost}
          onUpdateSettings={actions.updateSettings}
          onChooseEvent={actions.chooseEvent}
          onPhaseChange={onPhaseChange}
          chat={chatPanel}
        />
      ) : !match ? (
        <Lobby
          room={room}
          youId={youId}
          isHost={isHost}
          starting={props.starting}
          onStart={actions.start}
          onKick={actions.kick}
          onUpdateSettings={actions.updateSettings}
          onChooseEvent={actions.chooseEvent}
          onSetWatching={actions.setWatching}
          chat={chatPanel}
        />
      ) : (
        <div className="room-body">
          <section className="stage" aria-label="Solve">
            {/* While others solve, the stage itself says you're watching (with this button); between solves, this bar. */}
            {me?.watching && match.phase !== "match_over" && match.phase !== "solving" && (
              <div className="watching-bar" role="status">
                <span className="grow">
                  <b>You're watching.</b> Nobody waits for you.
                </span>
                <button type="button" className="primary" onClick={() => actions.setWatching(false)}>
                  Race again
                </button>
              </div>
            )}
            {scramble && match.phase === "solving" && !doneThisSolve && (
              <ScrambleBlock
                scramble={scramble}
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
                    smartOnly={room.settings.smartOnly}
                    waiting={waitingText(waitingNames(props.room, live, youId))}
                    onPhaseChange={onPhaseChange}
                    demo={demo?.timer}
                  />
                ) : (
                  <div className="result-screen spectating">
                    <h2>{me?.watching ? "Watching" : "Spectating"}</h2>
                    <p className="small muted">
                      {me?.watching
                        ? "Take your time. Tap \"Race again\" when you're back: you join from the next set."
                        : "You joined during this set. You race from the next set."}
                    </p>
                    <p className="small spectating-waiting">{waitingText(waitingNames(room, match, youId))}</p>
                    {me?.watching && (
                      <button type="button" className="primary" onClick={() => actions.setWatching(false)}>
                        Race again
                      </button>
                    )}
                    {canPickEvent(room, youId) && (
                      <MixedEventPicker label="Your event" value={eventOf(room, youId)} onChange={actions.chooseEvent} />
                    )}
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
                    nextEvent={room.players.find((p) => p.id === youId)?.cubeEvent ?? room.settings.cubeEvent}
                    onChooseEvent={actions.chooseEvent}
                    onRematch={actions.rematch}
                    onBackToLobby={actions.backToLobby}
                  />
                </div>
              )}
            </div>
            {match.phase === "solving" && youId && match.roster.includes(youId) && (
              <TimerTools
                inputMode={demo?.inputMode ?? prefs.inputMode}
                smartOnly={room.settings.smartOnly}
                awayCostsSolves={awayCostsSolves}
                onWatch={() => actions.setWatching(true)}
              />
            )}
            {match.phase === "solving" && layout === "phone" && (
              <section className="stage-standings" aria-label="Standings">
                {standings}
              </section>
            )}
            {match.phase === "solving" && layout === "wide" && <SessionStrip stats={stats} />}
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
                  <span>{isHost ? "Chat, stats and host" : "Chat and stats"}</span>
                  {unread > 0 && !sheetOpen && <span className="badge">{unread}</span>}
                  <span className="grow" />
                  {sheetOpen && <span className="sheet-summary">Close</span>}
                  <Icon name="chevronUp" className="sheet-chevron" />
                </button>
                <div className="sheet-body" inert={!sheetOpen}>
                  <SideTabs
                    tab={sheetTab}
                    onTab={setSheetTab}
                    items={[
                      { id: "chat", label: "Chat", badge: unread, content: chatPanel },
                      { id: "stats", label: "Your stats", content: <SessionPanel stats={stats} open /> },
                      ...(hostPanel ? [{ id: "host" as const, label: "Host", content: hostPanel }] : []),
                    ]}
                  />
                </div>
              </div>
            </>
          ) : (
            <aside className="side" aria-label="Room">
              <SideTabs
                tab={tab}
                onTab={setTab}
                items={[
                  {
                    id: "standings",
                    label: "Standings",
                    content: (
                      <>
                        {standings}
                        {hostPanel}
                        {layout === "landscape" && <SessionPanel stats={stats} />}
                      </>
                    ),
                  },
                  { id: "chat", label: "Chat", badge: unread, content: chatPanel },
                ]}
              />
            </aside>
          )}
        </div>
      )}

      <div className="focus-offline" role="status">
        {!props.connected && (
          <>
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

/**
 * Right under the timer, always in sight: type your times in instead of
 * timing, and step away to just watch. (Both are in the Menu too.)
 */
function TimerTools(props: { inputMode: InputMode; smartOnly: boolean; awayCostsSolves: boolean; onWatch: () => void }) {
  return (
    <div className="timer-tools" role="group" aria-label="Timer options">
      {!props.smartOnly && (
        <div className="mini-toggle" role="radiogroup" aria-label="How you enter times">
          {(
            [
              ["timer", "Timer"],
              ["typing", "Type in"],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={props.inputMode === mode}
              onClick={() => setPref("inputMode", mode)}
              data-dense
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <span className="grow" />
      {props.awayCostsSolves ? (
        <ConfirmButton className="quiet watch-button" label="Watch" confirmLabel="Tap again: rest of set is DNF" onConfirm={props.onWatch} dense />
      ) : (
        <button type="button" className="quiet watch-button" onClick={props.onWatch} data-dense>
          Watch
        </button>
      )}
    </div>
  );
}

/** Above the scramble: "Set 2, solve 3 of 5". */
function RoundPips({ match }: { match: NonNullable<RoomSnapshot["match"]> }) {
  return (
    <span className="round">
      Set {match.setIndex + 1}
      {match.solvesPerSet > 1 && `, solve ${match.solveIndex + 1} of ${match.solvesPerSet}`}
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

/** Tabs for the sidebar and the phone sheet. Every panel stays mounted (the chat keeps its draft). */
function SideTabs(props: {
  tab: SideTab;
  onTab: (tab: SideTab) => void;
  items: { id: SideTab; label: string; badge?: number; content: ReactNode }[];
}) {
  const current = props.items.some((item) => item.id === props.tab) ? props.tab : props.items[0].id;
  return (
    <div className="side-tabs">
      <div className="tabs" role="tablist" aria-label="Room">
        {props.items.map(({ id, label, badge }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={current === id}
            aria-controls={`tabpanel-${id}`}
            onClick={() => props.onTab(id)}
            data-dense
          >
            {label}
            {!!badge && current !== id && <span className="badge">{badge}</span>}
          </button>
        ))}
      </div>
      {props.items.map(({ id, content }) => (
        <div
          key={id}
          className={`tab-panel ${id}-panel`}
          role="tabpanel"
          id={`tabpanel-${id}`}
          aria-labelledby={`tab-${id}`}
          hidden={current !== id}
        >
          {content}
        </div>
      ))}
    </div>
  );
}

/** "Waiting for Bat and 2 others" and the live standings table. */
function StandingsBlock(props: {
  room: RoomSnapshot;
  match: NonNullable<RoomSnapshot["match"]>;
  youId: string | null;
  names: Record<string, string>;
  actions: RoomActions;
  /** Landscape phones: your own row first. */
  pinMe: boolean;
  /** Phones already say who you're waiting for under the timer. */
  showWaiting: boolean;
  pops: ReactionPops;
  cubeMoves: CubeMoves;
}) {
  const { room, match, youId, actions } = props;
  const waiting = props.showWaiting && match.phase === "solving" ? waitingText(waitingNames(room, match, youId)) : null;
  return (
    <div className="standings-block">
      {waiting && <p className="waiting-line">{waiting}</p>}
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
  );
}
