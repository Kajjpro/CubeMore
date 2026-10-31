import { useEffect, useState } from "react";
import type { MatchSnapshot, Penalty, RoomFormat } from "@cube-racing/shared";
import { droppedIndexes } from "../stats";
import { formatResult, formatSolve } from "../time";
import { Icon } from "./ui";

/**
 * Under the timer: your times in this set, always in sight. Tap one to change
 * its penalty (forgot the +2, or it was a DNF), like clicking a time in
 * csTimer. Penalties can change until the set result shows (the server says
 * the same); the times themselves never change.
 */
export function YourSolves(props: {
  match: MatchSnapshot;
  youId: string;
  format: RoomFormat;
  onChangePenalty: (solveIndex: number, penalty: Penalty) => void;
}) {
  const { match } = props;
  const row = match.results[props.youId];
  const [editing, setEditing] = useState<number | null>(null);
  // Another set: nothing stays open.
  const setKey = `${match.matchId}/${match.setIndex}`;
  useEffect(() => setEditing(null), [setKey]);

  // Nothing to show before your first time of the set.
  if (!row || row.every((result) => result === null)) return null;
  const editable = match.phase === "solving" || match.phase === "solve_review";
  const dropped = droppedIndexes(row, props.format);
  const chosen = editing !== null ? row[editing] : null;

  return (
    <div className="your-solves">
      <div className="your-solves-row">
        <span className="your-solves-label">Your set</span>
        <ol className="your-solves-list">
          {row.map((result, i) => {
            const text = result ? formatResult(result) : "–";
            const shown = dropped.includes(i) ? `(${text})` : text;
            const current = i === match.solveIndex && match.phase === "solving";
            const canEdit = editable && result?.source === "submitted";
            const label = `Solve ${i + 1}: ${result ? formatResult(result) : "not done yet"}`;
            return (
              <li key={i} data-current={current || undefined}>
                {canEdit ? (
                  <button
                    type="button"
                    className="your-solve"
                    aria-expanded={editing === i}
                    aria-label={`${label}. Change its penalty`}
                    data-penalty={result.penalty}
                    onClick={() => setEditing(editing === i ? null : i)}
                    data-dense
                  >
                    <span className="solve-no">{i + 1}</span>
                    {shown}
                  </button>
                ) : (
                  <span className="your-solve" aria-label={label} data-penalty={result?.penalty} data-empty={!result || undefined}>
                    <span className="solve-no">{i + 1}</span>
                    {shown}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
      {editing !== null && chosen && editable && (
        <div className="penalty-editor your-solves-editor" role="group" aria-label={`Penalty for solve ${editing + 1}`}>
          <span className="tiny">Solve {editing + 1}</span>
          {(["OK", "+2", "DNF"] as const).map((penalty) => (
            <button
              key={penalty}
              type="button"
              aria-pressed={chosen.penalty === penalty}
              onClick={(event) => {
                props.onChangePenalty(editing, penalty);
                setEditing(null);
                // Space must start the timer again, not press this button.
                event.currentTarget.blur();
              }}
              data-dense
            >
              <b>{penalty}</b>
              <span className="pen-time">{penalty === "DNF" ? `(${formatSolve(chosen.timeMs, "OK")})` : formatSolve(chosen.timeMs, penalty)}</span>
            </button>
          ))}
          <button type="button" className="quiet" onClick={() => setEditing(null)} aria-label="Close" data-dense>
            <Icon name="x" size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
