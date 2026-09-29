// The smaller pieces of the room: player list, host tools, session stats, and
// the solve review / set result / match over screens.

import { memo, useState } from "react";
import type { CubeEventId, MatchSnapshot, PlayerSnapshot, RoomSettings, RoomSnapshot } from "@cube-racing/shared";
import { EVENT_SHORT, FORMAT_LABELS, nameList } from "../labels";
import type { SessionStats } from "../stats";
import { formatMark, formatResultLong } from "../time";
import { scoredMs } from "../stats";
import { ConfirmButton } from "./ConfirmButton";
import { EventSelect } from "./SettingsForm";

type RestartChanges = Partial<Pick<RoomSettings, "cubeEvent" | "format" | "solveTimeLimit">>;
import { ProgressBar } from "./ui";

type Names = Record<string, string>;
const nameOf = (id: string, names: Names) => names[id] ?? "Player";

/** Roster players (present) still missing a result for the current solve, excluding you. */
export function waitingNames(room: RoomSnapshot, match: MatchSnapshot, youId: string | null): string[] {
  if (match.phase !== "solving") return [];
  return match.roster
    .filter((id) => id !== youId && match.results[id]?.[match.solveIndex] === null)
    .map((id) => room.players.find((p) => p.id === id)?.nickname)
    .filter((name): name is string => !!name);
}

export function waitingText(names: string[]): string | null {
  return names.length ? `Waiting for ${nameList(names)}` : null;
}

// ---------------------------------------------------------------------------

export const PlayerList = memo(function PlayerList(props: {
  players: PlayerSnapshot[];
  hostId: string | null;
  youId: string | null;
  onKick?: (player: PlayerSnapshot) => void;
}) {
  return (
    <ul className="list">
      {props.players.map((player) => (
        <li key={player.id}>
          <span className={`dot ${player.status === "connected" ? "ok" : "warn"}`} aria-hidden />
          <span className="name" title={player.nickname}>
            {player.nickname}
          </span>
          {player.id === props.youId && <span className="tag">you</span>}
          {player.id === props.hostId && <span className="tag">host</span>}
          {player.status === "reconnecting" && <span className="tiny t-amber">reconnecting</span>}
          {props.onKick && player.id !== props.youId && (
            <ConfirmButton
              className="quiet danger"
              label="Kick"
              confirmLabel="Confirm kick"
              ariaLabel={`Kick ${player.nickname}`}
              onConfirm={() => props.onKick!(player)}
            />
          )}
        </li>
      ))}
    </ul>
  );
});

// ---------------------------------------------------------------------------

export const HostPanel = memo(function HostPanel(props: {
  room: RoomSnapshot;
  match: MatchSnapshot;
  youId: string | null;
  onSkip: (player: PlayerSnapshot) => void;
  onKick: (player: PlayerSnapshot) => void;
  onEndMatch: () => void;
  onRestart: (changes: RestartChanges) => void;
}) {
  const { room, match } = props;
  const waiting =
    match.phase === "solving"
      ? room.players.filter(
          (p) => p.id !== props.youId && match.roster.includes(p.id) && match.results[p.id]?.[match.solveIndex] === null,
        )
      : [];

  return (
    <div className="side-section">
      <h3>Host</h3>
      {waiting.length > 0 && (
        <ul className="list">
          {waiting.map((player) => (
            <li key={player.id}>
              <span className="name">{player.nickname}</span>
              <span className="tiny muted">{player.timerStatus === "solving" ? "solving" : "not started"}</span>
              <button type="button" onClick={() => props.onSkip(player)} aria-label={`Skip ${player.nickname} (DNF for this solve)`}>
                Skip
              </button>
            </li>
          ))}
        </ul>
      )}
      <details>
        <summary>Players ({room.players.length})</summary>
        <PlayerList players={room.players} hostId={room.hostId} youId={props.youId} onKick={props.onKick} />
      </details>
      {match.phase !== "match_over" && (
        <>
          <RestartControl current={room.settings.cubeEvent} onRestart={props.onRestart} />
          <ConfirmButton className="danger" label="End match" confirmLabel="Tap again to end the match" onConfirm={props.onEndMatch} />
        </>
      )}
    </div>
  );
});

