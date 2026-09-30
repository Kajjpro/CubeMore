import { useEffect, useId, useState } from "react";
import {
  CUBE_EVENTS,
  MAX_PLAYERS_LIMIT,
  MIN_PLAYERS_LIMIT,
  PIN_LENGTH,
  ROOM_FORMATS,
  ROOM_NAME_MAX_LENGTH,
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
      label="Best of (fixed once the first race starts)"
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
        <CommitInput
          label="Max players"
          className="max-players"
          type="number"
          value={String(props.settings.maxPlayers)}
          min={MIN_PLAYERS_LIMIT}
          max={MAX_PLAYERS_LIMIT}
          onCommit={(value) => {
            const maxPlayers = Number(value);
            if (Number.isInteger(maxPlayers)) props.onChange({ maxPlayers });
            else return false;
          }}
        />
      </div>
    </details>
  );
}

/** A random 4-digit PIN (the host can change it). */
export function randomPin(): string {
  return String(crypto.getRandomValues(new Uint32Array(1))[0] % 10 ** PIN_LENGTH).padStart(PIN_LENGTH, "0");
}

/**
 * The host's settings in the lobby: name, public/private (with the PIN), event,
 * format, Best of (until the first race starts), time limit and max players.
 * Every change is sent right away; text fields when you leave them or press Enter.
 */
export function LobbySettings(props: {
  settings: RoomSettings;
  pin: string | null;
  bestOfLocked: boolean;
  onChange: (changes: Partial<RoomSettings>, pin?: string) => void;
}) {
  const { settings, onChange } = props;
  const isPrivate = settings.visibility === "private";
  return (
    <div className="settings-form">
      <CommitInput
        label="Room name"
        value={settings.name}
        maxLength={ROOM_NAME_MAX_LENGTH}
        onCommit={(name) => onChange({ name })}
      />

      <Segmented
        label="Who can join"
        value={settings.visibility}
        options={[
          { value: "public", label: "Everyone" },
          { value: "private", label: "With PIN" },
        ]}
        onChange={(visibility) => onChange({ visibility }, visibility === "private" ? (props.pin ?? randomPin()) : undefined)}
      />
      {isPrivate && props.pin && (
        <CommitInput
          label="PIN"
          className="pin-field"
          inputClassName="pin-input"
          value={props.pin}
          inputMode="numeric"
          maxLength={PIN_LENGTH}
          clean={(text) => text.replace(/\D/g, "")}
          onCommit={(pin) => (pin.length === PIN_LENGTH ? onChange({}, pin) : false)}
        />
      )}
      <p className="tiny muted">
        {isPrivate
          ? "Listed on the home page, but joining needs the PIN. The invite link includes it."
          : "Listed on the home page; anyone can join."}
      </p>

      <EventSelect value={settings.cubeEvent} onChange={(cubeEvent) => onChange({ cubeEvent })} />
      <FormatField value={settings.format} onChange={(format) => onChange({ format })} />
      <Segmented
        label="Scoring"
        value={settings.scoring}
        options={[
          { value: "fastest", label: "Fastest wins" },
          { value: "handicap", label: "Handicap" },
        ]}
        onChange={(scoring) => onChange({ scoring })}
      />
      <p className="tiny muted">
        {settings.scoring === "handicap"
          ? "Everyone races their own pace (their average from earlier sets). Set 1 sets the pace; after that, whoever beats their pace by the most wins. Fair for mixed levels."
          : "The best average wins each set, like a WCA round."}
      </p>
      {props.bestOfLocked ? (
        <p className="small">
          <span className="field-label">Best of</span>
          <br />
          {WIN_CONDITION_LABELS[settings.winCondition]}
          <span className="muted"> · fixed after the first race</span>
        </p>
      ) : (
        <BestOfField value={settings.winCondition} onChange={(winCondition) => onChange({ winCondition })} />
      )}
      <MoreOptions settings={settings} onChange={onChange} />
    </div>
  );
}

/**
 * A text box that sends its value only when you leave it or press Enter, so
 * typing "30" doesn't send "3" first. onCommit can return false to refuse the
 * value (the box then goes back to the current one).
 */
function CommitInput(props: {
  label: string;
  value: string;
  onCommit: (value: string) => boolean | void;
  className?: string;
  inputClassName?: string;
  type?: "text" | "number";
  inputMode?: "numeric" | "text";
  min?: number;
  max?: number;
  maxLength?: number;
  clean?: (text: string) => string;
}) {
  const [draft, setDraft] = useState(props.value);
  useEffect(() => setDraft(props.value), [props.value]);

  function commit(): void {
    if (draft === props.value) return;
    if (props.onCommit(draft) === false) setDraft(props.value);
  }

  return (
    <label className={`field ${props.className ?? ""}`}>
      <span className="field-label">{props.label}</span>
      <input
        className={props.inputClassName}
        type={props.type ?? "text"}
        inputMode={props.inputMode ?? (props.type === "number" ? "numeric" : undefined)}
        min={props.min}
        max={props.max}
        maxLength={props.maxLength}
        value={draft}
        autoComplete="off"
        onChange={(e) => setDraft(props.clean ? props.clean(e.target.value) : e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
    </label>
  );
}
