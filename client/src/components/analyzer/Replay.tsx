/*
 * WATCHING A SOLVE AGAIN on a 3D cube (cubing.js), at its real speed: every
 * move happens when it happened, pauses included. A timeline under the cube
 * shows the stages; tap one to jump to its start.
 *
 * MovesDemo plays a few suggested moves (a shorter cross, a pair, an
 * algorithm) from a point of the solve, at an even pace.
 */

import { useEffect, useRef, useState } from "react";
import type { TwistyPlayer } from "cubing/twisty";
import type { SolveAnalysis, StageId } from "@cube-racing/shared/analysis";
import { STAGE_SHORT, seconds } from "../../analyzer/labels";

/** How long one move's animation takes (shorter when the next move comes sooner). */
const MOVE_MS = 140;
const SPEEDS = [0.5, 1, 2] as const;

interface Props {
  scramble: string;
  moves: string[];
  times: number[];
  analysis: SolveAnalysis;
  /** A stage to jump to (changes when the report asks). */
  seek: { stage: StageId; at: number } | null;
}

type TimelineLeaf = { animLeaf: unknown; start: number; end: number };

/** Moves the player to a moment of the solve (ms). cubing.js brands its millisecond type. */
function setTime(player: TwistyPlayer, ms: number): void {
  player.timestamp = ms as never;
}

/** The moves as they happened, with pauses filling the gaps (the player needs something at every moment). */
async function timeline(moves: string[], times: number[]): Promise<TimelineLeaf[]> {
  const { Move, Pause } = await import("cubing/alg");
  const leaves: TimelineLeaf[] = [];
  let cursor = 0;
  moves.forEach((move, i) => {
    const start = Math.max(times[i], cursor);
    const nextAt = i + 1 < times.length ? times[i + 1] : start + MOVE_MS;
    const end = start + Math.max(30, Math.min(MOVE_MS, nextAt - start));
    if (start > cursor) leaves.push({ animLeaf: new Pause(), start: cursor, end: start });
    leaves.push({ animLeaf: Move.fromString(move), start, end });
    cursor = end;
  });
  return leaves;
}

