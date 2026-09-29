import type { PlayerStatus, RoomSettings, TimerStatus } from "@cube-racing/shared";
import type { Match } from "../match/types";

// These are the SERVER's own copies of rooms and players. They hold a few
// private fields that must never be sent to clients (like the secret playerId
// and future scrambles). `toSnapshot()` in roomLogic.ts turns a ServerRoom
// into the public RoomSnapshot.

export interface ServerPlayer {
  /** Secret id the client made and saved in localStorage. It proves "I'm the same person". */
  playerId: string;
  /** Public id shown to everyone (made from playerId, but can't be turned back into it). */
  publicId: string;
  nickname: string;
  status: PlayerStatus;
  timerStatus: TimerStatus;
  joinedAt: number;
  /** When their connection dropped, or null if they're connected. */
  disconnectedAt: number | null;
}

export interface ServerRoom {
  code: string;
  version: number;
  settings: RoomSettings;
  /** The current match, or null while the room is in the lobby. */
  match: Match | null;
  /** Public id of the host. */
  hostId: string | null;
  /** In join order, so players[0] has been here the longest. */
  players: ServerPlayer[];
  /** Secret playerIds of kicked players. They can't join again. */
  kickedPlayerIds: string[];
  /** When the last player left, or null if someone is in the room. */
  emptySince: number | null;
}
