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
import { ClientEvents, ServerEvents, type ChatMessage, type RoomSnapshot } from "@cube-racing/shared";
import { updateServerOffset } from "./clock";
import { clearRoom, flushOutbox } from "./outbox";
import { request, socket } from "./socket";
import { loadIdentity } from "./storage";

interface RoomConnection {
  /** The latest room snapshot from the server, or null until we've joined. */
  room: RoomSnapshot | null;
  /** Our own public player id (to find "you" in the player list). */
  youId: string | null;
  /** Set when we can't be in this room (not found, full, kicked, PIN needed...). */
  joinError: string | null;
  /** True when the room is private and needs a (correct) PIN. */
  needsPin: boolean;
  /** A message from the server for everyone, e.g. "the server is restarting". */
  notice: string | null;
  /** The room chat, oldest first. Not part of the synced room state: it arrives line by line. */
  chat: ChatMessage[];
  /** Smart cube moves of other players in their current solve, by public id. */
  cubeMoves: CubeMoves;
}

/** Each player's smart cube moves in one solve ("matchId/set/solve"). */
export type CubeMoves = Record<string, { solveKey: string; moves: string[] }>;

/** Adds new chat lines, skipping ones we already have (after a reconnect the history comes again). */
function mergeChat(old: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const known = new Set(old.map((m) => m.id));
  const fresh = incoming.filter((m) => !known.has(m.id));
  return fresh.length ? [...old, ...fresh].slice(-200) : old;
}

export function useRoom(code: string, nickname: string, pin?: string): RoomConnection {
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [youId, setYouId] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [needsPin, setNeedsPin] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [cubeMoves, setCubeMoves] = useState<CubeMoves>({});

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
      const response = await request(ClientEvents.JOIN_ROOM, { code, playerId, nickname, ...(pin ? { pin } : {}) });
      if (stopped) return;
      if (response.ok) {
        setJoinError(null);
        setNeedsPin(false);
        setNotice(null);
        setYouId(response.youId);
        applySnapshot(response.room);
        setChat((old) => mergeChat(old, response.chat ?? []));
        // Back in the room: send any solves that didn't get through before.
        void flushOutbox(code);
      } else {
        setJoinError(response.error);
        setNeedsPin(response.code === "PIN_REQUIRED");
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

    function onChat(message: ChatMessage): void {
      if (!stopped) setChat((old) => mergeChat(old, [message]));
    }

    /** A batch of someone's smart cube moves. A new solve starts a fresh list. */
    function onCubeMoves(batch: { playerId: string; solveKey: string; moves: string[] }): void {
      if (stopped) return;
      setCubeMoves((old) => {
        const mine = old[batch.playerId];
        const moves = mine?.solveKey === batch.solveKey ? [...mine.moves, ...batch.moves] : batch.moves;
        return { ...old, [batch.playerId]: { solveKey: batch.solveKey, moves: moves.slice(-400) } };
      });
    }

    socket.on(ServerEvents.ROOM_STATE, applySnapshot);
    socket.on(ServerEvents.KICKED, onKicked);
    socket.on(ServerEvents.NOTICE, onNotice);
    socket.on(ServerEvents.CHAT, onChat);
    socket.on(ServerEvents.CUBE_MOVES, onCubeMoves);
    socket.on("connect", join); // runs on every reconnect too

    if (socket.connected) {
      join();
    }

    return () => {
      stopped = true;
      socket.off(ServerEvents.ROOM_STATE, applySnapshot);
      socket.off(ServerEvents.KICKED, onKicked);
      socket.off(ServerEvents.NOTICE, onNotice);
      socket.off(ServerEvents.CHAT, onChat);
      socket.off(ServerEvents.CUBE_MOVES, onCubeMoves);
      socket.off("connect", join);
    };
  }, [code, nickname, pin]);

  return { room, youId, joinError, needsPin, notice, chat, cubeMoves };
}
