import { useEffect, useState } from "react";
import { ClientEvents, type PublicRoomInfo } from "@cube-racing/shared";
import { EVENT_SHORT, FORMAT_LABELS } from "../labels";
import { request, socket, useIsConnected } from "../socket";
import { EventIcon } from "./ui";

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

/**
 * Every open room as a card. Anyone can see all rooms; a private one asks for
 * its PIN when you open it (the room page does that).
 */
export function RoomList({ rooms, connected, onJoin }: { rooms: PublicRoomInfo[] | null; connected: boolean; onJoin: (code: string) => void }) {
  const racing = rooms?.filter((room) => room.racing).length ?? 0;
  return (
    <section className="panel room-list-panel" aria-labelledby="rooms-title">
      <div className="card-head">
        <h2 id="rooms-title">Open rooms</h2>
        {rooms && rooms.length > 0 && (
          <span className="card-head-meta">
            {racing > 0 && (
              <span className="live-count">{racing} racing</span>
            )}
            <span className="muted">{rooms.length} open</span>
          </span>
        )}
      </div>

      {rooms === null ? (
        <div className="empty-state">
          <p className="small muted">{connected ? "Looking for rooms…" : "Connecting…"}</p>
        </div>
      ) : rooms.length === 0 ? (
        <div className="empty-state">
          <p className="small">No rooms right now.</p>
          <p className="tiny muted">Create one: the race starts as soon as someone joins.</p>
        </div>
      ) : (
        <ul className="room-list">
          {rooms.map((room) => {
            const full = room.players >= room.maxPlayers;
            const isPrivate = room.visibility === "private";
            const bestOf = room.winCondition === "unlimited" ? "Unlimited" : `Bo${room.winCondition.slice(2)}`;
            return (
              <li key={room.code} className="room-card" data-racing={room.racing}>
                <span className="event-chip">
                  <EventIcon id={room.cubeEvent} />
                </span>
                <div className="room-info">
                  <span className="room-title">
                    <span className="name" title={room.name}>
                      {room.name}
                    </span>
                    {isPrivate && (
                      <span className="tag tag-lock">PIN</span>
                    )}
                    {room.smartOnly && (
                      <span className="tag tag-smart" title="Smart cubes only: every solve is verified">
                        Smart
                      </span>
                    )}
                  </span>
                  <span className="room-meta">
                    {isPrivate && <span className="mono room-code">{room.code}</span>}
                    <span>
                      {EVENT_SHORT[room.cubeEvent]}, {FORMAT_LABELS[room.format]}, {bestOf}
                    </span>
                  </span>
                  <span className="room-stats">
                    <span>
                      {room.players}/{room.maxPlayers} players
                    </span>
                    {room.racing ? (
                      <span className="state-racing">Racing</span>
                    ) : (
                      <span className="state-open">In lobby</span>
                    )}
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
      )}
    </section>
  );
}
