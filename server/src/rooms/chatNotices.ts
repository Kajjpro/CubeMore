/*
 * CHAT NOTICES: the short system lines in the room chat
 * ("Anu joined the room", "Nomin submitted 9.12", "Nomin wins set 2").
 *
 * They are worked out by comparing the room before and after a change, so every
 * way a room can change (a request, a timer, a restart) produces them the same
 * way, from one place. Pure function: rooms in, lines out.
 */

import { formatResult, getCubeEvent } from "@cube-racing/shared";
import type { ServerRoom } from "./types";

const BEST_OF: Record<string, string> = { bo1: "Best of 1", bo3: "Best of 3", bo5: "Best of 5", unlimited: "Unlimited" };

function names(list: string[]): string {
  return list.length <= 1 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

export function chatNotices(before: ServerRoom, after: ServerRoom): string[] {
  const notices: string[] = [];
  const nameOf = (publicId: string) =>
    after.players.find((p) => p.publicId === publicId)?.nickname ??
    before.players.find((p) => p.publicId === publicId)?.nickname ??
    "A player";

  // Players joining and leaving (a player coming back to their seat is not "joining").
  for (const player of after.players) {
    if (!before.players.some((p) => p.playerId === player.playerId)) notices.push(`${player.nickname} joined the room`);
  }
  for (const player of before.players) {
    if (!after.players.some((p) => p.playerId === player.playerId)) notices.push(`${player.nickname} left the room`);
  }
  // Stepping away and coming back.
  for (const player of after.players) {
    const old = before.players.find((p) => p.playerId === player.playerId);
    if (!old || old.watching === player.watching) continue;
    if (player.watching) notices.push(`${player.nickname} is watching for now`);
    else notices.push(after.match && after.match.phase !== "match_over" ? `${player.nickname} is back and races from the next set` : `${player.nickname} is back to race`);
  }
  // Mixed rooms: "Anu picked Pyraminx", so everyone can see who races what.
  if (after.settings.mixedEvents) {
    for (const player of after.players) {
      const old = before.players.find((p) => p.playerId === player.playerId);
      if (old && player.cubeEvent && old.cubeEvent !== player.cubeEvent) {
        notices.push(`${player.nickname} picked ${getCubeEvent(player.cubeEvent).name}`);
      }
    }
  }

  const was = before.match;
  const now = after.match;

  if (now && (!was || now.matchId !== was.matchId)) {
    const s = now.settings;
    const event = s.mixedEvents ? "Mixed events" : getCubeEvent(s.cubeEvent).name;
    notices.push(`Match started: ${event}, ${s.format}, ${BEST_OF[s.winCondition]}`);
    return notices;
  }
  if (!now) {
    if (was) notices.push("Back to the lobby");
    return notices;
  }
  if (!was) return notices;

  if (now.setIndex > was.setIndex) notices.push(`Set ${now.setIndex + 1} started`);

  // New times in this set. Only times players sent themselves (not automatic DNFs).
  if (now.setIndex === was.setIndex) {
    for (const id of now.roster) {
      now.results[id]?.forEach((result, solveIndex) => {
        const old = was.results[id]?.[solveIndex];
        if (result && !old && result.source === "submitted") notices.push(`${nameOf(id)} submitted ${formatResult(result)}`);
      });
    }
  }

  if (now.finishedSets.length > was.finishedSets.length) {
    const set = now.finishedSets[now.finishedSets.length - 1];
    const winners = set.winnerIds.map(nameOf);
    const paceSet = set.paces !== null && Object.values(set.paces).every((pace) => pace === null);
    notices.push(
      paceSet
        ? `Set ${set.setIndex + 1} set everyone's pace. From now on, beat your own pace to win`
        : winners.length
          ? `${names(winners)} ${winners.length > 1 ? "win" : "wins"} set ${set.setIndex + 1}`
          : `Nobody wins set ${set.setIndex + 1}`,
    );
  }

  if (now.phase === "match_over" && was.phase !== "match_over") {
    const winners = now.winnerIds.map(nameOf);
    notices.push(winners.length ? `${names(winners)} ${winners.length > 1 ? "win" : "wins"} the match` : "Match over. No winner");
  }

  return notices;
}
