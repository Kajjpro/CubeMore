/*
 * ROOM LOGIC: all the rules of a room, in one place.
 *
 * Every function here is PURE:
 *   - It takes the current room (plus inputs like "now") and returns a NEW room.
 *   - It never changes the room it was given, and it never talks to sockets.
 * That makes it easy to unit test (see roomLogic.test.ts) and easy to reason about.
 * The race itself (sets, solves, scoring) lives in ../match/matchLogic.ts;
 * the functions here connect it to the players in the room.
 *
 * VERSION RULE: every function that changes something returns a room whose
 * `version` is 1 higher. If nothing changed, it returns the SAME room object,
 * with the same version, so the caller knows there's nothing to broadcast.
 *
 * Functions that can be refused (e.g. "only the host can start") return a
 * LogicResult: { ok: true, room } or { ok: false, error }.
 */

import { createHash } from "node:crypto";
import {
  EMPTY_ROOM_TTL_MS,
  RECONNECT_GRACE_MS,
  type ErrorCode,
  type PublicRoomInfo,
  type RoomSettings,
  type RoomSnapshot,
  type Scramble,
  type TimerStatus,
} from "@cube-racing/shared";
import * as matchLogic from "../match/matchLogic";
import { solvesPerSet, targetPoints } from "../match/scoring";
import type { Match, MatchTiming, PenaltyChange, SolveSubmission } from "../match/types";
import type { ServerPlayer, ServerRoom } from "./types";

export type LogicResult =
  | { ok: true; room: ServerRoom }
  | { ok: false; error: string; code?: ErrorCode };

export interface PlayerInfo {
  playerId: string;
  nickname: string;
}

/** What the server prepares for a new match: the id, the first set's scrambles, and the timings. */
export interface MatchStartInfo {
  matchId: string;
  scrambles: Scramble[];
  timing: MatchTiming;
}

export function fail(error: string, code?: ErrorCode): { ok: false; error: string; code?: ErrorCode } {
  return code ? { ok: false, error, code } : { ok: false, error };
}

/**
 * Makes a public id from the secret playerId. Everyone can see the public id,
 * but nobody can work out the secret playerId from it, so nobody can pretend
 * to be another player (for example, to steal the host's seat).
 */
export function publicIdFor(playerId: string): string {
  return createHash("sha256").update(playerId).digest("hex").slice(0, 12);
}

// ---------------------------------------------------------------------------
// Creating and joining
// ---------------------------------------------------------------------------

/**
 * A new room with its creator as host. A room without a name is called
 * "<host>'s room". A private room needs a PIN (checked by the schema).
 */
export function createRoom(
  code: string,
  settings: RoomSettings,
  host: PlayerInfo,
  now: number,
  pin: string | null = null,
): ServerRoom {
  const hostPlayer = newPlayer(host, now);
  return {
    code,
    version: 1,
    settings: { ...settings, name: settings.name || `${host.nickname}'s room` },
    match: null,
    hostId: hostPlayer.publicId,
    players: [hostPlayer],
    kickedPlayerIds: [],
    pin: settings.visibility === "private" ? pin : null,
    emptySince: null,
  };
}

/**
 * Adds a player to the room, or brings back a player who is already in it.
 *
 * "Already in it" means the same secret playerId. That happens after a page
 * refresh or a network drop: the player keeps their seat, their join time
 * (so they keep their place in line for host), their host badge, and their
 * place in the current set.
 */
export function joinRoom(room: ServerRoom, player: PlayerInfo, now: number, pin?: string): LogicResult {
  if (room.kickedPlayerIds.includes(player.playerId)) {
    return fail("You were removed from this room by the host.");
  }

  const existing = findPlayer(room, player.playerId);
  // Private room: a NEW player needs the PIN. Someone coming back to their own
  // seat (refresh, network drop) doesn't have to type it again.
  if (!existing && room.pin !== null && pin !== room.pin) {
    return fail(pin ? "Wrong PIN. Try again." : "This room is private. Enter its PIN.", "PIN_REQUIRED");
  }

  if (existing) {
    const nothingChanged = existing.status === "connected" && existing.nickname === player.nickname;
    if (nothingChanged) {
      return { ok: true, room };
    }
    return {
      ok: true,
      room: changeRoom(room, {
        players: updatePlayer(room, player.playerId, {
          nickname: player.nickname,
          status: "connected",
          disconnectedAt: null,
        }),
      }),
    };
  }

  if (room.players.length >= room.settings.maxPlayers) {
    return fail("This room is full.");
  }

  // Joining during a match is allowed: the new player watches (spectator)
  // until the next set starts, because they aren't in this set's roster.
  const joined = newPlayer(player, now);
  return {
    ok: true,
    room: changeRoom(room, {
      players: [...room.players, joined],
      // If the room was empty, there's no host yet, so the new player becomes host.
      hostId: room.hostId ?? joined.publicId,
      emptySince: null,
    }),
  };
}

