import { useEffect, useState } from "react";
import { ClientEvents, type PublicRoomInfo } from "@cube-racing/shared";
import { EVENT_SHORT, FORMAT_LABELS } from "../labels";
import { request, socket, useIsConnected } from "../socket";
import { RoomEventIcon } from "./ui";

const REFRESH_MS = 5000;

/**
 * Every open room, public and private, refreshed every few seconds while the
 * page is visible. null until the first answer arrives.
 */
export function useRooms(demoRooms?: PublicRoomInfo[]): { rooms: PublicRoomInfo[] | null; connected: boolean } {
  const [rooms, setRooms] = useState<PublicRoomInfo[] | null>(demoRooms ?? null);
  const connected = useIsConnected();

  useEffect(() => {
    if (demoRooms) return;
    let stopped = false;
    async function load(): Promise<void> {
      if (document.hidden || !socket.connected) return;
      const response = await request(ClientEvents.LIST_ROOMS, {});
      if (!stopped && response.ok) setRooms(response.rooms);
    }
    void load();
    const interval = setInterval(() => void load(), REFRESH_MS);
    const onVisible = () => void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [connected, demoRooms]);

  return { rooms, connected: demoRooms ? true : connected };
}

type RoomTab = "public" | "private";

const EMPTY: Record<RoomTab, { title: string; hint: string }> = {
  public: {
    title: "No public rooms right now.",
    hint: "Create one: it shows up here for everyone, and the race starts as soon as someone joins.",
  },
  private: {
    title: "No private rooms right now.",
    hint: "Private rooms need a PIN to join. Create one for your friends and send them the invite link.",
  },
};

/**
 * The open rooms in two tabs: Public (anyone joins) and Private (joining needs
 * the PIN; the room page asks for it). Each tab says how many there are.
 */
export function RoomTabs(props: {
  rooms: PublicRoomInfo[] | null;
  connected: boolean;
  onJoin: (code: string) => void;
  initialTab?: RoomTab;
}) {
  const { rooms, connected, onJoin } = props;
  const [tab, setTab] = useState<RoomTab>(props.initialTab ?? "public");
  const of = (kind: RoomTab) => rooms?.filter((room) => room.visibility === kind) ?? null;
  const tabs: { id: RoomTab; label: string; rooms: PublicRoomInfo[] | null }[] = [
    { id: "public", label: "Public", rooms: of("public") },
    { id: "private", label: "Private", rooms: of("private") },
  ];
  const shown = tabs.find((t) => t.id === tab)!;

  return (
    <div className="room-tabs">
      <div className="tabs" role="tablist" aria-label="Open rooms">
        {tabs.map(({ id, label, rooms: list }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`rooms-tab-${id}`}
            aria-selected={tab === id}
            aria-controls="rooms-panel"
            onClick={() => setTab(id)}
          >
            {label}
            {list !== null && <span className="tab-count">{list.length}</span>}
          </button>
        ))}
      </div>
      <div className="room-tab-panel" role="tabpanel" id="rooms-panel" aria-labelledby={`rooms-tab-${tab}`}>
        {tab === "private" && !!shown.rooms?.length && <p className="tiny muted private-note">Joining a private room needs its PIN.</p>}
        <RoomCards rooms={shown.rooms} connected={connected} onJoin={onJoin} empty={EMPTY[tab]} />
      </div>
    </div>
  );
}

/** Rooms as cards with a Join button (a private one asks for its PIN on the room page). */
function RoomCards(props: {
  rooms: PublicRoomInfo[] | null;
  connected: boolean;
  onJoin: (code: string) => void;
  empty: { title: string; hint: string };
}) {
  const { rooms, connected, onJoin } = props;
  if (rooms === null) {
    return (
      <div className="empty-state">
        <p className="small muted">{connected ? "Looking for rooms…" : "Connecting…"}</p>
      </div>
    );
  }
  if (rooms.length === 0) {
    return (
      <div className="empty-state">
        <p className="small">{props.empty.title}</p>
        <p className="tiny muted">{props.empty.hint}</p>
      </div>
    );
  }
  return (
    <ul className="room-list">
      {rooms.map((room) => {
        const full = room.players >= room.maxPlayers;
        const isPrivate = room.visibility === "private";
        const bestOf = room.winCondition === "unlimited" ? "Unlimited" : `Bo${room.winCondition.slice(2)}`;
        return (
          <li key={room.code} className="room-card" data-racing={room.racing}>
            <span className="event-chip">
              <RoomEventIcon settings={room} />
            </span>
            <div className="room-info">
              <span className="room-title">
                <span className="name" title={room.name}>
                  {room.name}
                </span>
                {isPrivate && <span className="tag tag-lock">PIN</span>}
                {room.smartOnly && (
                  <span className="tag tag-smart" title="Smart cubes only: every solve is verified">
                    Smart
                  </span>
                )}
              </span>
              <span className="room-meta">
                {isPrivate && <span className="mono room-code">{room.code}</span>}
                <span>
                  {room.mixedEvents ? "Mixed events" : EVENT_SHORT[room.cubeEvent]}, {FORMAT_LABELS[room.format]}, {bestOf}
                </span>
              </span>
              <span className="room-stats">
                <span>
                  {room.players}/{room.maxPlayers} players
                </span>
                {room.racing ? <span className="state-racing">Racing</span> : <span className="state-open">In lobby</span>}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onJoin(room.code)}
              disabled={full}
              aria-label={`${isPrivate ? "Join with PIN" : "Join"}: ${room.name}`}
            >
              {full ? "Full" : "Join"}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
