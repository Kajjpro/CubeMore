import { useEffect, useState } from "react";
import { ClientEvents, type PublicRoomInfo } from "@cube-racing/shared";
import { EVENT_SHORT, FORMAT_LABELS } from "../labels";
import { request, socket, useIsConnected } from "../socket";
import { EventIcon } from "./ui";

const REFRESH_MS = 5000;

/**
 * Public rooms anyone can join, refreshed every few seconds while the page is
 * visible. Private rooms never appear here.
 */
export function PublicRooms({ onJoin, demoRooms }: { onJoin: (code: string) => void; demoRooms?: PublicRoomInfo[] }) {
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
    <section className="panel public-rooms" aria-labelledby="public-rooms-title">
      <div className="public-rooms-head">
        <h2 id="public-rooms-title">Public rooms</h2>
        {rooms && rooms.length > 0 && <span className="small muted">{rooms.length} open</span>}
      </div>

      {rooms === null ? (
        <p className="small muted">{connected ? "Looking for rooms…" : "Connecting…"}</p>
      ) : rooms.length === 0 ? (
        <p className="small muted">No public rooms right now. Create one, or join a private room with its code.</p>
      ) : (
        <ul className="list room-list">
          {rooms.map((room) => {
            const full = room.players >= room.maxPlayers;
            return (
              <li key={room.code}>
                <EventIcon id={room.cubeEvent} />
                <div className="room-info">
                  <span className="name" title={room.name}>
                    {room.name}
                  </span>
                  <span className="tiny muted">
                    {EVENT_SHORT[room.cubeEvent]} · {FORMAT_LABELS[room.format]} ·{" "}
                    {room.winCondition === "unlimited" ? "Unlimited" : `Bo${room.winCondition.slice(2)}`} ·{" "}
                    {room.players}/{room.maxPlayers}
                    {room.racing ? " · racing, you join at the next set" : ""}
                  </span>
                </div>
                <button type="button" onClick={() => onJoin(room.code)} disabled={full} aria-label={`Join ${room.name}`}>
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
