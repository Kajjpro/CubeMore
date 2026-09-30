import { useEffect, useState, type ReactNode } from "react";
import { AUTO_START_DELAY_MS, type PlayerSnapshot, type RoomSettings, type RoomSnapshot } from "@cube-racing/shared";
import { serverNow } from "../clock";
import { settingsSummary } from "../labels";
import { PlayerList } from "./RoomPanels";
import { LobbySettings } from "./SettingsForm";
import { useCopy } from "./TopBar";

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

/**
 * Before a race. Alone, the room code and "Copy link" come first. There's no
 * need to press Start: the race starts by itself 3 seconds after someone joins.
 */
export function Lobby({ room, youId, isHost, starting, onStart, onKick, onUpdateSettings, chat }: Props) {
  const [copied, copy] = useCopy(room.code, room.pin);
  const alone = room.players.length === 1;
  const isPrivate = room.settings.visibility === "private";
  const copyLabel = copied ? "Copied" : isPrivate ? "Copy invite link" : "Copy link";

  return (
    <main className="lobby">
      {/* Two columns on wide screens; on phones the columns dissolve into one list (display: contents). */}
      <div className="lobby-col">
        <section className="panel section share" style={{ gridArea: "share" }}>
          <div className="share-title">
            <h2 className="grow">{room.settings.name}</h2>
            <span className="tag">{isPrivate ? "Private" : "Public"}</span>
          </div>
          {alone ? (
            <>
              <p className="big-code" aria-label={`Room code ${room.code.split("").join(" ")}`}>
                {room.code}
              </p>
              {room.pin && (
                <p className="pin-line">
                  PIN <span className="mono">{room.pin}</span>
                </p>
              )}
              <button type="button" className="primary" onClick={copy}>
                {copyLabel}
              </button>
              <p className="small muted">
                {isPrivate
                  ? "Listed on the home page, but joining needs the PIN. The invite link includes it."
                  : "Listed on the home page. You can also send the code or the link."}
              </p>
            </>
          ) : (
            <div className="share-row">
              <span className="code grow">
                {room.code}
                {room.pin && <span className="pin-small"> PIN {room.pin}</span>}
              </span>
              <button type="button" onClick={copy}>
                {copyLabel}
              </button>
            </div>
          )}
        </section>

        <section className="panel section" style={{ gridArea: "settings" }}>
          <h2>Settings</h2>
          {isHost ? (
            <LobbySettings
              settings={room.settings}
              pin={room.pin}
              bestOfLocked={room.bestOfLocked}
              onChange={onUpdateSettings}
            />
          ) : (
            <p>{settingsSummary(room.settings)}</p>
          )}
        </section>
      </div>

      <div className="lobby-col">
        <section className="panel section" style={{ gridArea: "players" }}>
          <h2>
            Players <span className="muted">{room.players.length}/{room.settings.maxPlayers}</span>
          </h2>
          <PlayerList players={room.players} hostId={room.hostId} youId={youId} onKick={isHost ? onKick : undefined} />
        </section>

        <section className="panel lobby-chat" style={{ gridArea: "chat" }} aria-label="Room chat">
          {chat}
        </section>
      </div>

      <div className="start-bar">
        <div className="inner">
          <StartBar room={room} isHost={isHost} alone={alone} starting={starting} onStart={onStart} />
        </div>
      </div>
    </main>
  );
}

/** Whole seconds until `endsAt` (server time), updated a few times a second. */
function useSecondsLeft(endsAt: number | null): number | null {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    if (endsAt === null) return;
    const interval = setInterval(() => setNow(serverNow()), 200);
    return () => clearInterval(interval);
  }, [endsAt]);
  if (endsAt === null) return null;
  // Capped, so a slightly-off clock never shows "4" for a 3-second countdown.
  return Math.min(AUTO_START_DELAY_MS / 1000, Math.max(0, Math.ceil((endsAt - now) / 1000)));
}

/**
 * The bar at the bottom of the lobby:
 *  - someone joined: "Race starts in 3" (the host can start right away);
 *  - alone: waiting for someone, or practise alone;
 *  - back in the lobby after a match: the host starts the next race.
 */
function StartBar(props: { room: RoomSnapshot; isHost: boolean; alone: boolean; starting: boolean; onStart: () => void }) {
  const secondsLeft = useSecondsLeft(props.room.autoStartAt);
  const startButton = (label: string, primary: boolean) =>
    props.isHost && (
      <button type="button" className={primary ? "primary" : ""} onClick={props.onStart} disabled={props.starting}>
        {props.starting ? "Starting…" : label}
      </button>
    );

  if (secondsLeft !== null) {
    return (
      <>
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
        <p className="grow small muted">Waiting for someone to join. The race starts by itself.</p>
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
