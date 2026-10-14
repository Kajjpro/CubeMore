/*
 * CHAT NOTICES: the short system lines in the room chat
 * ("Anu joined the room", "Nomin submitted 9.12", "Nomin wins set 2").
 *
 * They are worked out by comparing the room before and after a change, so every
 * way a room can change (a request, a timer, a restart) produces them the same
 * way, from one place. Pure function: rooms in, lines out.
 */

import { formatMark, formatResult, getCubeEvent, otherTeam, TEAM_IDS, teamName, type TeamId } from "@cube-racing/shared";
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
  const teamsOn = after.settings.teams !== "off";
  for (const player of after.players) {
    if (before.players.some((p) => p.playerId === player.playerId)) continue;
    notices.push(teamsOn && player.team ? `${player.nickname} joined the room, ${teamName(player.team)}` : `${player.nickname} joined the room`);
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

  // Teams: one player switching ("Anu moved to the Red team"), or new teams for everyone.
  if (teamsOn) {
    const moved = after.players.filter((p) => {
      const old = before.players.find((o) => o.playerId === p.playerId);
      return old && p.team && (old.team !== p.team || before.settings.teams === "off");
    });
    if (moved.length === 1 && before.settings.teams !== "off") notices.push(`${moved[0].nickname} moved to the ${teamName(moved[0].team!)}`);
    else if (moved.length > 1) {
      const line = (team: TeamId) => `${teamName(team)}: ${names(after.players.filter((p) => p.team === team).map((p) => p.nickname)) || "nobody"}`;
      notices.push(`New teams. ${line("A")}. ${line("B")}`);
    }
  }

  const was = before.match;
  const now = after.match;

  if (now && (!was || now.matchId !== was.matchId)) {
    const s = now.settings;
    const event = s.mixedEvents ? "Mixed events" : getCubeEvent(s.cubeEvent).name;
    notices.push(`${now.teams ? "Team match" : "Match"} started: ${event}, ${s.format}, ${BEST_OF[s.winCondition]}`);
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
    if (set.teams) {
      const teams = set.teams;
      const score = TEAM_IDS.filter((t) => teams.standings[t]).map((t) => formatMark(teams.standings[t]!.result)).join(" vs ");
      notices.push(
        teams.winners.length === 1
          ? `${teamName(teams.winners[0])} wins set ${set.setIndex + 1} (${score})`
          : teams.winners.length > 1
            ? `Set ${set.setIndex + 1} is a tie: a point for both teams`
            : `Nobody wins set ${set.setIndex + 1}`,
      );
    } else {
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
  }

  if (now.phase === "match_over" && was.phase !== "match_over" && now.teams) {
    const [team] = now.teams.winners;
    notices.push(now.teams.winners.length === 1 ? `${teamName(team)} wins the match ${now.teams.points[team]}–${now.teams.points[otherTeam(team)]}` : "Match over. No winner");
  } else if (now.phase === "match_over" && was.phase !== "match_over") {
    const winners = now.winnerIds.map(nameOf);
    notices.push(winners.length ? `${names(winners)} ${winners.length > 1 ? "win" : "wins"} the match` : "Match over. No winner");
  }

  return notices;
}
