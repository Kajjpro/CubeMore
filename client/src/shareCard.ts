// The result card: a 1200 × 630 image of a finished match, to post anywhere.
// Drawn on a canvas in the browser (nothing is uploaded), then handed to the
// phone's share sheet, or downloaded where sharing files isn't supported.

import type { MatchSnapshot, RoomSettings } from "@cube-racing/shared";
import { EVENT_SHORT, FORMAT_LABELS, WIN_CONDITION_LABELS, nameList } from "./labels";
import { formatMark } from "./time";

export interface CardData {
  match: MatchSnapshot;
  settings: RoomSettings;
  names: Record<string, string>;
}

const W = 1200;
const H = 630;
// The dark theme's colours (the card looks the same whatever theme you use).
const COLORS = { bg: "#121316", surface: "#1a1b1f", border: "#262830", text: "#ececf0", text2: "#b4b4bd", muted: "#8f909b", accent: "#7aa7ec", green: "#4cc26b" };
const MONO = '"JetBrains Mono", ui-monospace, monospace';
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Each player's best set result in the match (their best ao5 / single). */
function bestSet(match: MatchSnapshot, id: string): number | "DNF" | undefined {
  const marks = match.finishedSets.map((set) => set.standings[id]?.result).filter((m) => m !== undefined);
  const times = marks.filter((m): m is number => typeof m === "number");
  return times.length ? Math.min(...times) : marks.length ? "DNF" : undefined;
}

/** Draws the card and returns it as a PNG. */
export async function drawResultCard({ match, settings, names }: CardData): Promise<Blob> {
  // The fonts must be loaded before drawing with them (a page only loads a font once it's used).
  await Promise.all([document.fonts.load(`500 28px ${MONO}`), document.fonts.load(`700 28px ${MONO}`)]).catch(() => {});
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const nameOf = (id: string) => names[id] ?? "Player";

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);
  // A thin accent line along the top.
  ctx.fillStyle = COLORS.accent;
  ctx.fillRect(0, 0, W, 6);

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = COLORS.accent;
  ctx.font = `600 26px ${SANS}`;
  ctx.fillText("Cube Racing", 64, 84);
  ctx.textAlign = "right";
  ctx.fillStyle = COLORS.muted;
  ctx.font = `500 22px ${SANS}`;
  ctx.fillText(`${window.location.host} · ${new Date().toLocaleDateString()}`, W - 64, 84);
  ctx.textAlign = "left";

  // Headline: who won, and the score.
  const ranking = Object.entries(match.points).sort(([, a], [, b]) => b - a);
  const winners = match.winnerIds.map(nameOf);
  const headline = winners.length ? `${nameList(winners)} ${winners.length > 1 ? "win" : "wins"}` : "Match over";
  ctx.fillStyle = COLORS.text;
  ctx.font = `700 64px ${SANS}`;
  ctx.fillText(fit(ctx, headline, W - 128), 64, 174);

  const score = ranking.length > 1 ? ` · ${ranking[0][1]}–${ranking[1][1]}` : "";
  const handicap = settings.scoring === "handicap" ? " · Handicap" : "";
  ctx.fillStyle = COLORS.text2;
  ctx.font = `500 28px ${MONO}`;
  ctx.fillText(
    `${EVENT_SHORT[settings.cubeEvent]} · ${FORMAT_LABELS[settings.format]} · ${WIN_CONDITION_LABELS[settings.winCondition]}${handicap}${score}`,
    64,
    226,
  );

  // The top five: rank, name, best set, points.
  const top = ranking.slice(0, 5);
  const rowH = 56;
  const tableTop = 284;
  ctx.fillStyle = COLORS.surface;
  roundRect(ctx, 48, tableTop - 12, W - 96, top.length * rowH + 24, 12);
  ctx.fill();
  ctx.font = `500 22px ${SANS}`;
  ctx.fillStyle = COLORS.muted;
  ctx.textAlign = "right";
  ctx.fillText(FORMAT_LABELS[settings.format] === "Single" ? "best single" : `best ${FORMAT_LABELS[settings.format]}`, 920, tableTop - 20);
  ctx.fillText("pts", W - 80, tableTop - 20);
  top.forEach(([id, points], i) => {
    const y = tableTop + i * rowH + 39;
    const won = match.winnerIds.includes(id);
    ctx.textAlign = "left";
    ctx.fillStyle = COLORS.muted;
    ctx.font = `500 28px ${MONO}`;
    ctx.fillText(String(i + 1), 80, y);
    ctx.fillStyle = won ? COLORS.green : COLORS.text;
    ctx.font = `${won ? 700 : 500} 30px ${SANS}`;
    ctx.fillText(fit(ctx, nameOf(id), 600), 130, y);
    ctx.textAlign = "right";
    ctx.fillStyle = COLORS.text;
    ctx.font = `500 30px ${MONO}`;
    ctx.fillText(formatMark(bestSet(match, id)), 920, y);
    ctx.font = `700 30px ${MONO}`;
    ctx.fillText(String(points), W - 80, y);
    if (i < top.length - 1) {
      ctx.fillStyle = COLORS.border;
      ctx.fillRect(72, y + 18, W - 144, 1);
    }
  });


  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No image"))), "image/png"));
}

/**
 * Shares the card: the share sheet where the browser can share files (phones),
 * otherwise a download. Returns what happened, for the button's label.
 */
export async function shareResultCard(data: CardData): Promise<"shared" | "downloaded" | "cancelled"> {
  const blob = await drawResultCard(data);
  const file = new File([blob], "cube-racing-result.png", { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Cube Racing result" });
      return "shared";
    } catch {
      return "cancelled"; // closed the share sheet
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "downloaded";
}

/** Shortens text with "…" until it fits `width`. */
function fit(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);
  return `${cut}…`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