// ---------------------------------------------------------------------------
// Leaving, disconnecting, reconnect timeout
// ---------------------------------------------------------------------------

/** The player's connection dropped. Keep their seat, but show them as "reconnecting". */
export function markDisconnected(room: ServerRoom, playerId: string, now: number): ServerRoom {
  const player = findPlayer(room, playerId);
  if (!player || player.status === "reconnecting") {
    return room;
  }
  return changeRoom(room, {
    players: updatePlayer(room, playerId, { status: "reconnecting", disconnectedAt: now, timerStatus: "idle" }),
  });
}

/** Removes everyone who has been "reconnecting" for 30 seconds or more. */
export function removeExpiredPlayers(room: ServerRoom, now: number): ServerRoom {
  const expiredIds = room.players
    .filter(
      (p) =>
        p.status === "reconnecting" &&
        p.disconnectedAt !== null &&
        now - p.disconnectedAt >= RECONNECT_GRACE_MS,
    )
    .map((p) => p.playerId);

  if (expiredIds.length === 0) {
    return room;
  }
  return removePlayers(room, expiredIds, now);
}

/** The player left on purpose (pressed "Leave"). */
export function leaveRoom(room: ServerRoom, playerId: string, now: number): ServerRoom {
  if (!findPlayer(room, playerId)) {
    return room;
  }
  return removePlayers(room, [playerId], now);
}

// ---------------------------------------------------------------------------
// Host-only actions
// ---------------------------------------------------------------------------

export function kickPlayer(
  room: ServerRoom,
  requesterId: string,
  targetPublicId: string,
  now: number,
): LogicResult {
  if (!isHost(room, requesterId)) {
    return fail("Only the host can kick players.");
  }
  const target = room.players.find((p) => p.publicId === targetPublicId);
  if (!target) {
    return fail("That player is not in the room.");
  }
  if (target.playerId === requesterId) {
    return fail("You can't kick yourself.");
  }

  const withoutTarget = removePlayers(room, [target.playerId], now);
  return {
    ok: true,
    room: { ...withoutTarget, kickedPlayerIds: [...room.kickedPlayerIds, target.playerId] },
  };
}

export function updateSettings(
  room: ServerRoom,
  requesterId: string,
  changes: Partial<RoomSettings>,
): LogicResult {
  if (!isHost(room, requesterId)) {
    return fail("Only the host can change settings.");
  }
  if (room.match) {
    return fail("Settings can only be changed in the lobby.");
  }
  if (changes.winCondition !== undefined && changes.winCondition !== room.settings.winCondition) {
    return fail("Best of is chosen when the room is created and can't be changed.");
  }

  // The name, public/private and best of stay as they were created.
  const settings: RoomSettings = {
    ...room.settings,
    ...changes,
    name: room.settings.name,
    visibility: room.settings.visibility,
    winCondition: room.settings.winCondition,
  };
  if (settings.maxPlayers < room.players.length) {
    return fail(`Max players can't be lower than the ${room.players.length} players already here.`);
  }

  const keys = Object.keys(settings) as (keyof RoomSettings)[];
  const nothingChanged = keys.every((key) => settings[key] === room.settings[key]);
  if (nothingChanged) {
    return { ok: true, room };
  }

  return { ok: true, room: changeRoom(room, { settings }) };
}

/**
 * Returns the reason this player can't start the match, or null if they can.
 * The socket layer checks this BEFORE getting scrambles ready.
 */
export function startMatchError(room: ServerRoom, requesterId: string): string | null {
  if (!isHost(room, requesterId)) {
    return "Only the host can start the match.";
  }
  if (room.match) {
    return "The match has already started.";
  }
  return null;
}

/**
 * Starts a match. Everyone in the room is in the first set.
 * The scrambles are made OUTSIDE this function (it's slow and random), and
 * passed in. That keeps this function pure and easy to test.
 */
export function startMatch(room: ServerRoom, requesterId: string, start: MatchStartInfo, now: number): LogicResult {
  const error = startMatchError(room, requesterId);
  if (error) {
    return fail(error);
  }
  return beginMatch(room, start, now);
}

