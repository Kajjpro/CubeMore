/*
 * TEAM MATCHES on screen (two teams, see shared/teams.ts):
 *   TeamSeats       the lobby: a column per team, "Join" to switch, "Balance teams" for the host
 *   TeamScoreboard  above the standings: "Blue 2 – 1 Red", and how the last solve went
 *   TeamSetResult   after each set: which team won it, the team times, then everyone's
 *   TeamFinal       the end: both teams side by side, the winners first
 * The team times are worked out here with the same rules the server scores with.
 */

import type { ReactNode } from "react";
import {
  formatMark,
  formatTime,
  TEAM_IDS,
  TEAM_NAMES,
  teamName,
  teamMembers,
  teamSolveMarks,
  teamStandings,
  type Mark,
  type MatchSnapshot,
  type MatchTeams,
  type PlayerSnapshot,
  type RoomFormat,
  type RoomSnapshot,
  type SetStanding,
  type TeamId,
} from "@cube-racing/shared";
import { FORMAT_LABELS } from "../labels";
import { PlayerList } from "./RoomPanels";
import { Avatar, Icon, ProgressBar } from "./ui";

type Names = Record<string, string>;
const nameOf = (id: string, names: Names) => names[id] ?? "Player";

export function TeamSwatch({ team }: { team: TeamId }) {
  return <span className="team-swatch" data-team={team} aria-hidden />;
}

/** "Blue team", with its colour. */
export function TeamName({ team, you }: { team: TeamId; you?: boolean }) {
  return (
    <span className="team-name">
      <TeamSwatch team={team} />
      {teamName(team)}
      {you && <span className="team-you">you</span>}
    </span>
  );
}

/** The team times of the current set, solve by solve, and each team's set result so far. */
export function currentTeamTimes(match: MatchSnapshot): Record<TeamId, { members: string[]; marks: (Mark | null)[]; standing: SetStanding | null }> {
  const teams = match.teams!;
  const standings = teamStandings(teams.mode, solvesFormat(match), match.roster, teams.of, match.results, match.solvesPerSet);
  return Object.fromEntries(
    TEAM_IDS.map((team) => {
      const members = teamMembers(team, match.roster, teams.of);
      return [team, { members, marks: teamSolveMarks(teams.mode, members, match.results, match.solvesPerSet), standing: standings[team] ?? null }];
    }),
  ) as Record<TeamId, { members: string[]; marks: (Mark | null)[]; standing: SetStanding | null }>;
}

function solvesFormat(match: MatchSnapshot): RoomFormat {
  return match.solvesPerSet === 1 ? "single" : match.solvesPerSet === 5 ? "ao5" : "ao12";
}

/** "0.84" between two team times, or null when one is missing or DNF. */
function gap(a: Mark | null | undefined, b: Mark | null | undefined): string | null {
  return typeof a === "number" && typeof b === "number" ? formatTime(Math.abs(a - b)) : null;
}

/** "Solve 2: Blue team by 0.84" (the last finished solve of this set), or null. */
export function lastSolveLine(match: MatchSnapshot): string | null {
  if (!match.teams || match.phase !== "solving" || match.solveIndex === 0) return null;
  const i = match.solveIndex - 1;
  const times = currentTeamTimes(match);
  const [a, b] = [times.A.marks[i], times.B.marks[i]];
  if (a == null || b == null) return null;
  const label = `Solve ${i + 1}`;
  if (a === "DNF" && b === "DNF") return `${label}: both teams DNF`;
  if (a === b) return `${label}: a tie`;
  const winner: TeamId = b === "DNF" || (typeof a === "number" && typeof b === "number" && a < b) ? "A" : "B";
  const by = gap(a, b);
  return by ? `${label}: ${TEAM_NAMES[winner]} by ${by}` : `${label}: ${TEAM_NAMES[winner]} (the other team DNF)`;
}

// ---------------------------------------------------------------------------

