import { useEffect, useState, type ReactNode } from "react";
import {
  AUTO_START_DELAY_MS,
  getCubeEvent,
  type CubeEventId,
  type PlayerSnapshot,
  type RoomSettings,
  type RoomSnapshot,
} from "@cube-racing/shared";
import { serverNow } from "../clock";
import { EVENT_SHORT, nameList, settingsSummary } from "../labels";
import { SITE } from "../site";
import { eventOf } from "../mixed";
import { PlayerList } from "./RoomPanels";
import { LobbySettings, MixedEventPicker } from "./SettingsForm";
import { roomLink, useCopy } from "./TopBar";
import { RoomEventIcon } from "./ui";

interface Props {
  room: RoomSnapshot;
  youId: string | null;
  isHost: boolean;
  starting: boolean;
  onStart: () => void;
  onKick: (player: PlayerSnapshot) => void;
  onUpdateSettings: (changes: Partial<RoomSettings>, pin?: string) => void;
  /** Mixed rooms: pick the event you race. */
  onChooseEvent: (cubeEvent: CubeEventId) => void;
  /** Just watch the next race, or race. */
  onSetWatching: (watching: boolean) => void;
  /** The room chat (built by RoomView). */
  chat: ReactNode;
}

/** Phones can hand the invite to WhatsApp, Messenger…; elsewhere copying is enough. */
const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function" && matchMedia("(hover: none)").matches;

/**
 * Before a race. Alone, "Copy link" comes first (and for a private room, its
 * code and PIN; a public room is on the home page, so it needs no code). There's no
 * need to press Start: the race starts by itself 3 seconds after someone joins.
 */
