/*
 * THE AI COACH: a short written summary of an analyzer session.
 *
 * Everything about the solves is worked out by the analyzer (shared/analysis):
 * stages, cases, shortest cross and pairs, algorithms. The AI only puts those
 * facts into a few plain sentences, and is told never to write an algorithm
 * that isn't in them. It's sent only these numbers: no name, no account, nothing
 * a player typed.
 *
 * Google Gemini (free tier) through its REST API. Without GEMINI_API_KEY there's
 * no coach and the analyzer's own suggestions are all players see.
 */

import { COLOR_NAMES, LEVELS, type SessionSummary, type SolveAnalysis } from "@cube-racing/shared/analysis";

export interface Coach {
  model: string;
  /** A summary of these solves (one, or an ao5). Throws when the AI can't answer. */
  summarize(solves: SolveAnalysis[], summary: SessionSummary | null): Promise<string>;
}

const INSTRUCTIONS = `You are a calm, precise speedcubing coach on CubeMore, a site for racing with smart cubes.
You get the exact analysis of a player's 3x3 smart cube solves (CFOP), already computed by software.
Write at most 110 words:
- first, one sentence on the overall picture (their time and where it goes),
- then exactly three lines that start with "- ", the three most useful things to practice, the one that saves the most time first, each one short sentence.
Rules: use only the numbers, cases and algorithms in the data, and never write an algorithm or move sequence that isn't in it. No emoji, no exclamation marks, no headings, no bold. Talk to the player as "you". Plain, friendly English.`;

const levelLabel = (id: string) => LEVELS.find((l) => l.id === id)?.label ?? id;
const s = (ms: number) => Math.round(ms / 100) / 10;

/** The facts for the AI, small and readable. */
export function coachFacts(solves: SolveAnalysis[], summary: SessionSummary | null): string {
  const lines: string[] = [];
  if (summary && solves.length > 1) {
    lines.push(`Session: ${summary.count} solves, average ${s(summary.averageMs)} s, best ${s(summary.bestMs)} s, worst ${s(summary.worstMs)} s, level ${levelLabel(summary.level)}, aiming for ${levelLabel(summary.target)}.`);
    lines.push(`Average per stage: ${summary.stages.map((st) => `${st.stage} ${s(st.ms)} s (${st.moves} moves, looking ${s(st.recognitionMs)} s)`).join("; ")}.`);
    lines.push(`Biggest losses over the session: ${summary.focus.map((f) => `${f.title} (about ${s(f.savedMs)} s per solve, in ${f.solves} solves)`).join("; ")}.`);
  }
  solves.forEach((a, i) => {
    lines.push(
      `Solve ${i + 1}: ${s(a.timeMs)} s, ${a.moves} moves, ${a.tps} TPS, cross on ${COLOR_NAMES[a.cross.face]} (${a.stages[0].moves} moves, shortest ${a.cross.optimalMoves}${a.cross.xcross ? ", X-cross" : ""}).`,
    );
    lines.push(`  Stages: ${a.stages.map((st) => `${st.stage} ${s(st.endMs - st.startMs)} s/${st.moves} moves`).join(", ")}.`);
    lines.push(`  OLL: ${a.oll.skip ? "skip" : `${a.oll.caseId} ${a.oll.name}, ${a.oll.looks} look(s), algorithm ${a.oll.alg}`}. PLL: ${a.pll.skip ? "skip" : `${a.pll.caseId} ${a.pll.name}, ${a.pll.looks} look(s), algorithm ${a.pll.alg}`}.`);
    for (const advice of a.advice.slice(0, 4)) lines.push(`  Suggestion (saves about ${s(advice.savedMs)} s): ${advice.title}. ${advice.detail}`);
  });
  return lines.join("\n");
}

/** Takes out emoji and markdown the instructions asked not to use, and keeps it short. */
export function cleanCoachText(text: string): string {
  return text
    .replace(/\p{Extended_Pictographic}|️/gu, "")
    .replace(/\*\*|__|#+ /g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 1200);
}

export function geminiCoach(apiKey: string, model: string, fetchImpl: typeof fetch = fetch): Coach {
  return {
    model,
    async summarize(solves, summary) {
      const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: INSTRUCTIONS }] },
          contents: [{ role: "user", parts: [{ text: coachFacts(solves, summary) }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 400 },
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`Gemini answered ${response.status}`);
      const data = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      const cleaned = cleanCoachText(text);
      if (!cleaned) throw new Error("Gemini sent an empty answer");
      return cleaned;
    },
  };
}
