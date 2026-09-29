import { Fragment, memo, useEffect, useRef, useState } from "react";
import { getCubeEvent, type CubeEventId, type Scramble } from "@cube-racing/shared";
import type { PreviewPref } from "../prefs";

/** Splits a scramble into moves. Square-1 moves like "(0, 5)" stay in one piece. */
function movesOf(line: string): string[] {
  return line.match(/\([^)]*\)|\S+/g) ?? [];
}

/** Longer scrambles (4x4 and up) get a smaller font, so the whole scramble fits without scrolling. */
function sizeClass(text: string, cubeEvent: CubeEventId): string {
  if (cubeEvent === "minx") return "megaminx";
  const length = text.length;
  if (length <= 80) return "size-1";
  if (length <= 170) return "size-2";
  if (length <= 260) return "size-3";
  return "size-4";
}

function Moves({ line }: { line: string }) {
  return (
    <>
      {movesOf(line).map((move, i) => (
        <Fragment key={i}>
          {i > 0 && " "}
          <span className="move">{move}</span>
        </Fragment>
      ))}
    </>
  );
}

/** The scramble text. Lines only break between moves; megaminx keeps its 7 lines. */
export function ScrambleText({ scramble }: { scramble: Scramble }) {
  const size = sizeClass(scramble.text, scramble.cubeEvent);
  return (
    <p className={`scramble-text mono ${size}`} aria-label={`Scramble: ${scramble.text}`}>
      {size === "megaminx"
        ? scramble.text.split("\n").map((line, i) => (
            <span className="line" key={i}>
              <Moves line={line} />
            </span>
          ))
        : <Moves line={scramble.text} />}
    </p>
  );
}

/** Scramble text + the small preview next to it (or under it for megaminx). */
export const ScrambleBlock = memo(function ScrambleBlock(props: {
  scramble: Scramble;
  preview: PreviewPref;
  onTogglePreview: () => void;
}) {
  // Long scrambles (5x5 and up, megaminx) need the full width on phones: their
  // preview goes underneath unless there is room beside (see .stacked in the CSS).
  const size = sizeClass(props.scramble.text, props.scramble.cubeEvent);
  const stacked = size === "megaminx" || size === "size-3" || size === "size-4";
  const showPreview = props.preview !== "off";
  const layout = !showPreview ? "no-preview" : stacked ? "stacked" : "";
  return (
    <div className="scramble-wrap">
      <div className={`scramble-block ${layout}`}>
        <ScrambleText scramble={props.scramble} />
        {showPreview && (
          <div className="preview-slot">
            <ScramblePreview scramble={props.scramble} mode={props.preview as "2d" | "3d"} onToggle={props.onTogglePreview} />
          </div>
        )}
      </div>
    </div>
  );
});

/**
 * Downloads the drawing code and the puzzle's data ahead of time (called in the
 * lobby), so the preview appears right away when the match starts.
 */
export function preloadScramblePreview(cubeEvent: CubeEventId): void {
  import("cubing/twisty").catch(() => {});
  import("cubing/puzzles")
    .then(({ puzzles }) => puzzles[getCubeEvent(cubeEvent).puzzle].svg())
    .catch(() => {});
}

/**
 * The scrambled puzzle, drawn by cubing.js: a 2D net by default, tap for 3D.
 * cubing.js is big, so it's only downloaded when first needed.
 */
export function ScramblePreview(props: { scramble: Scramble; mode: "2d" | "3d"; onToggle: () => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let player: HTMLElement | null = null;
    import("cubing/twisty")
      .then(({ TwistyPlayer }) => {
        if (cancelled || !boxRef.current) return;
        player = new TwistyPlayer({
          puzzle: getCubeEvent(props.scramble.cubeEvent).puzzle,
          experimentalSetupAlg: props.scramble.text,
          visualization: props.mode === "3d" ? "3D" : "2D",
          background: "none",
          controlPanel: "none",
          hintFacelets: "none",
          viewerLink: "none",
          experimentalDragInput: "none",
        });
        boxRef.current.append(player);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      player?.remove();
    };
  }, [props.scramble.cubeEvent, props.scramble.text, props.mode]);

  return (
    <button
      type="button"
      className="preview"
      onClick={props.onToggle}
      aria-label={`Scramble preview (${props.mode === "3d" ? "3D" : "2D"}). Tap to switch to ${props.mode === "3d" ? "2D" : "3D"}.`}
    >
      <div ref={boxRef} style={{ width: "100%", height: "100%", pointerEvents: "none" }}>
        {failed && <span className="tiny muted">No preview</span>}
      </div>
    </button>
  );
}
