import { Fragment, memo, useEffect, useRef, useState, type ReactNode } from "react";
import { getCubeEvent, type CubeEventId, type Scramble } from "@cube-racing/shared";
import type { PreviewPref } from "../prefs";
import type { FlowView } from "../smart/flow";
import { useSmartGuide } from "../timer/useSmartSolve";

/**
 * What the smart cube guide shows on the scramble: `done` moves are green (a
 * double move done halfway is light green), and `fix` (the moves that undo a
 * wrong turn) is shown in red where the next move would be.
 */
interface GuideMarks {
  done: number;
  half: boolean;
  fix: string[];
}

function guideMarks(view: FlowView, total: number): GuideMarks | null {
  const guide = view.guide;
  if (view.phase !== "scrambling" || guide.kind === "scrambled") return { done: total, half: false, fix: [] };
  if (guide.kind === "on-track") return { done: guide.done, half: guide.half, fix: [] };
  if (guide.kind === "off-track") return { done: guide.done, half: guide.half, fix: guide.fix };
  return null; // solve first / lost: nothing to mark
}

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

/** The number of moves in a scramble (Square-1's "/" slices count too; line breaks don't). */
function moveCount(text: string): number {
  return text.split("\n").reduce((total, line) => total + movesOf(line).length, 0);
}

/**
 * One line of moves. `first` is the index of its first move in the whole
 * scramble; moves before `tracked` are checked off, the one after is next.
 */
function Moves({ line, first, tracked, guide }: { line: string; first: number; tracked: number; guide: GuideMarks | null }) {
  return (
    <>
      {movesOf(line).map((move, i) => {
        const index = first + i;
        let state = index < tracked ? "done" : index === tracked && tracked > 0 ? "next" : "";
        if (guide) state = index < guide.done ? "good" : index === guide.done && guide.half ? "half" : index === guide.done ? "next" : "";
        const fixHere = guide && guide.fix.length > 0 && index === guide.done;
        return (
          <Fragment key={i}>
            {i > 0 && " "}
            {fixHere && (
              <>
                <span className="fix-moves" aria-label={`Wrong move. Undo with ${guide.fix.join(" ")}`}>
                  {guide.fix.join(" ")}
                </span>{" "}
              </>
            )}
            <span className={`move ${state}`} data-i={index}>
              {move}
            </span>
          </Fragment>
        );
      })}
    </>
  );
}

/**
 * The scramble text. Lines only break between moves; megaminx keeps its 7 lines.
 * Tap a move to tick off everything up to it (to keep your place while you
 * scramble); tap the last ticked move to untick it.
 */
export function ScrambleText({
  scramble,
  tracked = 0,
  onTrack,
  guide = null,
}: {
  scramble: Scramble;
  tracked?: number;
  onTrack?: (count: number) => void;
  /** A smart cube is following the scramble: it marks the moves instead of taps. */
  guide?: GuideMarks | null;
}) {
  const size = sizeClass(scramble.text, scramble.cubeEvent);
  const lines = scramble.text.split("\n");
  let first = 0;
  return (
    <p
      className={`scramble-text mono ${size} ${onTrack ? "trackable" : ""}`}
      aria-label={`Scramble: ${scramble.text}`}
      onClick={(event) => {
        const index = (event.target as HTMLElement).closest<HTMLElement>("[data-i]")?.dataset.i;
        if (index === undefined || !onTrack) return;
        const count = Number(index) + 1;
        onTrack(count === tracked ? count - 1 : count);
      }}
    >
      {size === "megaminx"
        ? lines.map((line, i) => {
            const start = first;
            first += movesOf(line).length;
            return (
              <span className="line" key={i}>
                <Moves line={line} first={start} tracked={tracked} guide={guide} />
              </span>
            );
          })
        : <Moves line={scramble.text} first={0} tracked={tracked} guide={guide} />}
    </p>
  );
}

/**
 * The scramble card: a small header (move count, your place, and `round`, e.g.
 * the set / solve pips), the scramble text, and the preview next to it (or
 * under it for long scrambles).
 */
