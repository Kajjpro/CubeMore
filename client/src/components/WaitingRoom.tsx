// Before the first race in a new room:
//  1. RoomSetup: the host sets the room up. Nobody else can see or join it yet.
//  2. WarmupRoom: the room is open; the host waits alone on the timer with
//     warm-up solves (they don't count). The race starts when someone joins.

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ClientEvents, type CubeEventId, type PlayerSnapshot, type RoomSettings, type RoomSnapshot, type Scramble } from "@cube-racing/shared";
import { settingsSummary } from "../labels";
import { eventOf } from "../mixed";
import { setPref, usePrefs } from "../prefs";
import { request, socket } from "../socket";
import { trimmedAverage } from "../stats";
import { formatMark, formatTime } from "../time";
import { useSpeedTimer, type TimerPhase } from "../timer/useSpeedTimer";
import { preloadScramblePreview, ScrambleBlock } from "./Scramble";
import { LobbySettings, MixedEventPicker } from "./SettingsForm";
import { HoldMeter, RunningDigits } from "./Timer";
import { roomLink, useCopy } from "./TopBar";
import { Icon, RoomEventIcon } from "./ui";

/** Step 1: the host's settings, then "Open room". Only the host is here. */
export function RoomSetup(props: {
  room: RoomSnapshot;
  onUpdateSettings: (changes: Partial<RoomSettings>, pin?: string) => void;
  onOpen: () => void;
  onLeave: () => void;
  busy: boolean;
}) {
  const { room } = props;
  return (
    <main className="room-setup">
      <section className="panel section setup-card">
        <div className="setup-head">
          <h1>Set up your room</h1>
          <p className="small muted">Only you can see it for now. When it's ready, open it: then cubers can join, and the race starts as soon as someone does.</p>
        </div>
        <LobbySettings settings={room.settings} pin={room.pin} bestOfLocked={room.bestOfLocked} onChange={props.onUpdateSettings} />
      </section>
      <div className="start-bar">
        <div className="inner">
          <button type="button" className="quiet" onClick={props.onLeave}>
            Cancel
          </button>
          <p className="grow small muted hide-narrow">{settingsSummary(room.settings)}</p>
          <button type="button" className="primary" onClick={props.onOpen} disabled={props.busy}>
            Open room
          </button>
        </div>
      </div>
    </main>
  );
}

/** Tells the room our warm-up timer runs (it holds the race start back) or stopped. */
function sendTimerStatus(status: "solving" | "idle"): void {
  void request(ClientEvents.TIMER_STATUS, { status });
}

/**
 * Step 2: open, waiting alone. The invite (link, and code + PIN for a private
 * room) on one side; a warm-up timer with real scrambles of your event on the
 * other. If someone joins mid-solve, the race waits until you stop the timer.
 */
export function WarmupRoom(props: {
  room: RoomSnapshot;
  youId: string | null;
  isHost: boolean;
  onUpdateSettings: (changes: Partial<RoomSettings>, pin?: string) => void;
  onChooseEvent: (cubeEvent: CubeEventId) => void;
  onPhaseChange: (phase: TimerPhase) => void;
  chat: ReactNode;
}) {
  const { room, youId } = props;
  const prefs = usePrefs();
  const [copied, copy] = useCopy(room.code, room.pin);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isPrivate = room.settings.visibility === "private";
  const myEvent = eventOf(room, youId);
  const { scramble, next } = useWarmupScramble(myEvent);
  const [times, setTimes] = useState<number[]>([]);
  const others = room.players.filter((p) => p.id !== youId && !p.watching);

  return (
    <main className="warmup">
      <section className="panel warmup-invite" aria-labelledby="warmup-title">
        <div className="share-title">
          <span className="event-chip large">
            <RoomEventIcon settings={room.settings} />
          </span>
          <div className="grow">
            <h1 id="warmup-title">{room.settings.name}</h1>
            <p className="small muted">{settingsSummary(room.settings)}</p>
          </div>
          <span className={`tag ${isPrivate ? "tag-lock" : "tag-open"}`}>{isPrivate ? "Private" : "Public"}</span>
        </div>

        {others.length > 0 ? (
          <JoinedNote names={others} />
        ) : (
          <p className="waiting-line">
            Waiting for cubers to join. {isPrivate ? "Send them the invite link." : "Your room is on the home page, or send the link."} The race starts as soon as someone joins.
          </p>
        )}

        {isPrivate && (
          <p className="pin-line">
            Room <span className="mono">{room.code}</span>
            {room.pin && (
              <>
                , PIN <span className="mono">{room.pin}</span>
              </>
            )}
          </p>
        )}
        <div className="share-actions">
          <button type="button" className="grow" onClick={copy}>
            <Icon name={copied ? "check" : "link"} size={16} />
            {copied ? "Copied" : isPrivate ? "Copy invite link" : "Copy link"}
          </button>
          {typeof navigator.share === "function" && matchMedia("(hover: none)").matches && (
            <button
              type="button"
              onClick={() => void navigator.share({ title: room.settings.name, url: roomLink(room.code, room.pin) }).catch(() => {})}
            >
              Share
            </button>
          )}
        </div>

        {room.settings.mixedEvents && youId && <MixedEventPicker value={myEvent} onChange={props.onChooseEvent} />}

        {props.isHost && (
          <div className="warmup-settings">
            <button type="button" className="quiet with-icon" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((open) => !open)}>
              <Icon name="chevronUp" size={16} className={settingsOpen ? "" : "flip"} />
              Race settings
            </button>
            {settingsOpen && (
              <LobbySettings settings={room.settings} pin={room.pin} bestOfLocked={room.bestOfLocked} onChange={props.onUpdateSettings} />
            )}
          </div>
        )}
      </section>

      <section className="warmup-stage" aria-label="Warm-up">
        {scramble ? (
          <ScrambleBlock
            scramble={scramble}
            preview={prefs.preview}
            onTogglePreview={() => setPref("preview", prefs.preview === "3d" ? "2d" : "3d")}
            round={<span className="round">Warm-up, doesn't count</span>}
          />
        ) : (
          <div className="scramble-wrap warmup-loading">
            <span className="small muted">Getting a scramble…</span>
          </div>
        )}
        <WarmupTimer
          scrambleKey={scramble?.text ?? ""}
          onPhaseChange={props.onPhaseChange}
          onDone={(ms) => {
            setTimes((list) => [...list, ms].slice(-12));
            next();
          }}
        />
        <WarmupTimes times={times} />
      </section>

      <section className="panel lobby-chat warmup-chat" aria-label="Room chat">
        {props.chat}
      </section>
    </main>
  );
}