/** Host, after a match: play again with the same settings, points back to 0. */
/** What the host may change when restarting: the event, format and time limit (not best of). */
export type RestartChanges = Partial<Pick<RoomSettings, "cubeEvent" | "format" | "solveTimeLimit">>;

/** The room's settings for the next match after a restart. */
export function settingsAfterRestart(room: ServerRoom, changes: RestartChanges): RoomSettings {
  return {
    ...room.settings,
    ...(changes.cubeEvent ? { cubeEvent: changes.cubeEvent } : {}),
    ...(changes.format ? { format: changes.format } : {}),
    ...(changes.solveTimeLimit !== undefined ? { solveTimeLimit: changes.solveTimeLimit } : {}),
  };
}

/**
 * Host: a new match right now, with points back to 0. After a match ("Rematch")
 * or in the middle of one ("Restart"), optionally with another event, format
 * or time limit. Best of stays as the room was created.
 */
export function rematch(
  room: ServerRoom,
  requesterId: string,
  start: MatchStartInfo,
  now: number,
  changes: RestartChanges = {},
): LogicResult {
  const error = rematchError(room, requesterId);
  if (error) {
    return fail(error);
  }
  return beginMatch({ ...room, settings: settingsAfterRestart(room, changes) }, start, now);
}

export function rematchError(room: ServerRoom, requesterId: string): string | null {
  if (!isHost(room, requesterId)) {
    return "Only the host can restart the match.";
  }
  if (!room.match) {
    return "There is no match to restart. Press Start.";
  }
  return null;
}

/** The public rooms for the home page list: never private rooms, never empty ones. */
export function publicRoomList(rooms: ServerRoom[]): PublicRoomInfo[] {
  return rooms
    .filter((room) => room.settings.visibility === "public" && room.players.length > 0)
    .map((room) => ({
      code: room.code,
      name: room.settings.name,
      cubeEvent: room.settings.cubeEvent,
      format: room.settings.format,
      winCondition: room.settings.winCondition,
      players: room.players.length,
      maxPlayers: room.settings.maxPlayers,
      racing: room.match !== null && room.match.phase !== "match_over",
      hostName: room.players.find((p) => p.publicId === room.hostId)?.nickname ?? null,
    }))
    .sort((a, b) => b.players - a.players || a.name.localeCompare(b.name))
    .slice(0, 50);
}

function beginMatch(room: ServerRoom, start: MatchStartInfo, now: number): LogicResult {
  if (!matchLogic.scramblesFit(room.settings, start.scrambles)) {
    // e.g. the event was changed while the scrambles were being made.
    return fail("The scrambles weren't ready. Please try again.");
  }
  const match = matchLogic.createMatch({
    matchId: start.matchId,
    settings: room.settings,
    timing: start.timing,
    roster: presentPlayerIds(room),
    scrambles: start.scrambles,
    now,
  });
  return { ok: true, room: withMatch(room, match) };
}

/** Host: the match ends now (the point leaders win). Allowed at any time during a match. */
export function endMatch(room: ServerRoom, requesterId: string): LogicResult {
  if (!isHost(room, requesterId)) {
    return fail("Only the host can end the match.");
  }
  if (!room.match) {
    return fail("There is no match to end.");
  }
  const update = matchLogic.endMatch(room.match, presentPlayerIds(room));
  return update.ok ? { ok: true, room: withMatch(room, update.match) } : update;
}

/** Host, after a match: back to the lobby (settings can be changed again). */
export function backToLobby(room: ServerRoom, requesterId: string): LogicResult {
  if (!isHost(room, requesterId)) {
    return fail("Only the host can go back to the lobby.");
  }
  if (room.match?.phase !== "match_over") {
    return fail("You can go back to the lobby once the match is over.");
  }
  return { ok: true, room: withMatch(room, null) };
}

/** Host: give a player a DNF for the current solve. */
export function skipPlayer(room: ServerRoom, requesterId: string, targetPublicId: string, now: number): LogicResult {
  if (!isHost(room, requesterId)) {
    return fail("Only the host can skip players.");
  }
  if (!room.match) {
    return fail("There is no match running.");
  }
  const update = matchLogic.skipPlayer(room.match, targetPublicId, now);
  return update.ok ? { ok: true, room: withMatch(room, update.match) } : update;
}

// ---------------------------------------------------------------------------
// Solving
// ---------------------------------------------------------------------------

