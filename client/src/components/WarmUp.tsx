import { useEffect, useRef, useState } from "react";
import { ClientEvents, type CubeEventId, type Scramble } from "@cube-racing/shared";
import { EVENT_SHORT } from "../labels";
import { request, useIsConnected } from "../socket";
import { ScrambleBlock } from "./Scramble";
import { EventIcon } from "./ui";

const EVENTS: CubeEventId[] = ["333", "222", "444", "555", "pyram", "skewb", "minx", "sq1", "clock"];

/**
 * A random scramble to warm up with. The server makes it with cubing.js, like
 * every scramble in the app. It only changes when you ask for a new one.
 */
export function WarmUp({ initial }: { initial?: Scramble }) {
  const [cubeEvent, setCubeEvent] = useState<CubeEventId>(initial?.cubeEvent ?? "333");
  const [scramble, setScramble] = useState<Scramble | null>(initial ?? null);
  const [failed, setFailed] = useState(false);
  const [preview, setPreview] = useState<"2d" | "3d">("2d");
  const latest = useRef(0);
  const connected = useIsConnected();

  async function generate(id: CubeEventId): Promise<void> {
    const attempt = ++latest.current;
    setCubeEvent(id);
    setFailed(false);
    const response = await request(ClientEvents.WARMUP_SCRAMBLE, { cubeEvent: id });
    if (attempt !== latest.current) return; // a newer request is on its way
    if (response.ok) setScramble(response.scramble);
    else setFailed(true);
  }

  // The first scramble, as soon as the connection to the server is up.
  const hasScramble = scramble !== null;
  useEffect(() => {
    if (!hasScramble && connected) void generate(cubeEvent);
  }, [connected, hasScramble]);

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
          <p className="muted small">
            {failed ? "Couldn't make a scramble. Try again." : connected ? "Making a scramble…" : "Connecting…"}
          </p>
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