/** "Anu joined. The race starts when you stop the timer." */
function JoinedNote({ names }: { names: PlayerSnapshot[] }) {
  const who = names.length === 1 ? `${names[0].nickname} joined` : `${names.length} cubers joined`;
  return (
    <p className="waiting-line joined-line" role="status">
      <b>{who}.</b> The race starts when you stop the timer.
    </p>
  );
}

/** A warm-up scramble of `cubeEvent` from the server, and a way to get the next one. */
function useWarmupScramble(cubeEvent: CubeEventId): { scramble: Scramble | null; next: () => void } {
  const [scramble, setScramble] = useState<Scramble | null>(null);
  const [round, setRound] = useState(0);
  const next = useCallback(() => setRound((r) => r + 1), []);

  useEffect(() => {
    preloadScramblePreview(cubeEvent);
    let stopped = false;
    const load = () =>
      void request(ClientEvents.WARMUP_SCRAMBLE, {}).then((response) => {
        if (!stopped && response.ok) setScramble(response.scramble);
      });
    if (socket.connected) load();
    else socket.once("connect", load);
    return () => {
      stopped = true;
      socket.off("connect", load);
    };
  }, [cubeEvent, round]);

  // Another event picked: that event's scramble, not the old one.
  return { scramble: scramble?.cubeEvent === cubeEvent ? scramble : null, next };
}

/** The warm-up timer: hold, let go, any key or tap stops. Nothing is sent but "solving" / "idle". */
function WarmupTimer(props: { scrambleKey: string; onDone: (ms: number) => void; onPhaseChange: (phase: TimerPhase) => void }) {
  const prefs = usePrefs();
  const [touchArea, setTouchArea] = useState<HTMLDivElement | null>(null);
  const [last, setLast] = useState<number | null>(null);
  const timer = useSpeedTimer({
    canStart: props.scrambleKey !== "",
    onStart: () => sendTimerStatus("solving"),
    onStop: (ms) => {
      setLast(ms);
      sendTimerStatus("idle");
      props.onDone(ms);
    },
    touchArea,
  });

  // A new scramble: ready for the next solve.
  const { reset, phase } = timer;
  useEffect(() => reset(), [props.scrambleKey, reset]);
  const { onPhaseChange } = props;
  useEffect(() => onPhaseChange(phase), [phase, onPhaseChange]);
  // Leaving the page mid-solve: the race mustn't wait for a timer nobody stops.
  useEffect(() => () => sendTimerStatus("idle"), []);

  const hint =
    phase === "holding" ? "Hold…" : phase === "ready" ? "Release to start" : phase === "running" ? "" : "Hold Space (or the timer), let go to start";

  return (
    <div className="timer-zone warmup-timer" data-phase={phase}>
      <div ref={setTouchArea} className="timer-touch" role="button" tabIndex={-1} aria-label="Warm-up timer. Hold, then let go to start. Tap or press any key to stop.">
        {phase === "running" ? (
          <RunningDigits startedAt={timer.startedAt} display={prefs.runningDisplay} />
        ) : (
          <div className="timer-digits mono" aria-live="polite">
            {last === null ? "0.00" : formatTime(last)}
          </div>
        )}
        <HoldMeter />
        <p className="timer-hint">{hint}</p>
      </div>
    </div>
  );
}

/** Your warm-up times (newest first) with the ao5 and ao12 so far. */
function WarmupTimes({ times }: { times: number[] }) {
  if (times.length === 0) return null;
  const results = times.map((timeMs) => ({ timeMs, penalty: "OK" as const, source: "submitted" as const }));
  const ao5 = results.length >= 5 ? trimmedAverage(results.slice(-5)) : undefined;
  const ao12 = results.length >= 12 ? trimmedAverage(results.slice(-12)) : undefined;
  return (
    <div className="warmup-times" aria-label="Your warm-up times">
      <ol>
        {[...times].reverse().slice(0, 5).map((ms, i) => (
          <li key={times.length - i} className="mono">
            {formatTime(ms)}
          </li>
        ))}
      </ol>
      {ao5 !== undefined && <span className="small muted">ao5 {formatMark(ao5 ?? "DNF")}</span>}
      {ao12 !== undefined && <span className="small muted">ao12 {formatMark(ao12 ?? "DNF")}</span>}
    </div>
  );
}
