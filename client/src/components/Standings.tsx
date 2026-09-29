import { memo, useState } from "react";
import type { MatchSnapshot, Penalty, PlayerSnapshot, RoomSnapshot, SolveResult } from "@cube-racing/shared";
import { FORMAT_LABELS } from "../labels";
import { solveKey, useOutbox } from "../outbox";
import { droppedIndexes, fastestInColumn, scoredMs } from "../stats";
import { formatMark, formatResult, formatResultLong, formatSolve, formatTime } from "../time";

interface Props {
  room: RoomSnapshot;
  match: MatchSnapshot;
  youId: string | null;
  names: Record<string, string>;
  /** Phones: your own row first. */
  pinMe: boolean;
  /** Phone landscape: name, this solve, average, points only. */
  compact: boolean;
  onChangePenalty: (solveIndex: number, penalty: Penalty) => void;
}

/**
 * Rows are ordered by points, then by join order. Points only change at the set
 * result, so rows never jump around while people submit during a set.
 */
function rowOrder(room: RoomSnapshot, match: MatchSnapshot, youId: string | null, pinMe: boolean): string[] {
  const joinOrder = new Map(room.players.map((p, i) => [p.id, i]));
  const spectators = room.players.filter((p) => p.spectator).map((p) => p.id);
  const ids = [...match.roster, ...spectators];
  const position = (id: string) => joinOrder.get(id) ?? 1000 + match.roster.indexOf(id);
  ids.sort((a, b) => (match.points[b] ?? 0) - (match.points[a] ?? 0) || position(a) - position(b));
  if (pinMe && youId && ids.includes(youId)) {
    return [youId, ...ids.filter((id) => id !== youId)];
  }
  return ids;
}