export function Lobby({ room, youId, isHost, starting, onStart, onKick, onUpdateSettings, onChooseEvent, onSetWatching, chat }: Props) {
  const mixed = room.settings.mixedEvents;
  const [copied, copy] = useCopy(room.code, room.pin);
  const alone = room.players.length === 1;
  const isPrivate = room.settings.visibility === "private";
  const copyLabel = copied ? "Copied" : isPrivate ? "Copy invite link" : "Copy link";
  // The countdown waits for people picking their event (mixed rooms) or finishing a warm-up solve.
  const waitingFor = room.weekly ? null : startHeldBy(room, youId);
  const me = room.players.find((p) => p.id === youId) ?? null;
  const secondsLeft = useSecondsLeft(waitingFor ? null : room.autoStartAt, !room.weekly);

  function share(): void {
    void navigator
      .share({
        title: room.settings.name,
        text: isPrivate ? `Race me on ${SITE.name}: room ${room.code}` : `Race me on ${SITE.name}`,
        url: roomLink(room.code, room.pin),
      })
      .catch(() => {});
  }

  return (
    <main className="lobby">
      {me?.pickingEvent && <PickEventCard current={me.cubeEvent} onReady={onChooseEvent} />}
      {/* Two columns on wide screens; on phones the columns dissolve into one list (display: contents). */}
      <div className="lobby-col">
        <section className="panel share" data-alone={alone} style={{ gridArea: "share" }}>
          <div className="share-title">
            <span className="event-chip large">
              <RoomEventIcon settings={room.settings} />
            </span>
            <div className="grow">
              <h2>{room.settings.name}</h2>
              <p className="small muted">{settingsSummary(room.settings)}</p>
            </div>
            <span className={`tag ${isPrivate ? "tag-lock" : "tag-open"}`}>{isPrivate ? "Private" : "Public"}</span>
          </div>

          {isPrivate && (
            <div className="share-code">
              <span className="field-label">Room code</span>
              <p className="big-code code-tiles" aria-label={`Room code ${room.code.split("").join(" ")}`}>
                {room.code.split("").map((char, i) => (
                  <span key={i} className="code-tile" aria-hidden>
                    {char}
                  </span>
                ))}
              </p>
              {room.pin && (
                <p className="pin-line">
                  PIN <span className="mono">{room.pin}</span>
                </p>
              )}
            </div>
          )}

          <div className="share-actions">
            <button type="button" className={alone ? "primary grow" : "grow"} onClick={copy}>
              {copyLabel}
            </button>
            {canShare && (
              <button type="button" onClick={share}>
                Share
              </button>
            )}
          </div>
          {alone && (
            <p className="small muted">
              {isPrivate
                ? "Listed on the home page, but joining needs the PIN. The invite link includes it."
                : "Listed on the home page. You can also send the link."}
            </p>
          )}
        </section>

        <section className="panel section settings-card" style={{ gridArea: "settings" }}>
          <h2 className="card-title">Race settings</h2>
          {isHost ? (
            <LobbySettings
              settings={room.settings}
              pin={room.pin}
              bestOfLocked={room.bestOfLocked}
              onChange={onUpdateSettings}
            />
          ) : (
            <div className="settings-summary">
              <span className="event-chip large">
                <RoomEventIcon settings={room.settings} />
              </span>
              <div>
                <b>{mixed ? "Mixed events" : getCubeEvent(room.settings.cubeEvent).name}</b>
                <p className="small muted">{settingsSummary(room.settings)}</p>
                <p className="tiny muted">
                  {mixed ? "Everyone picks their own event. The host picks the format." : "The host picks the event and format."}
                </p>
              </div>
            </div>
          )}
        </section>
      </div>

      <div className="lobby-col">
        <section className="panel section players-card" style={{ gridArea: "players" }}>
          <h2 className="card-title">
            Racers
            <span className="count-pill">
              {room.players.length}/{room.settings.maxPlayers}
            </span>
          </h2>
          {mixed && youId && <MixedEventPicker value={eventOf(room, youId)} onChange={onChooseEvent} />}
          <PlayerList
            players={room.players}
            hostId={room.hostId}
            youId={youId}
            onKick={isHost ? onKick : undefined}
            onSetWatching={onSetWatching}
            seats
            showEvents={mixed}
          />
        </section>

        <section className="panel lobby-chat" style={{ gridArea: "chat" }} aria-label="Room chat">
          {chat}
        </section>
      </div>

      {secondsLeft !== null && (
        <div className="countdown-burst" aria-hidden>
          <span key={secondsLeft} className="burst-number">
            {secondsLeft > 0 ? secondsLeft : "GO"}
          </span>
        </div>
      )}

      <div className="start-bar" data-counting={secondsLeft !== null}>
        <div className="inner">
          <StartBar
            room={room}
            isHost={isHost}
            alone={alone}
            starting={starting}
            onStart={onStart}
            secondsLeft={secondsLeft}
            waitingFor={room.autoStartAt !== null ? waitingFor : null}
          />
        </div>
      </div>
    </main>
  );
}

/** Whole seconds until `endsAt` (server time), updated a few times a second. */
function useSecondsLeft(endsAt: number | null, capped: boolean): number | null {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    if (endsAt === null) return;
    const interval = setInterval(() => setNow(serverNow()), 200);
    return () => clearInterval(interval);
  }, [endsAt]);
  if (endsAt === null) return null;
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000));
  // Capped, so a slightly-off clock never shows "4" for a 3-second countdown (not the weekly race's).
  return capped ? Math.min(AUTO_START_DELAY_MS / 1000, left) : left;
}

/**
 * The bar at the bottom of the lobby:
 *  - someone joined: "Race starts in 3" (the host can start right away);
 *  - alone: waiting for someone, or practise alone;
 *  - back in the lobby after a match: the host starts the next race.
 */
