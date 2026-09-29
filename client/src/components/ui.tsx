// Small building blocks used across the screens.

import { useId, useState } from "react";
import type { CubeEventId } from "@cube-racing/shared";
import { serverNow } from "../clock";

/** A WCA event icon from @cubing/icons (decorative: always shown next to a text label). */
export function EventIcon({ id }: { id: CubeEventId }) {
  return <span className={`cubing-icon event-${id}`} aria-hidden />;
}

interface SegmentedProps<T extends string | number> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

/** A row of mutually exclusive options (radio group). */
export function Segmented<T extends string | number>({ label, value, options, onChange }: SegmentedProps<T>) {
  const id = useId();
  return (
    <div className="field">
      <span className="field-label" id={id}>
        {label}
      </span>
      <div className="segmented" role="radiogroup" aria-labelledby={id}>
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * A thin bar that empties until `endsAt` (a SERVER timestamp). The movement is
 * a CSS animation, so the page doesn't re-render while it runs.
 */
export function ProgressBar({ endsAt, totalMs, label }: { endsAt: number; totalMs?: number; label: string }) {
  const [start] = useState(() => {
    const left = Math.max(0, endsAt - serverNow());
    const total = totalMs ?? Math.max(left, 1);
    return { left, from: Math.min(1, left / total) };
  });

  return (
    <div className="progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100}>
      <div
        key={endsAt}
        className="progress-fill"
        style={{ animationDuration: `${start.left}ms`, ["--from" as string]: start.from }}
      />
    </div>
  );
}