export const ScrambleBlock = memo(function ScrambleBlock(props: {
  scramble: Scramble;
  preview: PreviewPref;
  onTogglePreview: () => void;
  round?: ReactNode;
}) {
  // Long scrambles (5x5 and up, megaminx) need the full width on phones: their
  // preview goes underneath unless there is room beside (see .stacked in the CSS).
  const size = sizeClass(props.scramble.text, props.scramble.cubeEvent);
  const stacked = size === "megaminx" || size === "size-3" || size === "size-4";
  const showPreview = props.preview !== "off";
  const layout = !showPreview ? "no-preview" : stacked ? "stacked" : "";

  // Ticked-off moves belong to one scramble: a new one starts at 0.
  const [track, setTrack] = useState({ text: props.scramble.text, count: 0 });
  const tracked = track.text === props.scramble.text ? track.count : 0;
  const total = moveCount(props.scramble.text);
  const smart = useSmartGuide(props.scramble.text);
  const guide = smart && guideMarks(smart, total);

  return (
    <div className="scramble-wrap">
      <div className="scramble-head">
        <span className="scramble-label">Scramble</span>
        <span className="scramble-count mono" aria-live="polite">
          {guide ? `${Math.min(guide.done, total)}/${total}` : tracked > 0 ? `${tracked}/${total}` : `${total} moves`}
        </span>
        {smart ? (
          <GuideStatus view={smart} />
        ) : tracked > 0 ? (
          <button type="button" className="mini-button" onClick={() => setTrack({ text: props.scramble.text, count: 0 })} data-dense>
            Reset
          </button>
        ) : (
          <span className="scramble-tip">Tap a move to keep your place</span>
        )}
        <span className="grow" />
        {props.round}
      </div>
      <div className={`scramble-block ${layout}`}>
        <ScrambleText
          scramble={props.scramble}
          tracked={tracked}
          onTrack={smart ? undefined : (count) => setTrack({ text: props.scramble.text, count })}
          guide={guide}
        />
        {showPreview && (
          <div className="preview-slot">
            <ScramblePreview scramble={props.scramble} mode={props.preview as "2d" | "3d"} onToggle={props.onTogglePreview} />
          </div>
        )}
      </div>
    </div>
  );
});

/** The guide's state in one short line, in the scramble header. */
function GuideStatus({ view }: { view: FlowView }) {
  const guide = view.guide;
  if (view.phase !== "scrambling" || guide.kind === "scrambled") return <span className="guide-status good">Scrambled ✓</span>;
  if (guide.kind === "off-track") return <span className="guide-status bad">Wrong move: do {guide.fix.join(" ")}</span>;
  if (guide.kind === "solve-first") return <span className="guide-status warn">Solve your cube first</span>;
  if (guide.kind === "lost") return <span className="guide-status bad">Lost track: solve your cube</span>;
  return <span className="guide-status">Follow it on your cube</span>;
}

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

/**
 * Another player's smart cube, live: the scramble, then their moves as they
 * arrive (each new move is animated). A new scramble starts a new cube.
 */
export function LiveCube({ scramble, moves }: { scramble: Scramble; moves: string[] }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<{ experimentalAddMove: (move: string) => void; alg: unknown } | null>(null);
  const shown = useRef(0);
  const latestMoves = useRef(moves);
  latestMoves.current = moves;

  useEffect(() => {
    let cancelled = false;
    let player: HTMLElement | null = null;
    shown.current = 0;
    import("cubing/twisty")
      .then(({ TwistyPlayer }) => {
        if (cancelled || !boxRef.current) return;
        const twisty = new TwistyPlayer({
          puzzle: "3x3x3",
          experimentalSetupAlg: scramble.text,
          background: "none",
          controlPanel: "none",
          hintFacelets: "none",
          viewerLink: "none",
          experimentalDragInput: "none",
        });
        player = twisty;
        playerRef.current = twisty;
        boxRef.current.append(twisty);
        // Moves that arrived while cubing.js was loading.
        for (const move of latestMoves.current) twisty.experimentalAddMove(move);
        shown.current = latestMoves.current.length;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      playerRef.current = null;
      player?.remove();
    };
  }, [scramble.text]);

  // Add only the moves the cube hasn't shown yet.
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    for (const move of moves.slice(shown.current)) player.experimentalAddMove(move);
    shown.current = moves.length;
  }, [moves]);

  return <div className="live-cube" ref={boxRef} aria-label={`Live cube: ${moves.length} moves so far`} />;
}