/** Host, during a match: switch to another event and start over (points back to 0). */
function RestartControl({ current, onRestart }: { current: CubeEventId; onRestart: (changes: RestartChanges) => void }) {
  const [cubeEvent, setCubeEvent] = useState<CubeEventId>(current);
  return (
    <details className="restart">
      <summary>Change event and restart</summary>
      <div className="settings-form">
        <EventSelect label="Next event" value={cubeEvent} onChange={setCubeEvent} />
        <ConfirmButton
          label={`Restart with ${EVENT_SHORT[cubeEvent]}`}
          confirmLabel="Tap again: points go back to 0"
          onConfirm={() => onRestart({ cubeEvent })}
        />
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------

export const SessionPanel = memo(function SessionPanel({ stats }: { stats: SessionStats }) {
  const show = (value: number | null | undefined) => (value === undefined ? "–" : formatMark(value ?? "DNF"));
  return (
    <details className="side-section">
      <summary>Your session</summary>
      <dl className="stats">
        <div>
          <dt>solves</dt>
          <dd>{stats.solves}</dd>
        </div>
        <div>
          <dt>best</dt>
          <dd>{stats.solves ? show(stats.best) : "–"}</dd>
        </div>
        <div>
          <dt>best ao5</dt>
          <dd>{show(stats.bestAo5)}</dd>
        </div>
        <div>
          <dt>best ao12</dt>
          <dd>{show(stats.bestAo12)}</dd>
        </div>
        <div>
          <dt>mean</dt>
          <dd>{stats.solves ? show(stats.mean) : "–"}</dd>
        </div>
      </dl>
    </details>
  );
});

// ---------------------------------------------------------------------------

/** After each solve: everyone's time, fastest first. */
export function SolveReview({ match, names, youId }: { match: MatchSnapshot; names: Names; youId: string | null }) {
  const rows = match.roster
    .map((id) => ({ id, result: match.results[id]?.[match.solveIndex] ?? null }))
    .filter((row) => row.result !== null)
    .sort((a, b) => (scoredMs(a.result!) ?? Infinity) - (scoredMs(b.result!) ?? Infinity));
  const fastestValue = rows.length ? scoredMs(rows[0].result!) : null;
  const fastest = rows.filter((r) => fastestValue !== null && scoredMs(r.result!) === fastestValue);

  return (
    <div className="result-screen">
      <h2>
        Solve {match.solveIndex + 1} of {match.solvesPerSet}
      </h2>
      <p className="small">
        {fastest.length
          ? `Fastest: ${fastest.map((r) => nameOf(r.id, names)).join(" and ")}, ${formatMark(fastestValue!)}`
          : "Everyone DNF"}
      </p>
      <table className="ranking">
        <tbody>
          {rows.map(({ id, result }, index) => (
            <tr key={id} className={id === youId ? "me" : ""}>
              <td className="rank">{index + 1}</td>
              <td className="who">{nameOf(id, names)}</td>
              <td className={`num ${result!.penalty === "DNF" ? "t-red" : fastest.some((f) => f.id === id) ? "t-green" : result!.penalty === "+2" ? "t-amber" : ""}`}>
                {formatResultLong(result!)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {match.phaseEndsAt !== null && <ProgressBar endsAt={match.phaseEndsAt} label="Next scramble" />}
    </div>
  );
}

/** After each set: the winner in plain text, averages and points. */
export function SetResult({ match, names, youId }: { match: MatchSnapshot; names: Names; youId: string | null }) {
  const set = match.finishedSets[match.finishedSets.length - 1];
  if (!set) return null;
  const valueOf = (m: number | "DNF") => (m === "DNF" ? Infinity : m);
  const rows = Object.entries(set.standings).sort(
    ([, a], [, b]) => valueOf(a.result) - valueOf(b.result) || valueOf(a.best) - valueOf(b.best),
  );
  const winners = set.winnerIds.map((id) => nameOf(id, names));
  const heading = winners.length
    ? `${nameList(winners)} ${winners.length > 1 ? "win" : "wins"} set ${set.setIndex + 1}`
    : `No point in set ${set.setIndex + 1}: every result is DNF`;
  const label = match.solvesPerSet > 1 ? FORMAT_LABELS[match.solvesPerSet === 5 ? "ao5" : "ao12"] : "single";

  return (
    <div className="result-screen">
      <h2>{heading}</h2>
      <table className="ranking">
        <thead>
          <tr>
            <th className="rank">#</th>
            <th className="who">Player</th>
            <th>{label}</th>
            <th>best</th>
            <th>pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([id, standing], index) => {
            const won = set.winnerIds.includes(id);
            return (
              <tr key={id} className={`${won ? "winner" : ""} ${id === youId ? "me" : ""}`}>
                <td className="rank">{index + 1}</td>
                <td className="who">{nameOf(id, names)}</td>
                <td className={`num ${standing.result === "DNF" ? "t-red" : ""}`}>{formatMark(standing.result)}</td>
                <td className="num">{formatMark(standing.best)}</td>
                <td className="num">
                  {match.points[id] ?? 0}
                  {won ? " (+1)" : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {match.phaseEndsAt !== null && <ProgressBar endsAt={match.phaseEndsAt} label="Next set" />}
    </div>
  );
}

/** The end: winner in plain text, final standings; the host picks what's next. */
export function MatchOver(props: {
  match: MatchSnapshot;
  names: Names;
  youId: string | null;
  isHost: boolean;
  busy: boolean;
  /** The event of the match that just ended (the host may pick another one). */
  cubeEvent: CubeEventId;
  onRematch: (changes: RestartChanges) => void;
  onBackToLobby: () => void;
}) {
  const { match, names } = props;
  const [nextEvent, setNextEvent] = useState<CubeEventId>(props.cubeEvent);
  const winners = match.winnerIds.map((id) => nameOf(id, names));
  const rows = Object.entries(match.points).sort(([, a], [, b]) => b - a);

  return (
    <div className="result-screen">
      <h2>{winners.length ? `${nameList(winners)} ${winners.length > 1 ? "win" : "wins"} the match` : "Match over. No winner"}</h2>
      <table className="ranking">
        <thead>
          <tr>
            <th className="rank">#</th>
            <th className="who">Player</th>
            <th>pts</th>
            <th>sets won</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([id, points], index) => (
            <tr key={id} className={`${match.winnerIds.includes(id) ? "winner" : ""} ${id === props.youId ? "me" : ""}`}>
              <td className="rank">{index + 1}</td>
              <td className="who">{nameOf(id, names)}</td>
              <td className="num">{points}</td>
              <td className="num">{match.finishedSets.filter((s) => s.winnerIds.includes(id)).length}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {props.isHost ? (
        <>
          <EventSelect label="Next event" value={nextEvent} onChange={setNextEvent} />
          <div className="row">
            <button type="button" className="grow" onClick={props.onBackToLobby} disabled={props.busy}>
              Back to lobby
            </button>
            <button
              type="button"
              className="primary grow"
              onClick={() => props.onRematch({ cubeEvent: nextEvent })}
              disabled={props.busy}
            >
              {props.busy ? "Starting…" : nextEvent === props.cubeEvent ? "Rematch" : `Rematch with ${EVENT_SHORT[nextEvent]}`}
            </button>
          </div>
        </>
      ) : (
        <p className="small muted">Waiting for host</p>
      )}
    </div>
  );
}