export function SolveReplay({ scramble, moves, times, analysis, seek }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const playerRef = useRef<TwistyPlayer | null>(null);
  const [now, setNow] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [ready, setReady] = useState(false);
  const total = times[times.length - 1] ?? 0;

  useEffect(() => {
    let cancelled = false;
    let player: TwistyPlayer | null = null;
    const onTime = (info: { timestamp: number }) => setNow(info.timestamp);
    const onPlaying = (info: { playing: boolean }) => setPlaying(info.playing);
    void Promise.all([import("cubing/twisty"), timeline(moves, times)]).then(([{ TwistyPlayer }, leaves]) => {
      if (cancelled || !box.current) return;
      player = new TwistyPlayer({
        puzzle: "3x3x3",
        experimentalSetupAlg: scramble,
        alg: moves.join(" "),
        background: "none",
        controlPanel: "none",
        hintFacelets: "none",
        viewerLink: "none",
      });
      // Real timing: each move when it happened.
      (player.experimentalModel.animationTimelineLeavesRequest as { set(v: unknown): void }).set(leaves);
      player.experimentalModel.detailedTimelineInfo.addFreshListener(onTime);
      player.experimentalModel.playingInfo.addFreshListener(onPlaying);
      setTime(player, 0);
      box.current.append(player);
      playerRef.current = player;
      setReady(true);
    });
    return () => {
      cancelled = true;
      player?.experimentalModel.detailedTimelineInfo.removeFreshListener(onTime);
      player?.experimentalModel.playingInfo.removeFreshListener(onPlaying);
      player?.remove();
      playerRef.current = null;
      setReady(false);
    };
  }, [scramble, moves, times]);

  useEffect(() => {
    if (playerRef.current) playerRef.current.tempoScale = speed;
  }, [speed, ready]);

  // The report asked for a stage: jump to its start.
  useEffect(() => {
    const player = playerRef.current;
    if (!seek || !player) return;
    const stage = analysis.stages.find((s) => s.stage === seek.stage);
    if (!stage) return;
    player.pause();
    setTime(player, stage.startMs);
  }, [seek, ready, analysis]);

  const jump = (ms: number) => {
    const player = playerRef.current;
    if (!player) return;
    player.pause();
    setTime(player, Math.max(0, Math.min(total, ms)));
  };

  const toggle = () => {
    const player = playerRef.current;
    if (!player) return;
    if (!playing && now >= total) setTime(player, 0);
    player.togglePlay();
  };

  const current = analysis.stages.find((s) => now <= s.endMs) ?? analysis.stages[analysis.stages.length - 1];

  return (
    <div className="replay-panel">
      <div className="replay-stage-cube" ref={box} aria-label="The solve on a 3D cube" />
      <div className="replay-timeline" role="group" aria-label="Stages">
        {analysis.stages.map((s) => {
          const width = total > 0 ? ((s.endMs - s.startMs) / total) * 100 : 0;
          if (width <= 0) return null;
          return (
            <button
              key={s.stage}
              type="button"
              className="replay-segment"
              data-current={s.stage === current.stage}
              style={{ flexGrow: width }}
              onClick={() => jump(s.startMs)}
              aria-label={`Jump to ${STAGE_SHORT[s.stage]}`}
              title={`${STAGE_SHORT[s.stage]}: ${seconds(s.endMs - s.startMs)} s`}
              data-dense
            >
              {width >= 8 && <span>{STAGE_SHORT[s.stage]}</span>}
            </button>
          );
        })}
        <span className="replay-head" style={{ left: `${total > 0 ? (Math.min(now, total) / total) * 100 : 0}%` }} aria-hidden />
      </div>
      <div className="replay-controls">
        <button type="button" onClick={() => jump(0)} disabled={!ready} aria-label="Back to the start" data-dense>
          Start
        </button>
        <button type="button" className="replay-play" onClick={toggle} disabled={!ready}>
          {playing ? "Pause" : now >= total && total > 0 ? "Replay" : "Play"}
        </button>
        <span className="replay-clock mono" aria-live="off">
          {seconds(Math.min(now, total))} / {seconds(total)}
        </span>
        <span className="grow" />
        <div className="segmented replay-speed" role="radiogroup" aria-label="Speed">
          {SPEEDS.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={speed === s} onClick={() => setSpeed(s)} data-dense>
              {s}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Plays `alg` (any notation) from the state after `setup`, at an even pace. */
export function MovesDemo({ setup, alg }: { setup: string; alg: string }) {
  const box = useRef<HTMLDivElement>(null);
  const playerRef = useRef<TwistyPlayer | null>(null);
  useEffect(() => {
    let cancelled = false;
    let player: TwistyPlayer | null = null;
    void import("cubing/twisty").then(({ TwistyPlayer }) => {
      if (cancelled || !box.current) return;
      player = new TwistyPlayer({
        puzzle: "3x3x3",
        experimentalSetupAlg: setup,
        alg,
        background: "none",
        controlPanel: "none",
        hintFacelets: "none",
        viewerLink: "none",
        tempoScale: 1.5,
      });
      box.current.append(player);
      playerRef.current = player;
      player.play();
    });
    return () => {
      cancelled = true;
      player?.remove();
      playerRef.current = null;
    };
  }, [setup, alg]);

  const again = () => {
    const player = playerRef.current;
    if (!player) return;
    player.jumpToStart();
    player.play();
  };

  return (
    <div className="moves-demo-wrap">
      <div className="moves-demo" ref={box} />
      <div className="moves-demo-row">
        <span className="mono small alg">{alg}</span>
        <button type="button" onClick={again} data-dense>
          Play again
        </button>
      </div>
    </div>
  );
}