export function submitSolve(room: ServerRoom, playerId: string, submission: SolveSubmission, now: number): LogicResult {
  const player = findPlayer(room, playerId);
  if (!player) {
    return fail("You are not in this room.", "NOT_CURRENT");
  }
  if (!room.match) {
    return fail("There is no match running.", "NOT_CURRENT");
  }
  const update = matchLogic.submitSolve(room.match, player.publicId, submission, now);
  if (!update.ok) {
    return update;
  }
  const room2 = withMatch(room, update.match);
  // Their timer has stopped, so they're no longer "solving".
  return { ok: true, room: setPlayerTimerStatus(room2, playerId, "idle") };
}

export function changePenalty(room: ServerRoom, playerId: string, change: PenaltyChange): LogicResult {
  const player = findPlayer(room, playerId);
  if (!player || !room.match) {
    return fail("There is no match running.", "NOT_CURRENT");
  }
  const update = matchLogic.changePenalty(room.match, player.publicId, change);
  return update.ok ? { ok: true, room: withMatch(room, update.match) } : update;
}

/**
 * A player's timer started or stopped. Only "solving" or "idle" is shared, never
 * the running time. "solving" is only accepted while they still have to solve.
 */
export function setTimerStatus(room: ServerRoom, playerId: string, status: TimerStatus): ServerRoom {
  const player = findPlayer(room, playerId);
  if (!player) return room;
  const match = room.match;
  const stillToSolve =
    match !== null &&
    match.phase === "solving" &&
    match.results[player.publicId]?.[match.solveIndex] === null;
  return setPlayerTimerStatus(room, playerId, status === "solving" && !stillToSolve ? "idle" : status);
}

// ---------------------------------------------------------------------------
// Time passing
// ---------------------------------------------------------------------------

/**
 * Applies everything that is due at `now`: removes players whose 30 seconds
 * are up, and moves the match along (time-limit DNFs, review / set result
 * screens ending). Safe to call at any time, any number of times.
 */
export function tickRoom(room: ServerRoom, now: number): ServerRoom {
  const updated = removeExpiredPlayers(room, now);
  if (!updated.match) return updated;
  return withMatch(updated, matchLogic.tickMatch(updated.match, now, presentPlayerIds(updated)));
}

/** True when the set result is over and the next set should start (with new scrambles). */
export function needsNextSet(room: ServerRoom, now: number): boolean {
  return room.match !== null && matchLogic.needsNextSet(room.match, now) && room.players.length > 0;
}

/** Starts the next set. Everyone in the room right now is in it. */
export function startNextSet(room: ServerRoom, scrambles: Scramble[], now: number): LogicResult {
  if (!room.match) {
    return fail("There is no match running.");
  }
  if (!matchLogic.scramblesFit(room.match.settings, scrambles)) {
    return fail("The scrambles don't fit this match.");
  }
  const update = matchLogic.startNextSet(room.match, presentPlayerIds(room), scrambles, now);
  return update.ok ? { ok: true, room: withMatch(room, update.match) } : update;
}

/** The next moment something in this room becomes due, or null if nothing is waiting. */
export function nextDeadline(room: ServerRoom): number | null {
  const times: number[] = [];
  for (const p of room.players) {
    if (p.disconnectedAt !== null) times.push(p.disconnectedAt + RECONNECT_GRACE_MS);
  }
  if (room.emptySince !== null) times.push(room.emptySince + EMPTY_ROOM_TTL_MS);
  const matchDeadline = room.match ? matchLogic.nextMatchDeadline(room.match) : null;
  if (matchDeadline !== null) times.push(matchDeadline);
  return times.length > 0 ? Math.min(...times) : null;
}