export const Standings = memo(function Standings(props: Props) {
  const { room, match, youId, names, compact } = props;
  const outbox = useOutbox();
  const [editing, setEditing] = useState<number | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  const players = new Map(room.players.map((p) => [p.id, p]));
  const rows = rowOrder(room, match, youId, props.pinMe);
  const setOpen = match.phase === "solving" || match.phase === "solve_review";
  const solveNumbers = compact ? [match.solveIndex] : Array.from({ length: match.solvesPerSet }, (_, i) => i);
  const fastest = solveNumbers.map((i) => fastestInColumn(match.results, i));
  const hasAverage = match.solvesPerSet > 1;
  const editingResult = editing !== null && youId ? match.results[youId]?.[editing] : null;

  function toggleReveal(cell: string): void {
    setRevealed((old) => {
      const next = new Set(old);
      if (next.has(cell)) next.delete(cell);
      else next.add(cell);
      return next;
    });
  }

  return (
    <div className="standings-wrap">
      <div className="table-scroll">
        <table className="standings">
          <thead>
            <tr>
              <th className="name-col" scope="col">
                Player
              </th>
              {solveNumbers.map((i) => (
                <th key={i} scope="col" className={i === match.solveIndex && setOpen ? "current" : ""}>
                  {compact ? `Solve ${i + 1}` : i + 1}
                </th>
              ))}
              {hasAverage && <th scope="col">{FORMAT_LABELS[match.solvesPerSet === 5 ? "ao5" : "ao12"]}</th>}
              {!compact && <th scope="col">best</th>}
              <th scope="col">pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((id) => {
              const player = players.get(id);
              const row = match.results[id];
              const isMe = id === youId;
              const dropped = droppedIndexes(row, room.settings.format);
              const standing = match.standings[id];
              const best = standing?.best ?? bestSoFar(row);
              return (
                <tr key={id} className={isMe ? "me" : ""}>
                  <th className="name-col" scope="row">
                    <span className="name" title={player?.nickname ?? names[id]}>
                      {player?.nickname ?? names[id] ?? "Player"}
                    </span>
                    <RowStatus player={player} match={match} isMe={isMe} isHost={id === room.hostId} hasResult={!!row?.[match.solveIndex]} />
                  </th>
                  {solveNumbers.map((i, column) => {
                    const result = row?.[i] ?? null;
                    const cellId = `${id}/${i}`;
                    const pendingEntry = isMe
                      ? outbox.find((e) => solveKey(e) === solveKey({ roomCode: room.code, matchId: match.matchId, setIndex: match.setIndex, solveIndex: i }))
                      : undefined;
                    return (
                      <td key={i} className={`time-cell ${i === match.solveIndex && setOpen ? "current" : ""}`}>
                        <TimeCell
                          result={result}
                          pending={pendingEntry ? formatSolve(pendingEntry.timeMs, pendingEntry.penalty) : null}
                          dropped={dropped.includes(i)}
                          fastest={fastest[column].has(id)}
                          editable={isMe && setOpen && result?.source === "submitted"}
                          revealed={revealed.has(cellId)}
                          onEdit={() => setEditing(editing === i ? null : i)}
                          onReveal={() => toggleReveal(cellId)}
                        />
                      </td>
                    );
                  })}
                  {hasAverage && <td className="num">{formatMark(standing?.result)}</td>}
                  {!compact && <td className="num">{best === null ? "–" : formatMark(best)}</td>}
                  <td className="num">{match.points[id] ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing !== null && editingResult && setOpen && (
        <div className="penalty-editor" role="group" aria-label={`Penalty for solve ${editing + 1}`}>
          <span className="small">Solve {editing + 1}</span>
          {(["OK", "+2", "DNF"] as const).map((penalty) => (
            <button
              key={penalty}
              type="button"
              aria-pressed={editingResult.penalty === penalty}
              onClick={() => {
                props.onChangePenalty(editing, penalty);
                setEditing(null);
              }}
            >
              {penalty}
            </button>
          ))}
          <button type="button" className="quiet" onClick={() => setEditing(null)}>
            Close
          </button>
        </div>
      )}
    </div>
  );
});

function bestSoFar(row: (SolveResult | null)[] | undefined): number | "DNF" | null {
  const done = (row ?? []).filter((r): r is SolveResult => r !== null);
  if (done.length === 0) return null;
  const values = done.map(scoredMs).filter((v): v is number => v !== null);
  return values.length ? Math.min(...values) : "DNF";
}

function TimeCell(props: {
  result: SolveResult | null;
  pending: string | null;
  dropped: boolean;
  fastest: boolean;
  editable: boolean;
  revealed: boolean;
  onEdit: () => void;
  onReveal: () => void;
}) {
  const { result } = props;
  if (!result) {
    return props.pending ? (
      <span className="pending" title="Sending">
        {props.pending}
      </span>
    ) : null;
  }

  const isDnf = result.penalty === "DNF";
  const text = props.revealed ? formatResultLong(result) : formatResult(result);
  const shown = props.dropped ? `(${text})` : text;
  const tone = props.dropped
    ? "dropped"
    : isDnf
      ? "t-red"
      : props.fastest
        ? "fastest"
        : result.penalty === "+2"
          ? "t-amber"
          : "";
  const label = `${formatResultLong(result)}${props.fastest && !isDnf ? ", fastest" : ""}${props.dropped ? ", dropped" : ""}`;

  if (props.editable) {
    return (
      <button type="button" className={`cell-button ${tone}`} onClick={props.onEdit} aria-label={`${label}. Change penalty`}>
        {shown}
      </button>
    );
  }
  if (isDnf && result.timeMs > 0) {
    return (
      <button type="button" className={`cell-button ${tone}`} onClick={props.onReveal} title={formatResultLong(result)} aria-label={label}>
        {shown}
      </button>
    );
  }
  return (
    <span className={tone} title={result.penalty === "+2" ? `${formatTime(result.timeMs)} + 2` : undefined} aria-label={label}>
      {shown}
    </span>
  );
}

function RowStatus(props: { player?: PlayerSnapshot; match: MatchSnapshot; isMe: boolean; isHost: boolean; hasResult: boolean }) {
  const { player, match } = props;
  const parts: React.ReactNode[] = [];
  if (props.isMe) parts.push("you");
  if (props.isHost) parts.push("host");

  let status: React.ReactNode = null;
  if (!player) status = "left";
  else if (player.status === "reconnecting") status = <span className="t-amber">reconnecting</span>;
  else if (player.spectator) status = "spectator";
  else if (match.phase === "solving") {
    if (props.hasResult) status = "done";
    else if (player.timerStatus === "solving")
      status = (
        <>
          <span className="dot live" aria-hidden />
          solving
        </>
      );
  }

  if (!status && parts.length === 0) return null;
  return (
    <span className="row-status">
      {parts.join(" · ")}
      {parts.length > 0 && status ? " · " : ""}
      {status}
    </span>
  );
}
