import { Fragment, memo, useEffect, useRef, useState } from "react";
import { serverNow } from "../clock";
import type { MatchSnapshot, Penalty, PlayerSnapshot, RoomSnapshot, SolveResult } from "@cube-racing/shared";
import { FORMAT_LABELS } from "../labels";
import { solveKey, useOutbox } from "../outbox";
import { droppedIndexes, fastestInColumn } from "../stats";
import { formatMark, formatResult, formatResultLong, formatSolve } from "../time";
import type { CubeMoves } from "../useRoom";
import { Pops, ReactionTray, type Reaction, type ReactionPops } from "./Reactions";
import { LiveCube } from "./Scramble";
import { Avatar, EventIcon, Icon } from "./ui";

interface Props {
  room: RoomSnapshot;
  match: MatchSnapshot;
  youId: string | null;
  names: Record<string, string>;
  /** Phones: your own row first. */
  pinMe: boolean;
  /** Reactions floating on rows right now. */
  pops: ReactionPops;
  /** Smart cube moves of players solving now: their row gets a cube icon, tap to watch. */
  cubeMoves: CubeMoves;
  onChangePenalty: (solveIndex: number, penalty: Penalty) => void;
  onReact: (targetId: string, emoji: Reaction) => void;
}

/**
 * Rows are ordered by points, then join order. Points only change at the set
 * result, so rows never jump around while people submit during a set.
 */
export function rowOrder(room: RoomSnapshot, match: MatchSnapshot, youId: string | null, pinMe: boolean): string[] {
  const joinOrder = new Map(room.players.map((p, i) => [p.id, i]));
  const spectators = room.players.filter((p) => p.spectator).map((p) => p.id);
  const ids = [...match.roster, ...spectators];
  const position = (id: string) => joinOrder.get(id) ?? 1000 + match.roster.indexOf(id);
  ids.sort((a, b) => (match.points[b] ?? 0) - (match.points[a] ?? 0) || position(a) - position(b));
  if (pinMe && youId && ids.includes(youId)) return [youId, ...ids.filter((id) => id !== youId)];
  return ids;
}

/** Rank by points: players with the same points share a rank (1, 2, 2, 4). */
export function ranks(ids: string[], points: Record<string, number>): Map<string, number> {
  const sorted = [...ids].sort((a, b) => (points[b] ?? 0) - (points[a] ?? 0));
  const result = new Map<string, number>();
  sorted.forEach((id, i) => {
    const previous = sorted[i - 1];
    result.set(id, previous !== undefined && (points[previous] ?? 0) === (points[id] ?? 0) ? result.get(previous)! : i + 1);
  });
  return result;
}