/** The lobby of a team room: a column per team. */
export function TeamSeats(props: {
  room: RoomSnapshot;
  youId: string | null;
  isHost: boolean;
  onChooseTeam: (team: TeamId) => void;
  onBalance: () => void;
  onKick?: (player: PlayerSnapshot) => void;
  onSetWatching?: (watching: boolean) => void;
}) {
  const { room, youId } = props;
  const me = room.players.find((p) => p.id === youId) ?? null;
  // In a running match your team is fixed until it's over.
  const locked = !!(room.match && room.match.phase !== "match_over" && youId && room.match.teams?.of[youId]);
  const racing = room.players.filter((p) => !p.watching);
  const uneven = Math.abs(racing.filter((p) => p.team === "A").length - racing.filter((p) => p.team === "B").length) > 1;

  return (
    <div className="team-seats">
      <div className="team-columns">
        {TEAM_IDS.map((team) => {
          const members = room.players.filter((p) => p.team === team);
          const mine = me?.team === team;
          return (
            <section key={team} className="team-column" data-team={team} data-mine={mine} aria-label={teamName(team)}>
              <header className="team-head">
                <TeamName team={team} you={mine} />
                <span className="count-pill">{members.filter((p) => !p.watching).length}</span>
                <span className="grow" />
                {me && !mine && !locked && (
                  <button type="button" className="team-join" onClick={() => props.onChooseTeam(team)} data-dense>
                    Join
                  </button>
                )}
              </header>
              {members.length > 0 ? (
                <PlayerList players={members} hostId={room.hostId} youId={youId} onKick={props.onKick} seats noEmptySeat />
              ) : (
                <p className="team-empty small muted">Nobody yet</p>
              )}
            </section>
          );
        })}
      </div>
      <div className="team-tools">
        {me && props.onSetWatching && (
          <button type="button" className={me.watching ? "primary" : ""} onClick={() => props.onSetWatching!(!me.watching)}>
            {me.watching ? "Race" : "Just watch"}
          </button>
        )}
        {props.isHost && (
          <button type="button" className="with-icon" onClick={props.onBalance} disabled={!!room.match && room.match.phase !== "match_over"}>
            <Icon name="users" size={16} />
            Balance teams
          </button>
        )}
        <p className="tiny muted grow">
          {uneven
            ? "The teams are uneven. That's fine: a team's time is a mean (or its fastest), not a sum."
            : props.isHost
              ? "Balance teams splits everyone evenly, by their times in this room."
              : "Tap Join to switch teams."}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Above the standings: the team score, and how the last solve went. */
export function TeamScoreboard({ match, youId }: { match: MatchSnapshot; youId: string | null }) {
  const teams = match.teams!;
  const mine = youId ? teams.of[youId] : undefined;
  const leader = teams.points.A === teams.points.B ? null : teams.points.A > teams.points.B ? "A" : "B";
  const line = lastSolveLine(match);
  return (
    <div className="team-score" role="group" aria-label={`Team score: Blue ${teams.points.A}, Red ${teams.points.B}`}>
      <div className="team-score-row">
        <span className="team-side" data-team="A" data-lead={leader === "A"}>
          <TeamSwatch team="A" />
          {TEAM_NAMES.A}
          {mine === "A" && <span className="team-you">you</span>}
        </span>
        <span className="team-points mono" aria-hidden>
          {teams.points.A}
          <span className="muted">–</span>
          {teams.points.B}
        </span>
        <span className="team-side right" data-team="B" data-lead={leader === "B"}>
          {mine === "B" && <span className="team-you">you</span>}
          {TEAM_NAMES.B}
          <TeamSwatch team="B" />
        </span>
      </div>
      <p className="team-score-note tiny muted">
        {line ?? `Set ${match.setIndex + 1}`}
        {match.targetPoints !== null && `, first to ${match.targetPoints} wins`}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** After a set of a team match. */
export function TeamSetResult({ match, names, youId }: { match: MatchSnapshot; names: Names; youId: string | null }) {
  const set = match.finishedSets[match.finishedSets.length - 1];
  if (!set?.teams || !match.teams) return null;
  const { standings, winners } = set.teams;
  const mine = youId ? match.teams.of[youId] : undefined;
  const n = set.setIndex + 1;
  const heading =
    winners.length === 1
      ? winners[0] === mine
        ? `Your team wins set ${n}!`
        : `${teamName(winners[0])} wins set ${n}`
      : winners.length > 1
        ? `Set ${n} is a tie`
        : `No point in set ${n}: both teams DNF`;
  const apart = gap(standings.A?.result, standings.B?.result);
  const label = resultLabel(match);
  const players = Object.entries(set.standings).sort(
    ([a, x], [b, y]) => (match.teams!.of[a] ?? "").localeCompare(match.teams!.of[b] ?? "") || value(x.result) - value(y.result),
  );

  return (
    <div className="result-screen">
      <div className="result-head">
        <p className="small muted">
          Set {n} result{apart ? `, ${apart} apart` : ""}
        </p>
        <h2>{heading}</h2>
      </div>
      <table className="ranking team-ranking">
        <thead>
          <tr>
            <th className="who">Team</th>
            <th>{label}</th>
            <th>best</th>
            <th>pts</th>
          </tr>
        </thead>
        <tbody>
          {TEAM_IDS.filter((team) => standings[team]).map((team) => {
            const won = winners.includes(team);
            return (
              <tr key={team} className={`${won ? "winner" : ""} ${team === mine ? "me" : ""}`}>
                <td className="who">
                  <TeamName team={team} you={team === mine} />
                </td>
                <td className={`num ${standings[team]!.result === "DNF" ? "dnf" : ""}`}>{formatMark(standings[team]!.result)}</td>
                <td className="num">{formatMark(standings[team]!.best)}</td>
                <td className="num">
                  {match.teams!.points[team]}
                  {won ? " (+1)" : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <table className="ranking">
        <caption className="sr-only">Everyone's {label}</caption>
        <thead>
          <tr>
            <th className="who">Player</th>
            <th>{label}</th>
            <th>best</th>
          </tr>
        </thead>
        <tbody>
          {players.map(([id, standing]) => (
            <tr key={id} className={id === youId ? "me" : ""}>
              <td className="who">
                <span className="player-cell">
                  {match.teams!.of[id] && <TeamSwatch team={match.teams!.of[id]} />}
                  <Avatar id={id} name={nameOf(id, names)} size="xs" />
                  <span className="player-cell-name">{nameOf(id, names)}</span>
                </span>
              </td>
              <td className={`num ${standing.result === "DNF" ? "dnf" : ""}`}>{formatMark(standing.result)}</td>
              <td className="num">{formatMark(standing.best)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {match.phaseEndsAt !== null && (
        <div className="next-up">
          <span>Next set</span>
          <ProgressBar endsAt={match.phaseEndsAt} label="Next set" />
        </div>
      )}
    </div>
  );
}

const value = (mark: Mark) => (mark === "DNF" ? Infinity : mark);

function resultLabel(match: MatchSnapshot): string {
  return match.solvesPerSet > 1 ? FORMAT_LABELS[match.solvesPerSet === 5 ? "ao5" : "ao12"] : "single";
}

// ---------------------------------------------------------------------------

/** The heading of a finished team match. */
export function teamMatchHeading(teams: MatchTeams, youId: string | null): string {
  const mine = youId ? teams.of[youId] : undefined;
  if (teams.winners.length !== 1) return "Match over. No winner";
  return teams.winners[0] === mine ? "Your team wins the match!" : `${teamName(teams.winners[0])} wins the match`;
}

/** The end of a team match: both teams side by side (the winners first), with each player's sets. */
export function TeamFinal({ match, names, youId }: { match: MatchSnapshot; names: Names; youId: string | null }) {
  const teams = match.teams!;
  const order = [...TEAM_IDS].sort((a, b) => teams.points[b] - teams.points[a]);
  const best = (id: string) => {
    const marks = match.finishedSets.map((s) => s.standings[id]?.result).filter((m): m is Mark => m !== undefined);
    const times = marks.filter((m): m is number => typeof m === "number");
    return times.length ? Math.min(...times) : marks.length ? "DNF" : undefined;
  };
  return (
    <ol className="team-final">
      {order.map((team) => {
        const won = teams.winners.includes(team);
        const members = Object.keys(teams.of).filter((id) => teams.of[id] === team);
        return (
          <li key={team} className="team-card" data-team={team} data-won={won}>
            <div className="team-card-head">
              <TeamName team={team} you={!!youId && teams.of[youId] === team} />
              <span className="team-card-points mono">
                {teams.points[team]} pt{teams.points[team] === 1 ? "" : "s"}
              </span>
            </div>
            {won && <p className="team-card-won tiny">Winner</p>}
            <ul className="team-card-members">
              {members.map((id) => (
                <li key={id} className={id === youId ? "me" : ""}>
                  <Avatar id={id} name={nameOf(id, names)} size="xs" />
                  <span className="grow">{nameOf(id, names)}</span>
                  <span className="mono tiny muted" title="Their best set result">
                    {formatMark(best(id))}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}

/** A tag for a team in a table row (standings, finish line). */
export function TeamTag({ team }: { team: TeamId }): ReactNode {
  return (
    <span className="team-tag" title={teamName(team)}>
      <TeamSwatch team={team} />
      <span className="sr-only">{teamName(team)}</span>
    </span>
  );
}

