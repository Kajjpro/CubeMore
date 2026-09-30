// Reactions: 🔥 👏 😮 😂 on another player's time. They travel as chat lines
// ("Anu 🔥 Nomin's 9.12"), and for a moment the emoji also floats up from the
// player's row in the standings and on the finish line.

import { useEffect, useState } from "react";
import { REACTIONS, type ChatMessage } from "@cube-racing/shared";
import { serverNow } from "../clock";

export type Reaction = (typeof REACTIONS)[number];

/** Emoji floating on each player's row right now, by public id. */
export type ReactionPops = Record<string, { id: string; emoji: string }[]>;

/** How long an emoji floats. */
const POP_MS = 1600;

/** The emoji at the start of a reaction line. */
function emojiOf(message: ChatMessage): string {
  return REACTIONS.find((emoji) => message.text.startsWith(emoji)) ?? REACTIONS[0];
}

/** The reactions from the last moment, grouped by the player they were for. */
export function useReactionPops(chat: ChatMessage[]): ReactionPops {
  const [, setTick] = useState(0);
  const now = serverNow();
  const fresh = chat.filter((m) => m.kind === "reaction" && m.targetId && now - m.at < POP_MS);

  // Re-render once the newest one has floated away, so it disappears.
  const newest = fresh.at(-1);
  useEffect(() => {
    if (!newest) return;
    const timeout = setTimeout(() => setTick((t) => t + 1), Math.max(0, newest.at + POP_MS - serverNow()) + 50);
    return () => clearTimeout(timeout);
  }, [newest]);

  const pops: ReactionPops = {};
  for (const m of fresh) (pops[m.targetId!] ??= []).push({ id: m.id, emoji: emojiOf(m) });
  return pops;
}

/** The floating emoji for one row (empty most of the time). */
export function Pops({ pops }: { pops?: { id: string; emoji: string }[] }) {
  if (!pops?.length) return null;
  return (
    <span className="reaction-pops" aria-hidden>
      {pops.map((p, i) => (
        <span key={p.id} className="pop" style={{ left: `${i * 10}px` }}>
          {p.emoji}
        </span>
      ))}
    </span>
  );
}

/** A row of the four reactions. */
export function ReactionTray({ label, onReact }: { label: string; onReact: (emoji: Reaction) => void }) {
  return (
    <div className="reaction-tray" role="group" aria-label={label}>
      <span className="tiny muted">{label}</span>
      {REACTIONS.map((emoji) => (
        <button key={emoji} type="button" onClick={() => onReact(emoji)} aria-label={`${label}: ${emoji}`}>
          {emoji}
        </button>
      ))}
    </div>
  );
}