/** Dense live standings: #, player, this solve, average, points. Tap a row for the whole set. */
export const Standings = memo(function Standings(props: Props) {
  const { room, match, youId, names } = props;
  const outbox = useOutbox();
  const [open, setOpen] = useState<string | null>(null);

  const players = new Map(room.players.map((p) => [p.id, p]));
  const rows = rowOrder(room, match, youId, props.pinMe);
  const rankOf = ranks(rows, match.points);
  const fastest = fastestInColumn(match.results, match.solveIndex);
  const hasAverage = match.solvesPerSet > 1;
  const columns = hasAverage ? 5 : 4;
  const averageLabel = FORMAT_LABELS[match.solvesPerSet === 5 ? "ao5" : "ao12"];

  const solveKeyNow = `${match.matchId}/${match.setIndex}/${match.solveIndex}`;
  const liveMovesOf = (id: string) => {
    const entry = props.cubeMoves[id];
    return match.phase === "solving" && entry?.solveKey === solveKeyNow ? entry.moves : null;
  };

  const myPending = (solveIndex: number) =>
    outbox.find(
      (e) => solveKey(e) === solveKey({ roomCode: room.code, matchId: match.matchId, setIndex: match.setIndex, solveIndex }),
    );

  return (
    <div className="table-scroll dense-scroll">
      <table className="standings dense">
        <thead>
          <tr>
            <th scope="col" className="rank">#</th>
            <th scope="col" className="name-col">Player</th>
            <th scope="col">{hasAverage ? `Solve ${match.solveIndex + 1}` : "Time"}</th>
            {hasAverage && <th scope="col">{averageLabel}</th>}
            <th scope="col">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((id) => {
            const player = players.get(id);
            const row = match.results[id];
            const isMe = id === youId;
            const expanded = open === id;
            const pending = isMe ? myPending(match.solveIndex) : undefined;
            return (
              <Fragment key={id}>
                <tr className={`${isMe ? "me" : ""} ${expanded ? "open" : ""}`} onClick={() => setOpen(expanded ? null : id)}>
                  <td className="rank">
                    <span className={`rank-badge ${rankOf.get(id) === 1 && match.points[id] ? "leader" : ""}`}>{rankOf.get(id)}</span>
                  </td>
                  <th scope="row" className="name-col">
                    <button type="button" className="row-toggle" aria-expanded={expanded} data-dense title={player?.nickname ?? names[id]}>
                      <Avatar id={id} name={player?.nickname ?? names[id]} size="xs" />
                      <span className="row-name">{player?.nickname ?? names[id] ?? "Player"}</span>
                      {id === room.hostId && (
                        <span className="host-mark" title="Host">
                          <Icon name="crown" size={12} />
                          <span className="sr-only"> host</span>
                        </span>
                      )}
                      {liveMovesOf(id) && (
                        <span className="smart-mark" title="Smart cube: tap to watch it live">
                          <EventIcon id="333" />
                        </span>
                      )}
                    </button>
                    <Pops pops={props.pops[id]} />
                  </th>
                  <td className="time-cell">
                    <CurrentCell
                      result={row?.[match.solveIndex] ?? null}
                      pending={pending ? formatSolve(pending.timeMs, pending.penalty) : null}
                      fastest={fastest.has(id)}
                      player={player}
                      solvingPhase={match.phase === "solving"}
                    />
                  </td>
                  {hasAverage && <td className="num avg">{formatMark(match.standings[id]?.result)}</td>}
                  <td className="num pts">
                    <span className={(match.points[id] ?? 0) > 0 ? "pts-some" : "pts-zero"}>{match.points[id] ?? 0}</span>
                  </td>
                </tr>
                {expanded && (
                  <tr className="details">
                    <td colSpan={columns}>
                      {liveMovesOf(id) && match.scramble && (
                        <div className="live-cube-wrap">
                          <LiveCube scramble={match.scramble} moves={liveMovesOf(id)!} />
                          <span className="tiny muted">Live: {liveMovesOf(id)!.length} moves</span>
                        </div>
                      )}
                      <SetDetails
                        pace={match.paces ? (match.paces[id] ?? null) : undefined}
                        name={player?.nickname ?? names[id] ?? "Player"}
                        onReact={player && !isMe ? (emoji) => props.onReact(id, emoji) : undefined}
                        row={row}
                        format={room.settings.format}
                        isMe={isMe}
                        editable={isMe && (match.phase === "solving" || match.phase === "solve_review")}
                        onChangePenalty={props.onChangePenalty}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});

/** The "this solve" cell: the time, or what the player is doing. Plain text: the fastest is bold, DNF is grey. */
function CurrentCell(props: {
  result: SolveResult | null;
  pending: string | null;
  fastest: boolean;
  player?: PlayerSnapshot;
  solvingPhase: boolean;
}) {
  const { result, player } = props;
  if (result) {
    const tone = result.penalty === "DNF" ? "dnf" : props.fastest ? "fastest" : "";
    return (
      <span className={tone} title={formatResultLong(result)}>
        {formatResult(result)}
        {props.fastest && result.penalty !== "DNF" && <span className="sr-only"> fastest</span>}
      </span>
    );
  }
  if (props.pending) return <span className="pending" title="Sending">{props.pending}</span>;
  if (!player) return <span className="status muted">left</span>;
  if (player.status === "reconnecting") return <span className="status muted">offline</span>;
  if (player.spectator) return <span className="status muted">watching</span>;
  if (props.solvingPhase && player.timerStatus === "solving") {
    return player.solvingSince !== null ? (
      <LiveClock since={player.solvingSince} />
    ) : (
      <span className="status">
        solving
      </span>
    );
  }
  return <span className="muted">–</span>;
}

/** "7.4", "1:02.4": whole tenths, so it reads as "still going" and not as a final time. */
function clockText(ms: number): string {
  const tenths = Math.floor(ms / 100);
  const seconds = Math.floor(tenths / 10);
  const text = `${seconds % 60}.${tenths % 10}`;
  return seconds >= 60 ? `${Math.floor(seconds / 60)}:${text.padStart(4, "0")}` : text;
}

/**
 * An opponent's running time, ticking live. Written straight into the page
 * (not through React) ten times a second, so the table doesn't re-render.
 */
export function LiveClock({ since }: { since: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const draw = () => {
      if (ref.current) ref.current.textContent = clockText(Math.max(0, serverNow() - since));
    };
    draw();
    const interval = setInterval(draw, 100);
    return () => clearInterval(interval);
  }, [since]);
  return (
    <span className="live-clock" title="Solving now">
      <span ref={ref} />
      <span className="sr-only"> solving</span>
    </span>
  );
}

/** A player's whole set: dropped times in parentheses; your own times can be tapped to change the penalty. */
function SetDetails(props: {
  /** Handicap: their pace for this set (null = still setting it). Undefined in normal rooms. */
  pace?: number | null;
  name: string;
  /** Other players who are still here: react to their latest time. */
  onReact?: (emoji: Reaction) => void;
  row: (SolveResult | null)[] | undefined;
  format: RoomSnapshot["settings"]["format"];
  isMe: boolean;
  editable: boolean;
  onChangePenalty: (solveIndex: number, penalty: Penalty) => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const row = props.row ?? [];
  const dropped = droppedIndexes(props.row, props.format);
  if (row.length === 0) return <p className="tiny muted">Watching this set; races from the next one.</p>;

  return (
    <div className="set-details" onClick={(e) => e.stopPropagation()}>
      {props.pace !== undefined && (
        <p className="tiny muted">
          {props.pace === null ? "Setting their pace this set" : `Pace ${formatMark(props.pace)}: beat it by the most to win the set`}
        </p>
      )}
      <ol className="solve-chips">
        {row.map((result, i) => {
          const text = result ? formatResult(result) : "–";
          const shown = dropped.includes(i) ? `(${text})` : text;
          const tone = !result ? "muted" : dropped.includes(i) ? "dropped" : result.penalty === "DNF" ? "dnf" : "";
          const canEdit = props.editable && result?.source === "submitted";
          return (
            <li key={i}>
              <span className="solve-no">{i + 1}</span>
              {canEdit ? (
                <button type="button" className={`chip-button ${tone}`} onClick={() => setEditing(editing === i ? null : i)} data-dense>
                  {shown}
                </button>
              ) : (
                <span className={tone} title={result ? formatResultLong(result) : undefined}>
                  {shown}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {editing !== null && row[editing] && (
        <div className="penalty-editor" role="group" aria-label={`Penalty for solve ${editing + 1}`}>
          <span className="tiny">Solve {editing + 1}</span>
          {(["OK", "+2", "DNF"] as const).map((penalty) => (
            <button
              key={penalty}
              type="button"
              aria-pressed={row[editing]!.penalty === penalty}
              data-dense
              onClick={() => {
                props.onChangePenalty(editing, penalty);
                setEditing(null);
              }}
            >
              {penalty}
            </button>
          ))}
        </div>
      )}
      {props.isMe && props.editable && editing === null && <p className="tiny muted">Tap one of your times to change its penalty.</p>}
      {props.onReact && row.some((r) => r !== null) && <ReactionTray label={`React to ${props.name}`} onReact={props.onReact} />}
    </div>
  );
}
