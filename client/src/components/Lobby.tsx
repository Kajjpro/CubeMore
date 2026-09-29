import type { PlayerSnapshot, RoomSettings, RoomSnapshot } from "@cube-racing/shared";
import { settingsSummary } from "../labels";
import { PlayerList } from "./RoomPanels";
import { SettingsForm } from "./SettingsForm";
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
  const [copied, copy] = useCopy(room.code);
  const alone = room.players.length === 1;

  return (
    <main className="lobby">
      <section className="panel section share" style={{ gridArea: "share" }}>
        {alone ? (
          <>
            <h2>Share this room</h2>
            <p className="big-code" aria-label={`Room code ${room.code.split("").join(" ")}`}>
              {room.code}
            </p>
            <button type="button" className="primary" onClick={copy}>
              {copied ? "Copied" : "Copy link"}
            </button>
            <p className="small muted">Send the code or the link to the people you want to race.</p>
          </>
        ) : (
          <div className="share-row">
            <span className="code grow">{room.code}</span>
            <button type="button" onClick={copy}>
              {copied ? "Copied" : "Copy link"}
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
          <SettingsForm settings={room.settings} onChange={onUpdateSettings} />
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
