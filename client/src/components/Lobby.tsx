import type { PlayerSnapshot, RoomSettings, RoomSnapshot } from "@cube-racing/shared";
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
  onUpdateSettings: (changes: Partial<RoomSettings>) => void;
}

/** Before a match. Alone, the room code and "Copy link" come first. */
export function Lobby({ room, youId, isHost, starting, onStart, onKick, onUpdateSettings }: Props) {
  const [copied, copy] = useCopy(room.code, room.pin);
  const alone = room.players.length === 1;
  const isPrivate = room.settings.visibility === "private";
  const copyLabel = copied ? "Copied" : isPrivate ? "Copy invite link" : "Copy link";

  return (
    <main className="lobby">
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
                ? "Private: not listed. Send the invite link, or the code and PIN."
                : "Public: listed on the home page. You can also send the code or the link."}
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

      <section className="panel section" style={{ gridArea: "players" }}>
        <h2>
          Players <span className="muted">{room.players.length}/{room.settings.maxPlayers}</span>
        </h2>
        <PlayerList players={room.players} hostId={room.hostId} youId={youId} onKick={isHost ? onKick : undefined} />
      </section>

      <section className="panel section" style={{ gridArea: "settings" }}>
        <h2>Settings</h2>
        {isHost ? (
          <LobbySettings settings={room.settings} onChange={onUpdateSettings} />
        ) : (
          <p>{settingsSummary(room.settings)}</p>
        )}
      </section>

      <div className="start-bar">
        <div className="inner">
          {isHost ? (
            <>
              <p className="grow small muted">{alone ? "You can also start alone to practise." : `${room.players.length} players in the room`}</p>
              <button type="button" className="primary" onClick={onStart} disabled={starting}>
                {starting ? "Starting…" : "Start"}
              </button>
            </>
          ) : (
            <p className="grow small muted">Waiting for the host to start</p>
          )}
        </div>
      </div>
    </main>
  );
}
