import { useEffect, useState } from "react";
import { ClientEvents, type PublicRoomInfo } from "@cube-racing/shared";
import { EVENT_SHORT, FORMAT_LABELS } from "../labels";
import { request, socket, useIsConnected } from "../socket";
import { EventIcon } from "./ui";

const REFRESH_MS = 5000;

/**
 * Every open room, public and private, refreshed every few seconds while the
 * page is visible. Anyone can see all rooms; a private one asks for its PIN
 * when you open it (the room page does that).
 */
export function RoomList({ onJoin, demoRooms }: { onJoin: (code: string) => void; demoRooms?: PublicRoomInfo[] }) {
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

  return (
    <section className="panel room-list-panel" aria-labelledby="rooms-title">
      <div className="room-list-head">
        <h2 id="rooms-title">Rooms</h2>
        {rooms && rooms.length > 0 && <span className="small muted">{rooms.length} open</span>}
      </div>

      {rooms === null ? (
        <p className="small muted">{connected ? "Looking for rooms…" : "Connecting…"}</p>
      ) : rooms.length === 0 ? (
        <p className="small muted">No rooms right now. Create one: the race starts as soon as someone joins.</p>
      ) : (
        <ul className="list room-list">
          {rooms.map((room) => {
            const full = room.players >= room.maxPlayers;
            const isPrivate = room.visibility === "private";
            return (
              <li key={room.code}>
                <EventIcon id={room.cubeEvent} />
                <div className="room-info">
                  <span className="room-title">
                    <span className="name" title={room.name}>
                      {room.name}
                    </span>
                    {isPrivate && <span className="tag">PIN</span>}
                  </span>
                  <span className="tiny muted">
                    <span className="mono room-code">{room.code}</span> · {EVENT_SHORT[room.cubeEvent]} ·{" "}
                    {FORMAT_LABELS[room.format]} ·{" "}
                    {room.winCondition === "unlimited" ? "Unlimited" : `Bo${room.winCondition.slice(2)}`} · {room.players}/
                    {room.maxPlayers}
                    {room.racing ? " · racing" : ""}
                  </span>
                </div>
                <button
                  type="button"
                  className={isPrivate ? "" : "primary"}
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
