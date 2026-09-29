/*
 * useRoom: keeps this browser tab in sync with one room.
 *
 * HOW SYNC WORKS ON THE CLIENT
 *  - We ask the server to join the room. Its answer contains the full room snapshot.
 *  - After that, the server sends a new full snapshot ("room:state") every
 *    time anything changes. We simply replace our copy with it.
 *  - Each snapshot has a `version`. If one arrives with a LOWER version than
 *    the one we're showing, it's out of date, so we ignore it.
 *  - We never edit `room` ourselves. Buttons send requests; the screen only
 *    changes when the server sends the new snapshot back.
 *  - If the connection drops, Socket.IO reconnects automatically, and every
 *    time it (re)connects we send "join" again with the same playerId. The
 *    server recognises us, gives our seat back, and replies with the current
 *    snapshot. Then any solves still in the outbox are sent again.
 */

import { useEffect, useState } from "react";
import { ClientEvents, ServerEvents, type RoomSnapshot } from "@cube-racing/shared";
import { updateServerOffset } from "./clock";
import { clearRoom, flushOutbox } from "./outbox";
import { request, socket } from "./socket";
import { loadIdentity } from "./storage";

interface RoomConnection {
  /** The latest room snapshot from the server, or null until we've joined. */
  room: RoomSnapshot | null;
  /** Our own public player id (to find "you" in the player list). */
  youId: string | null;
  /** Set when we can't be in this room (not found, full, kicked...). */
  joinError: string | null;
  /** A message from the server for everyone, e.g. "the server is restarting". */
  notice: string | null;
}

export function useRoom(code: string, nickname: string): RoomConnection {
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [youId, setYouId] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let latestVersion = -1;
    let stopped = false;

    function applySnapshot(snapshot: RoomSnapshot): void {
      if (stopped || snapshot.code !== code) return;
      if (snapshot.version < latestVersion) return; // older than what we have: ignore
      latestVersion = snapshot.version;
      updateServerOffset(snapshot.serverTime);
      setRoom(snapshot);
    }

    async function join(): Promise<void> {
      const { playerId } = loadIdentity();
      const response = await request(ClientEvents.JOIN_ROOM, { code, playerId, nickname });
      if (stopped) return;
      if (response.ok) {
        setJoinError(null);
        setNotice(null);
        setYouId(response.youId);
        applySnapshot(response.room);
        // Back in the room: send any solves that didn't get through before.
        void flushOutbox(code);
      } else {
        setJoinError(response.error);
      }
    }

    function onKicked(info: { code: string }): void {
      if (info.code === code) {
        clearRoom(code);
        setJoinError("The host removed you from this room.");
      }
    }

    function onNotice(info: { message: string }): void {
      setNotice(info.message);
    }

    socket.on(ServerEvents.ROOM_STATE, applySnapshot);
    socket.on(ServerEvents.KICKED, onKicked);
    socket.on(ServerEvents.NOTICE, onNotice);
    socket.on("connect", join); // runs on every reconnect too

    if (socket.connected) {
      join();
    }

    return () => {
      stopped = true;
      socket.off(ServerEvents.ROOM_STATE, applySnapshot);
      socket.off(ServerEvents.KICKED, onKicked);
      socket.off(ServerEvents.NOTICE, onNotice);
      socket.off("connect", join);
    };
  }, [code, nickname]);

  return { room, youId, joinError, notice };
}