/** True if the room has had nobody in it for 10 minutes. */
export function shouldDeleteRoom(room: ServerRoom, now: number): boolean {
  return room.emptySince !== null && now - room.emptySince >= EMPTY_ROOM_TTL_MS;
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

/**
 * Turns the server's room into the public snapshot that gets sent to clients.
 * Secret playerIds and future scrambles are left out.
 */
export function toSnapshot(room: ServerRoom, now: number): RoomSnapshot {
  const match = room.match;
  return {
    code: room.code,
    version: room.version,
    serverTime: now,
    settings: room.settings,
    pin: room.pin,
    hostId: room.hostId,
    players: room.players.map((p) => ({
      id: p.publicId,
      nickname: p.nickname,
      status: p.status,
      timerStatus: p.timerStatus,
      spectator: match !== null && !match.roster.includes(p.publicId),
    })),
    match: match && {
      matchId: match.matchId,
      phase: match.phase,
      setIndex: match.setIndex,
      solveIndex: match.solveIndex,
      solvesPerSet: solvesPerSet(match.settings.format),
      targetPoints: targetPoints(match.settings.winCondition),
      // ONLY the current scramble, and only while it's being solved or reviewed.
      scramble:
        match.phase === "solving" || match.phase === "solve_review" ? match.scrambles[match.solveIndex] : null,
      solveDeadline: match.solveDeadline,
      phaseEndsAt: match.phaseEndsAt,
      roster: match.roster,
      results: match.results,
      standings: matchLogic.currentStandings(match),
      points: match.points,
      // Finished sets without every solve, to keep snapshots small.
      finishedSets: match.finishedSets.map(({ setIndex, winnerIds, standings }) => ({
        setIndex,
        winnerIds,
        standings,
      })),
      winnerIds: match.winnerIds,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function findPlayer(room: ServerRoom, playerId: string): ServerPlayer | undefined {
  return room.players.find((p) => p.playerId === playerId);
}

export function isHost(room: ServerRoom, playerId: string): boolean {
  const player = findPlayer(room, playerId);
  return player !== undefined && player.publicId === room.hostId;
}

/** Public ids of everyone in the room (connected or reconnecting). */
export function presentPlayerIds(room: ServerRoom): string[] {
  return room.players.map((p) => p.publicId);
}

function newPlayer(info: PlayerInfo, now: number): ServerPlayer {
  return {
    playerId: info.playerId,
    publicId: publicIdFor(info.playerId),
    nickname: info.nickname,
    status: "connected",
    timerStatus: "idle",
    joinedAt: now,
    disconnectedAt: null,
  };
}

function updatePlayer(room: ServerRoom, playerId: string, changes: Partial<ServerPlayer>): ServerPlayer[] {
  return room.players.map((p) => (p.playerId === playerId ? { ...p, ...changes } : p));
}

function setPlayerTimerStatus(room: ServerRoom, playerId: string, timerStatus: TimerStatus): ServerRoom {
  const player = findPlayer(room, playerId);
  if (!player || player.timerStatus === timerStatus) return room;
  return changeRoom(room, { players: updatePlayer(room, playerId, { timerStatus }) });
}

/**
 * Puts a new match into the room (bumping the version if it changed).
 * When the match moves to a new solve or phase, everyone's timer status is
 * reset to "idle".
 */
function withMatch(room: ServerRoom, match: Match | null): ServerRoom {
  if (match === room.match) return room;
  return changeRoom(room, matchChanges(room, match));
}

/** The fields that change with a new match: the match itself, and timer statuses if it moved on. */
function matchChanges(room: ServerRoom, match: Match | null): Pick<ServerRoom, "match" | "players"> {
  const movedOn = matchLogic.phaseKey(match) !== matchLogic.phaseKey(room.match);
  const players = movedOn ? room.players.map((p) => ({ ...p, timerStatus: "idle" as const })) : room.players;
  return { match, players };
}

/** Returns a copy of the room with some fields changed and the version increased by 1. */
function changeRoom(room: ServerRoom, changes: Partial<ServerRoom>): ServerRoom {
  return { ...room, ...changes, version: room.version + 1 };
}

/**
 * Removes players for good. If the host was one of them, the player who has
 * been here the longest becomes the new host. A connected player is picked
 * before a "reconnecting" one, so the room isn't stuck with a host who may be gone.
 * In a match, their missing solves in the current set become DNFs.
 */
function removePlayers(room: ServerRoom, playerIds: string[], now: number): ServerRoom {
  const leaving = room.players.filter((p) => playerIds.includes(p.playerId));
  const players = room.players.filter((p) => !playerIds.includes(p.playerId));

  let hostId = room.hostId;
  const hostStillHere = players.some((p) => p.publicId === hostId);
  if (!hostStillHere) {
    // `players` is in join order, so find() picks the longest-present player.
    const newHost = players.find((p) => p.status === "connected") ?? players[0];
    hostId = newHost ? newHost.publicId : null;
  }

  let match = room.match;
  for (const p of leaving) {
    if (match) match = matchLogic.removeFromMatch(match, p.publicId, now);
  }

  const changed = changeRoom(room, {
    players,
    hostId,
    emptySince: players.length === 0 ? now : null,
  });
  // (No second version bump: this is still one change.)
  return match === room.match ? changed : { ...changed, ...matchChanges(changed, match) };
}
