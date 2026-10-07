// Small building blocks used across the screens: icons, the sticker-coloured
// avatars, the logo, the 3D cube on the home page, segmented controls and the
// countdown bar.

import { useId, useState, type ReactNode } from "react";
import { getCubeEvent, type CubeEventId, type RoomSettings } from "@cube-racing/shared";
import { serverNow } from "../clock";
import { EVENT_SHORT } from "../labels";
import { setPref, usePrefs, type ThemePref } from "../prefs";
import { SITE } from "../site";

/** A WCA event icon from @cubing/icons (decorative: always shown next to a text label). */
export function EventIcon({ id }: { id: CubeEventId }) {
  return <span className={`cubing-icon event-${id}`} aria-hidden />;
}

/** The room's event icon; a mixed room (everyone picks their own) gets a plain cube. */
export function RoomEventIcon({ settings }: { settings: Pick<RoomSettings, "cubeEvent" | "mixedEvents"> }) {
  return settings.mixedEvents ? <Icon name="cube" size={20} className="mixed-icon" /> : <EventIcon id={settings.cubeEvent} />;
}

/** A player's event in a mixed race: its icon and short name ("Pyra"). */
export function EventTag({ id }: { id: CubeEventId }) {
  return (
    <span className="tag event-tag" title={getCubeEvent(id).name}>
      <EventIcon id={id} />
      {EVENT_SHORT[id]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Icons: 24 × 24 line icons, drawn with currentColor.

const ICONS = {
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />,
  calendar: (
    <>
      <rect x="3" y="4.5" width="18" height="17" rx="3" />
      <path d="M8 2.5v4M16 2.5v4M3 10h18" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  chevronUp: <path d="m6 15 6-6 6 6" />,
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2.5" />
      <path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5" />
    </>
  ),
  cube: (
    <>
      <path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7z" />
      <path d="M3.5 7 12 11.5 20.5 7M12 11.5v10" />
    </>
  ),
  crown: (
    <>
      <path d="m3 7 4.5 4L12 4l4.5 7L21 7l-2 11H5L3 7z" />
      <path d="M5 21h14" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  flag: (
    <>
      <path d="M5 21V4" />
      <path d="M5 4h13l-2.5 4.5L18 13H5" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M2.5 12h19M12 2.5c2.6 2.6 4 6 4 9.5s-1.4 6.9-4 9.5c-2.6-2.6-4-6-4-9.5s1.4-6.9 4-9.5z" />
    </>
  ),
  keyboard: (
    <>
      <rect x="2" y="6" width="20" height="12" rx="2.5" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7.5 14h9" />
    </>
  ),
  link: (
    <>
      <path d="M10 13.5a4.5 4.5 0 0 0 6.4.4l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2" />
      <path d="M14 10.5a4.5 4.5 0 0 0-6.4-.4l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="11" width="16" height="10" rx="2.5" />
      <path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5.5A2.5 2.5 0 0 1 3 18.5v-13A2.5 2.5 0 0 1 5.5 3H9" />
      <path d="m16 17 5-5-5-5M21 12H9" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  message: <path d="M20 15.5a2.5 2.5 0 0 1-2.5 2.5H8l-5 4V5.5A2.5 2.5 0 0 1 5.5 3h12A2.5 2.5 0 0 1 20 5.5z" />,
  monitor: (
    <>
      <rect x="2.5" y="3.5" width="19" height="13" rx="2.5" />
      <path d="M8 21h8M12 16.5V21" />
    </>
  ),
  moon: <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  rotate: (
    <>
      <path d="M3 12a9 9 0 0 1 15.4-6.4L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.4 6.4L3 16" />
      <path d="M3 21v-5h5" />
    </>
  ),
  send: (
    <>
      <path d="M21.5 2.5 14.5 21l-3.5-8-8-3.5z" />
      <path d="M21.5 2.5 11 13" />
    </>
  ),
  share: (
    <>
      <path d="M4 13v6.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V13" />
      <path d="M16 7l-4-4-4 4M12 3v12" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
      <circle cx="15" cy="6" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2.5M12 19.5V22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2 12h2.5M19.5 12H22M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
    </>
  ),
  timer: (
    <>
      <circle cx="12" cy="13.5" r="8" />
      <path d="M12 9.5v4l2.5 2.5M9.5 2.5h5" />
    </>
  ),
  trophy: (
    <>
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4z" />
      <path d="M7 6H4.5a2.5 2.5 0 0 0 2.5 4.5M17 6h2.5a2.5 2.5 0 0 1-2.5 4.5M12 14v3.5M8 21h8M9.5 17.5h5" />
    </>
  ),
  undo: (
    <>
      <path d="M4 9h11a5 5 0 0 1 0 10H8" />
      <path d="m8 5-4 4 4 4" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.2A6.5 6.5 0 0 1 21.5 20" />
    </>
  ),
  bluetooth: <path d="m7 7 10 10-5 5V2l5 5L7 17" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof ICONS;

/** A line icon. Decorative: always next to a text label (or inside a labelled button). */
export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={`icon ${className ?? ""}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {ICONS[name]}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Player colours: every player gets one of the six cube faces, from their id,
// so they keep the same colour in the standings, the chat and the finish line.

export const STICKER_COUNT = 6;

/** 0..5: white, yellow, red, orange, blue, green (see --sticker-N in the CSS). */
export function playerColor(id: string | null | undefined): number {
  if (!id) return 4;
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(hash) % STICKER_COUNT;
}

/** The first letter of a nickname ("Temuulen" -> "T"), emoji-safe. */
export function initialOf(name: string | null | undefined): string {
  const first = Array.from((name ?? "").trim())[0];
  return first ? first.toUpperCase() : "?";
}

/** A round sticker with the player's initial. Decorative: the name is always shown next to it. */
export function Avatar(props: { id: string | null | undefined; name: string | null | undefined; size?: "xs" | "sm" | "md" | "lg" | "xl" }) {
  return (
    <span className={`avatar avatar-${props.size ?? "sm"}`} data-c={playerColor(props.id)} aria-hidden>
      {initialOf(props.name)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// The logo: a 3x3 face, mid-solve.

const LOGO_FACE = [4, 4, 3, 4, 4, 4, 5, 4, 1];

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 30 30" aria-hidden focusable="false">
      <rect width="30" height="30" rx="7" className="logo-bg" />
      {LOGO_FACE.map((c, i) => (
        <rect key={i} x={3 + (i % 3) * 8.2} y={3 + Math.floor(i / 3) * 8.2} width="7.4" height="7.4" rx="1.8" className={`logo-s s-${c}`} />
      ))}
    </svg>
  );
}

/** "Cubist" with the logo. */
export function Brand({ onClick }: { onClick?: () => void }) {
  const content = (
    <>
      <LogoMark />
      <span className="brand-name">{SITE.name}</span>
    </>
  );
  return onClick ? (
    <a
      className="brand"
      href="/"
      onClick={(event) => {
        event.preventDefault();
        onClick();
      }}
    >
      {content}
    </a>
  ) : (
    <span className="brand">{content}</span>
  );
}

// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------

const THEME_ORDER: ThemePref[] = ["dark", "light", "system"];
const THEME_ICON: Record<ThemePref, IconName> = { system: "monitor", light: "sun", dark: "moon" };

/** Cycles dark / light / system. */
export function ThemeButton() {
  const { theme } = usePrefs();
  const next = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length];
  return (
    <button
      type="button"
      className="icon-button"
      onClick={() => setPref("theme", next)}
      aria-label={`Theme: ${theme}. Switch to ${next}`}
      title={`Theme: ${theme}`}
    >
      <Icon name={THEME_ICON[theme]} />
    </button>
  );
}