function StartBar(props: {
  room: RoomSnapshot;
  isHost: boolean;
  alone: boolean;
  starting: boolean;
  onStart: () => void;
  secondsLeft: number | null;
  /** "Waiting for Anu to pick an event": the countdown starts once they're ready. */
  waitingFor: string | null;
}) {
  const { secondsLeft } = props;
  // The weekly race: no host, it starts on the minute for everyone here.
  if (props.room.weekly) {
    const clock = secondsLeft === null ? null : `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`;
    return (
      <p className="grow countdown" role="status">
        {clock ? (
          <>
            The weekly race starts in <span className="mono">{clock}</span>. Connect your smart cube.
          </>
        ) : (
          "The weekly race is over."
        )}
      </p>
    );
  }
  const startButton = (label: string, primary: boolean) =>
    props.isHost && (
      <button type="button" className={primary ? "primary" : ""} onClick={props.onStart} disabled={props.starting}>
        {props.starting ? "Starting…" : label}
      </button>
    );

  if (props.waitingFor) {
    return (
      <>
        <p className="grow countdown" role="status">
          {props.waitingFor}
        </p>
        {startButton("Start now", false)}
      </>
    );
  }
  if (secondsLeft !== null) {
    return (
      <>
        <span className="start-ring" aria-hidden>
          <span key={secondsLeft}>{secondsLeft}</span>
        </span>
        <p className="grow countdown" role="status">
          Race starts in <span className="mono">{secondsLeft}</span>
        </p>
        {startButton("Start now", false)}
      </>
    );
  }
  if (props.alone) {
    return (
      <>
        <p className="grow small muted">
          Waiting for someone to join.<span className="hide-narrow"> The race starts by itself.</span>
        </p>
        {startButton("Practise alone", false)}
      </>
    );
  }
  return (
    <>
      <p className="grow small muted">
        {props.isHost ? playersLine(props.room) : "Waiting for the host to start the next race"}
      </p>
      {startButton("Start", true)}
    </>
  );
}

/** "4 players in the room", or with people just watching: "2 racing, 2 watching". */
function playersLine(room: RoomSnapshot): string {
  const watching = room.players.filter((p) => p.watching).length;
  if (watching === 0) return `${room.players.length} players in the room`;
  return `${room.players.length - watching} racing, ${watching} watching`;
}

/**
 * Who the race start waits for, in words: someone who just joined a mixed room
 * and is picking their event, or someone finishing a warm-up solve. null = nobody.
 */
function startHeldBy(room: RoomSnapshot, youId: string | null): string | null {
  const name = (p: PlayerSnapshot) => (p.id === youId ? "you" : p.nickname);
  const picking = room.players.filter((p) => p.pickingEvent && !p.watching);
  if (picking.length > 0) {
    if (picking.some((p) => p.id === youId)) return "Pick your event: the race starts when you're ready";
    return `Waiting for ${nameList(picking.map(name))} to pick ${picking.length > 1 ? "their events" : "an event"}`;
  }
  const warming = room.players.filter((p) => p.timerStatus === "solving" && !p.watching);
  if (warming.length > 0) return `Waiting for ${nameList(warming.map(name))} to finish a warm-up solve`;
  return null;
}

/**
 * Mixed rooms, just joined: pick the event you race, then "Ready". Your last
 * pick is chosen already. The race waits for you (up to 30 seconds).
 */
function PickEventCard({ current, onReady }: { current: CubeEventId; onReady: (cubeEvent: CubeEventId) => void }) {
  const [choice, setChoice] = useState<CubeEventId>(current);
  return (
    <div className="pick-event-overlay">
      <section className="panel section pick-event-card" role="dialog" aria-modal="true" aria-labelledby="pick-event-title">
        <div>
          <h2 id="pick-event-title" className="card-title">
            Pick your event
          </h2>
          <p className="small muted">Everyone in this room races their own event. The race starts when you're ready.</p>
        </div>
        <MixedEventPicker label="Your event" value={choice} onChange={setChoice} />
        <button type="button" className="primary" onClick={() => onReady(choice)}>
          Ready with {EVENT_SHORT[choice]}
        </button>
      </section>
    </div>
  );
}
