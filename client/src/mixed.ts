// Mixed rooms: every player races their own event (2x2, Pyraminx, Skewb,
// Clock). Which event and which scramble is whose.

import type { CubeEventId, MatchSnapshot, RoomSnapshot, Scramble } from "@cube-racing/shared";

/** The event a player races: in this match if they're in it, otherwise their pick for the next one. */
export function eventOf(room: RoomSnapshot, id: string | null): CubeEventId {
  if (!id) return room.settings.cubeEvent;
  return room.match?.events[id] ?? room.players.find((p) => p.id === id)?.cubeEvent ?? room.settings.cubeEvent;
}

/** The current scramble for a player. Someone watching sees their own event's if it's raced, else any. */
export function scrambleFor(room: RoomSnapshot, id: string | null): Scramble | null {
  const scrambles = room.match?.scrambles ?? {};
  return scrambles[eventOf(room, id)] ?? Object.values(scrambles)[0] ?? null;
}

/** True when players in this match race different events (then every row shows its event). */
export function isMixed(match: MatchSnapshot): boolean {
  return new Set(Object.values(match.events)).size > 1;
}

/** Whether you may pick another event now: in a mixed room, unless you're racing in a match that isn't over. */
export function canPickEvent(room: RoomSnapshot, youId: string | null): boolean {
  if (!room.settings.mixedEvents || !youId) return false;
  const match = room.match;
  return !match || match.phase === "match_over" || !match.events[youId];
}
