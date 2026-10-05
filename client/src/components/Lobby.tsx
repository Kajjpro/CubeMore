import { useEffect, useState, type ReactNode } from "react";
import { AUTO_START_DELAY_MS, getCubeEvent, type PlayerSnapshot, type RoomSettings, type RoomSnapshot } from "@cube-racing/shared";
import { serverNow } from "../clock";
import { settingsSummary } from "../labels";
import { PlayerList } from "./RoomPanels";
import { LobbySettings } from "./SettingsForm";
import { roomLink, useCopy } from "./TopBar";
import { EventIcon } from "./ui";

interface Props {
  room: RoomSnapshot;
  youId: string | null;
  isHost: boolean;
  starting: boolean;
  onStart: () => void;
  onKick: (player: PlayerSnapshot) => void;
  onUpdateSettings: (changes: Partial<RoomSettings>, pin?: string) => void;
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
export function Lobby({ room, youId, isHost, starting, onStart, onKick, onUpdateSettings, chat }: Props) {
  const [copied, copy] = useCopy(room.code, room.pin);
  const alone = room.players.length === 1;
  const isPrivate = room.settings.visibility === "private";
  const copyLabel = copied ? "Copied" : isPrivate ? "Copy invite link" : "Copy link";
  const secondsLeft = useSecondsLeft(room.autoStartAt, !room.weekly);

  function share(): void {
    void navigator
      .share({ title: room.settings.name, text: isPrivate ? `Race me on Cube Racing: room ${room.code}` : "Race me on Cube Racing", url: roomLink(room.code, room.pin) })
      .catch(() => {});
  }

  return (
    <main className="lobby">
      {/* Two columns on wide screens; on phones the columns dissolve into one list (display: contents). */}
      <div className="lobby-col">
        <section className="panel share" data-alone={alone} style={{ gridArea: "share" }}>
          <div className="share-title">
            <span className="event-chip large">
              <EventIcon id={room.settings.cubeEvent} />
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
                <EventIcon id={room.settings.cubeEvent} />
              </span>
              <div>
                <b>{getCubeEvent(room.settings.cubeEvent).name}</b>
                <p className="small muted">{settingsSummary(room.settings)}</p>
                <p className="tiny muted">The host picks the event and format.</p>
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
          <PlayerList players={room.players} hostId={room.hostId} youId={youId} onKick={isHost ? onKick : undefined} seats />
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
          <StartBar room={room} isHost={isHost} alone={alone} starting={starting} onStart={onStart} secondsLeft={secondsLeft} />
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
        {props.isHost ? `${props.room.players.length} players in the room` : "Waiting for the host to start the next race"}
      </p>
      {startButton("Start", true)}
    </>
  );
}
