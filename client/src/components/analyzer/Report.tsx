/*
 * THE ANALYSIS OF A SOLVE, on screen:
 *   the time and level, a bar of the stages, the replay next to a table of the
 *   stages, then what to practice (each with the moves on a 3D cube), and the
 *   cases. An ao5 adds the average stages and the three things to work on.
 * Plain text, black and white, blue only for the selected stage (DESIGN.md).
 */

import { useState, type ReactNode } from "react";
import { formatTime } from "@cube-racing/shared";
import type { Advice, SessionSummary, SolveAnalysis, StageId } from "@cube-racing/shared/analysis";
import { STAGE_LABEL, STAGE_SHORT, colorName, levelOfId, pairLabel, seconds, typicalFor } from "../../analyzer/labels";
import { caseById } from "@cube-racing/shared/analysis/caseInfo";
import { Link } from "../Site";
import { MovesDemo, SolveReplay } from "./Replay";

interface SolveReportProps {
  scramble: string;
  moves: string[];
  times: number[];
  analysis: SolveAnalysis;
  /** e.g. "Solve 3 of 5", or the name of a top solver. */
  title?: string;
  /** Under the summary: kept or not, and why. */
  status?: ReactNode;
  /** The coach card (sessions that can have one). */
  coach?: ReactNode;
}

export function SolveReport({ scramble, moves, times, analysis, title, status, coach }: SolveReportProps) {
  const [seek, setSeek] = useState<{ stage: StageId; at: number } | null>(null);
  const select = (stage: StageId) => setSeek({ stage, at: Date.now() });
  const level = levelOfId(analysis.level);
  const target = levelOfId(analysis.target);

  return (
    <section className="analysis" aria-label="Analysis of the solve">
      <header className="analysis-head">
        {title && <p className="analysis-kicker">{title}</p>}
        <div className="analysis-summary">
          <span className="analysis-time mono">{formatTime(analysis.timeMs)}</span>
          <span className="analysis-facts">
            <span>{analysis.moves} moves</span>
            <span>{analysis.tps.toFixed(1)} turns per second</span>
            <span className="tag">{analysis.timeMs < level.underMs ? `${level.label} pace` : `Slower than ${level.label.toLowerCase()}`}</span>
          </span>
        </div>
        <p className="small muted">
          Compared with typical {target.phrase} solves{target.id === level.id ? "" : ", the next step up"}.
        </p>
        {status}
      </header>

      <StageBar analysis={analysis} />

      <div className="analysis-grid">
        <SolveReplay scramble={scramble} moves={moves} times={times} analysis={analysis} seek={seek} />
        <StageTable analysis={analysis} onSelect={select} />
      </div>

      <AdviceList analysis={analysis} scramble={scramble} moves={moves} />
      <CaseDetails analysis={analysis} />
      {coach}
    </section>
  );
}

/** One bar for the whole solve: each stage as wide as its time, the looking part hatched. */
export function StageBar({ analysis }: { analysis: SolveAnalysis }) {
  const total = analysis.timeMs || 1;
  return (
    <div className="stage-bar-wrap">
      <div className="stage-bar" role="list" aria-label="Time spent in each stage">
        {analysis.stages.map((s) => {
          const ms = s.endMs - s.startMs;
          if (ms <= 0) return null;
          const share = ms / total;
          return (
            <div
              key={s.stage}
              role="listitem"
              className="stage-bar-part"
              style={{ flexGrow: share }}
              aria-label={`${STAGE_LABEL[s.stage]}: ${seconds(ms)} seconds, ${seconds(s.recognitionMs)} of them looking`}
            >
              <span className="stage-bar-look" style={{ width: `${(s.recognitionMs / ms) * 100}%` }} />
              {share >= 0.07 && <span className="stage-bar-label">{STAGE_SHORT[s.stage]}</span>}
            </div>
          );
        })}
      </div>
      <p className="tiny muted stage-bar-key">
        <span className="stage-bar-key-look" aria-hidden /> Looking before the stage <span className="stage-bar-key-turn" aria-hidden /> Turning
      </p>
    </div>
  );
}

