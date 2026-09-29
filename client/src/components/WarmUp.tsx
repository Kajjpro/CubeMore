import { useEffect, useRef, useState } from "react";
import type { CubeEventId, Scramble } from "@cube-racing/shared";
import { EVENT_SHORT } from "../labels";
import { ScrambleBlock } from "./Scramble";
import { EventIcon } from "./ui";

const EVENTS: CubeEventId[] = ["333", "222", "444", "555", "pyram", "skewb", "minx", "sq1", "clock"];

/**
 * A random scramble to warm up with, made in the browser by cubing.js.
 * It only changes when you ask for a new one (nothing moves on its own).
 */
export function WarmUp({ initial }: { initial?: Scramble }) {
  const [cubeEvent, setCubeEvent] = useState<CubeEventId>(initial?.cubeEvent ?? "333");
  const [scramble, setScramble] = useState<Scramble | null>(initial ?? null);
  const [failed, setFailed] = useState(false);
  const [preview, setPreview] = useState<"2d" | "3d">("2d");
  const latest = useRef(0);

  async function generate(id: CubeEventId): Promise<void> {
    const request = ++latest.current;
    setCubeEvent(id);
    setFailed(false);
    try {
      const { randomScrambleForEvent } = await import("cubing/scramble");
      const alg = await randomScrambleForEvent(id);
      if (request === latest.current) setScramble({ cubeEvent: id, text: alg.toString() });
    } catch {
      if (request === latest.current) setFailed(true);
    }
  }

  useEffect(() => {
    // Only once, on the first render.
    if (!initial) void generate("333");
  }, []);

  const current = scramble?.cubeEvent === cubeEvent ? scramble : null;

  return (
    <section className="panel warmup" aria-labelledby="warmup-title">
      <div className="warmup-head">
        <h2 id="warmup-title">Warm-up scramble</h2>
        <div className="warmup-events" role="radiogroup" aria-label="Puzzle">
          {EVENTS.map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={id === cubeEvent}
              aria-label={EVENT_SHORT[id]}
              title={EVENT_SHORT[id]}
              onClick={() => id !== cubeEvent && void generate(id)}
            >
              <EventIcon id={id} />
            </button>
          ))}
        </div>
      </div>

      <div className="warmup-body">
        {current ? (
          <ScrambleBlock
            scramble={current}
            preview={preview}
            onTogglePreview={() => setPreview((mode) => (mode === "2d" ? "3d" : "2d"))}
          />
        ) : (
          <p className="muted small">{failed ? "Couldn't make a scramble. Try again." : "Making a scramble…"}</p>
        )}
      </div>

      <div className="row">
        <button type="button" onClick={() => void generate(cubeEvent)}>
          New scramble
        </button>
        <p className="tiny muted grow">Tap the picture for 3D.</p>
      </div>
    </section>
  );
}
