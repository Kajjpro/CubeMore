import { useEffect, useState } from "react";
import {
  CUBE_EVENTS,
  MAX_PLAYERS_LIMIT,
  MIN_PLAYERS_LIMIT,
  ROOM_FORMATS,
  SOLVE_TIME_LIMITS,
  WIN_CONDITIONS,
  type RoomSettings,
} from "@cube-racing/shared";
import { EVENT_SHORT, FORMAT_LABELS, timeLimitLabel, WIN_CONDITION_LABELS } from "../labels";
import { EventIcon, Segmented } from "./ui";

const WIN_EXPLAINED: Record<RoomSettings["winCondition"], string> = {
  bo1: `${WIN_CONDITION_LABELS.bo1}: the first set winner wins the match.`,
  bo3: `${WIN_CONDITION_LABELS.bo3}: first to win 2 sets.`,
  bo5: `${WIN_CONDITION_LABELS.bo5}: first to win 3 sets.`,
  unlimited: "Unlimited: sets continue until the host ends the match.",
};

interface Props {
  settings: RoomSettings;
  /** Called with only the field that changed, e.g. { format: "ao12" }. */
  onChange: (changes: Partial<RoomSettings>) => void;
}

/** Event, format, win condition, time limit, max players. Used when creating a room and by the host in the lobby. */
export function SettingsForm({ settings, onChange }: Props) {
  return (
    <div className="settings-form">
      <div className="field">
        <span className="field-label">Event</span>
        <div className="event-grid">
          {CUBE_EVENTS.map((event) => (
            <button
              key={event.id}
              type="button"
              aria-pressed={settings.cubeEvent === event.id}
              title={event.name}
              onClick={() => onChange({ cubeEvent: event.id })}
            >
              <EventIcon id={event.id} />
              {EVENT_SHORT[event.id]}
            </button>
          ))}
        </div>
      </div>

      <Segmented
        label="Format"
        value={settings.format}
        options={ROOM_FORMATS.map((f) => ({ value: f, label: FORMAT_LABELS[f] }))}
        onChange={(format) => onChange({ format })}
      />
      <Segmented
        label="Win condition"
        value={settings.winCondition}
        options={WIN_CONDITIONS.map((w) => ({ value: w, label: w === "unlimited" ? "Unlimited" : `Bo${w.slice(2)}` }))}
        onChange={(winCondition) => onChange({ winCondition })}
      />
      <Segmented
        label="Time limit per solve"
        value={settings.solveTimeLimit}
        options={SOLVE_TIME_LIMITS.map((l) => ({ value: l, label: timeLimitLabel(l) }))}
        onChange={(solveTimeLimit) => onChange({ solveTimeLimit })}
      />
      <MaxPlayersInput value={settings.maxPlayers} onCommit={(maxPlayers) => onChange({ maxPlayers })} />
      <p className="tiny muted">{WIN_EXPLAINED[settings.winCondition]}</p>
    </div>
  );
}

/** Sends the value only when you leave the box or press Enter, so typing "30" doesn't send "3" first. */
function MaxPlayersInput(props: { value: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(props.value));
  useEffect(() => setDraft(String(props.value)), [props.value]);

  function commit(): void {
    const number = Number(draft);
    if (Number.isInteger(number) && number !== props.value) props.onCommit(number);
    else setDraft(String(props.value));
  }

  return (
    <label className="field max-players">
      <span className="field-label">Max players</span>
      <input
        type="number"
        inputMode="numeric"
        min={MIN_PLAYERS_LIMIT}
        max={MAX_PLAYERS_LIMIT}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
    </label>
  );
}
