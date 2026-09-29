import { useEffect, useId, useState } from "react";
import {
  CUBE_EVENTS,
  MAX_PLAYERS_LIMIT,
  MIN_PLAYERS_LIMIT,
  ROOM_FORMATS,
  SOLVE_TIME_LIMITS,
  WIN_CONDITIONS,
  type CubeEventId,
  type RoomSettings,
} from "@cube-racing/shared";
import { FORMAT_LABELS, timeLimitLabel, WIN_CONDITION_LABELS } from "../labels";
import { EventIcon, Segmented } from "./ui";

/** The event as a compact menu (with its WCA icon), not a grid of every puzzle. */
export function EventSelect(props: { value: CubeEventId; onChange: (id: CubeEventId) => void; label?: string }) {
  const id = useId();
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {props.label ?? "Event"}
      </label>
      <div className="event-select">
        <EventIcon id={props.value} />
        <select id={id} value={props.value} onChange={(e) => props.onChange(e.target.value as CubeEventId)}>
          {CUBE_EVENTS.map((event) => (
            <option key={event.id} value={event.id}>
              {event.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function FormatField(props: { value: RoomSettings["format"]; onChange: (format: RoomSettings["format"]) => void }) {
  return (
    <Segmented
      label="Format"
      value={props.value}
      options={ROOM_FORMATS.map((f) => ({ value: f, label: FORMAT_LABELS[f] }))}
      onChange={props.onChange}
    />
  );
}

export function BestOfField(props: { value: RoomSettings["winCondition"]; onChange: (w: RoomSettings["winCondition"]) => void }) {
  return (
    <Segmented
      label="Best of (can't be changed later)"
      value={props.value}
      options={WIN_CONDITIONS.map((w) => ({ value: w, label: w === "unlimited" ? "Unlimited" : `Bo${w.slice(2)}` }))}
      onChange={props.onChange}
    />
  );
}

/** Time limit and max players: the less common options. */
export function MoreOptions(props: { settings: RoomSettings; onChange: (changes: Partial<RoomSettings>) => void }) {
  return (
    <details className="more-options">
      <summary>More options</summary>
      <div className="settings-form">
        <Segmented
          label="Time limit per solve"
          value={props.settings.solveTimeLimit}
          options={SOLVE_TIME_LIMITS.map((l) => ({ value: l, label: timeLimitLabel(l) }))}
          onChange={(solveTimeLimit) => props.onChange({ solveTimeLimit })}
        />
        <MaxPlayersInput value={props.settings.maxPlayers} onCommit={(maxPlayers) => props.onChange({ maxPlayers })} />
      </div>
    </details>
  );
}

/**
 * The host's settings in the lobby: event, format, time limit, max players.
 * Best of was chosen when the room was created and stays as it is.
 */
export function LobbySettings({ settings, onChange }: { settings: RoomSettings; onChange: (changes: Partial<RoomSettings>) => void }) {
  return (
    <div className="settings-form">
      <EventSelect value={settings.cubeEvent} onChange={(cubeEvent) => onChange({ cubeEvent })} />
      <FormatField value={settings.format} onChange={(format) => onChange({ format })} />
      <p className="small">
        <span className="field-label">Best of</span>
        <br />
        {WIN_CONDITION_LABELS[settings.winCondition]}
        <span className="muted"> · set when the room was created</span>
      </p>
      <MoreOptions settings={settings} onChange={onChange} />
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