export function StageTable({ analysis, onSelect }: { analysis: SolveAnalysis; onSelect?: (stage: StageId) => void }) {
  const target = levelOfId(analysis.target);
  return (
    <div className="stage-table-wrap">
      <table className="stage-table">
        <thead>
          <tr>
            <th scope="col">Stage</th>
            <th scope="col" className="num">Time</th>
            <th scope="col" className="num">Looking</th>
            <th scope="col" className="num">Moves</th>
            <th scope="col" className="num col-tps">TPS</th>
            <th scope="col" className="num" title={`Typical for ${target.phrase}`}>
              Typical
            </th>
          </tr>
        </thead>
        <tbody>
          {analysis.stages.map((s) => {
            const ms = s.endMs - s.startMs;
            const typical = typicalFor(s.stage, analysis.target);
            const slow = ms > typical * 1.25;
            const label = s.stage.startsWith("pair") ? pairLabel(analysis, s.stage) : STAGE_LABEL[s.stage];
            const skipped = ms === 0;
            return (
              <tr key={s.stage} data-slow={slow}>
                <th scope="row">
                  <button type="button" className="stage-link" onClick={() => onSelect?.(s.stage)} data-dense>
                    {label}
                  </button>
                </th>
                <td className="num mono">{skipped ? "–" : seconds(ms)}</td>
                <td className="num mono">{skipped || s.stage === "cross" ? "–" : seconds(s.recognitionMs)}</td>
                <td className="num mono">{s.moves}</td>
                <td className="num mono col-tps">{s.tps ? s.tps.toFixed(1) : "–"}</td>
                <td className="num mono muted">{seconds(typical)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="tiny muted">
        Times in seconds. Looking is the pause before a stage's first move. Typical is for {target.phrase} solves (approximate).
      </p>
    </div>
  );
}

/** What to practice, the biggest saving first. */
export function AdviceList({ analysis, scramble, moves }: { analysis: SolveAnalysis; scramble: string; moves: string[] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (analysis.advice.length === 0) {
    return (
      <section className="advice" aria-labelledby="advice-title">
        <h2 id="advice-title">What to practice</h2>
        <p className="small muted">Nothing stands out in this solve. Keep going, and try an ao5 to see what repeats.</p>
      </section>
    );
  }
  return (
    <section className="advice" aria-labelledby="advice-title">
      <h2 id="advice-title">What to practice</h2>
      <ol className="advice-list">
        {analysis.advice.map((advice, i) => (
          <li key={i} className="advice-item">
            <div className="advice-top">
              <span className="advice-rank mono">{i + 1}</span>
              <h3>{advice.title}</h3>
              <span className="advice-saved mono">about {seconds(advice.savedMs, 1)} s</span>
            </div>
            <p className="small">{advice.detail}</p>
            {advice.show && (
              <>
                <button type="button" className="link-button" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
                  {open === i ? "Hide" : "Show on the cube"}
                </button>
                {open === i && <MovesDemo setup={setupFor(scramble, moves, advice)} alg={advice.show.alg} />}
              </>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The scramble and the solve's moves up to where the suggestion starts. */
function setupFor(scramble: string, moves: string[], advice: Advice): string {
  const upTo = advice.show ? advice.show.afterMove + 1 : 0;
  return [scramble, ...moves.slice(0, upTo)].join(" ");
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The cross, the cases and their algorithms. */
export function CaseDetails({ analysis }: { analysis: SolveAnalysis }) {
  const { cross, oll, pll } = analysis;
  const best = Math.min(...Object.values(cross.byColor));
  return (
    <section className="case-details" aria-label="Cross and last layer">
      <div className="case-card">
        <h3>Cross</h3>
        <p className="small">
          {capitalize(colorName(cross.face))} cross, {analysis.stages[0].moves} moves. The shortest was {cross.optimalMoves}
          {cross.optimalMoves > 0 ? (
            <>
              : <span className="mono alg">{cross.optimal}</span> ({colorName(cross.face)} on the bottom, {colorName(cross.front)} in front).
            </>
          ) : (
            "."
          )}
        </p>
        {cross.xcross && <p className="small">You solved a pair together with the cross (an X-cross).</p>}
        {best < cross.optimalMoves && (
          <p className="tiny muted">
            Shortest on another color: {best} moves (
            {Object.entries(cross.byColor)
              .filter(([, n]) => n === best)
              .map(([f]) => colorName(f))
              .join(", ")}
            ).
          </p>
        )}
      </div>
      <LastLayerCard step="OLL" info={oll} />
      <LastLayerCard step="PLL" info={pll} />
    </section>
  );
}

function LastLayerCard({ step, info }: { step: "OLL" | "PLL"; info: SolveAnalysis["oll"] }) {
  const casePath = info.caseId ? caseById(info.caseId)?.path : undefined;
  return (
    <div className="case-card">
      <h3>{step}</h3>
      {info.skip ? (
        <p className="small">Skipped: it was already done.</p>
      ) : (
        <>
          <p className="small">
            {casePath ? <Link to={casePath}>{step === "OLL" ? `${info.caseId}, ${info.name}` : info.name}</Link> : step === "OLL" ? `${info.caseId}, ${info.name}` : info.name}
            {info.looks >= 2 ? `, done in ${info.looks} steps` : ""}.
          </p>
          <p className="small mono alg">{info.alg}</p>
        </>
      )}
    </div>
  );
}

/** An ao5: the times, the average stages, and the three things to work on. */
export function SessionReport({ summary, times, onOpen, selected }: { summary: SessionSummary; times: number[]; onOpen: (index: number) => void; selected: number | null }) {
  const target = levelOfId(summary.target);
  const best = Math.min(...times);
  const worst = Math.max(...times);
  return (
    <section className="analysis session-report" aria-label="Average of 5">
      <header className="analysis-head">
        <p className="analysis-kicker">Average of 5</p>
        <div className="analysis-summary">
          <span className="analysis-time mono">{formatTime(summary.averageMs)}</span>
          <span className="analysis-facts">
            <span>best {formatTime(summary.bestMs)}</span>
            <span>worst {formatTime(summary.worstMs)}</span>
            <span>spread {seconds(summary.spreadMs)} s</span>
          </span>
        </div>
      </header>

      <ol className="session-times" aria-label="The 5 solves">
        {times.map((t, i) => {
          const dropped = (t === best && times.indexOf(best) === i) || (t === worst && times.lastIndexOf(worst) === i);
          return (
            <li key={i}>
              <button type="button" className="session-time" aria-pressed={selected === i} onClick={() => onOpen(i)}>
                <span className="tiny muted">Solve {i + 1}</span>
                <span className="mono">{dropped ? `(${formatTime(t)})` : formatTime(t)}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="focus">
        <h2>What to work on</h2>
        {summary.focus.length === 0 ? (
          <p className="small muted">Nothing stands out across these solves.</p>
        ) : (
          <ol className="focus-list">
            {summary.focus.map((f) => (
              <li key={f.kind}>
                <span>{f.title}</span>
                <span className="tiny muted">
                  about {seconds(f.savedMs, 1)} s a solve, in {f.solves} of {summary.count} solves
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="stage-table-wrap">
        <table className="stage-table">
          <caption className="tiny muted">Average of each stage over the {summary.count} solves</caption>
          <thead>
            <tr>
              <th scope="col">Stage</th>
              <th scope="col" className="num">Time</th>
              <th scope="col" className="num">Looking</th>
              <th scope="col" className="num">Moves</th>
              <th scope="col" className="num">Typical</th>
            </tr>
          </thead>
          <tbody>
            {summary.stages.map((s) => {
              const typical = typicalFor(s.stage, summary.target);
              return (
                <tr key={s.stage} data-slow={s.ms > typical * 1.25}>
                  <th scope="row">{STAGE_LABEL[s.stage]}</th>
                  <td className="num mono">{seconds(s.ms)}</td>
                  <td className="num mono">{s.stage === "cross" ? "–" : seconds(s.recognitionMs)}</td>
                  <td className="num mono">{s.moves.toFixed(1)}</td>
                  <td className="num mono muted">{seconds(typical)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="tiny muted">Typical is for {target.phrase} solves (approximate).</p>
      </div>
    </section>
  );
}

/** The coach's written summary, or the button to ask for it. */
export function CoachCard(props: { text: string | null; available: boolean; canAsk: boolean; reason: string | null; busy: boolean; error: string | null; onAsk: () => void }) {
  if (!props.available) return null;
  return (
    <section className="panel coach-card" aria-labelledby="coach-title">
      <h2 id="coach-title">Coach summary</h2>
      {props.text ? (
        <div className="coach-text">
          {props.text.split("\n").filter(Boolean).map((line, i) =>
            line.startsWith("- ") ? (
              <p key={i} className="coach-point">
                {line.slice(2)}
              </p>
            ) : (
              <p key={i}>{line}</p>
            ),
          )}
          <p className="tiny muted">Written by an AI from the numbers above. The analysis itself is exact; the wording may not be.</p>
        </div>
      ) : (
        <>
          <p className="small muted">A few sentences on what matters most in {props.canAsk ? "these solves" : "a session"}, written by an AI from the analysis.</p>
          {props.error && <p className="error-text small">{props.error}</p>}
          {props.reason && <p className="tiny muted">{props.reason}</p>}
          <button type="button" onClick={props.onAsk} disabled={!props.canAsk || props.busy}>
            {props.busy ? "Writing…" : "Write a summary"}
          </button>
        </>
      )}
    </section>
  );
}
