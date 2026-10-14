// The result card: a 1200 × 630 image of a finished match, to post anywhere.
// Drawn on a canvas in the browser (nothing is uploaded), then handed to the
// phone's share sheet, or downloaded where sharing files isn't supported.

import { TEAM_IDS, teamName, type MatchSnapshot, type RoomSettings, type TeamId } from "@cube-racing/shared";
import { FORMAT_LABELS, roomEventShort, WIN_CONDITION_LABELS, nameList } from "./labels";
import { SITE } from "./site";
import { formatMark } from "./time";

export interface CardData {
  match: MatchSnapshot;
  settings: RoomSettings;
  names: Record<string, string>;
}

const W = 1200;
const H = 630;
// The dark theme's colours (the card looks the same whatever theme you use).
const COLORS = {
  bg: "#07090d",
  surface: "#0f1218",
  border: "#222835",
  text: "#eef1f7",
  text2: "#aeb6c8",
  muted: "#7e879c",
  accent: "#6ea2ff",
  green: "#3ddc84",
  gold: "#ffc83d",
};
/** The six faces, for the stripe along the top. */
const STICKERS = ["#2a6cf5", "#ec3c41", "#19b35a", "#ff7f1f", "#ffd426", "#f4f6fa"];
const MONO = '"JetBrains Mono", ui-monospace, monospace';
const SANS = '"Space Grotesk Variable", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Each player's best set result in the match (their best ao5 / single). */
function bestSet(match: MatchSnapshot, id: string): number | "DNF" | undefined {
  const marks = match.finishedSets.map((set) => set.standings[id]?.result).filter((m) => m !== undefined);
  const times = marks.filter((m): m is number => typeof m === "number");
  return times.length ? Math.min(...times) : marks.length ? "DNF" : undefined;
}

/** Draws the card and returns it as a PNG. */
export async function drawResultCard({ match, settings, names }: CardData): Promise<Blob> {
  // The fonts must be loaded before drawing with them (a page only loads a font once it's used).
  await Promise.all([
    document.fonts.load(`500 28px ${MONO}`),
    document.fonts.load(`700 28px ${MONO}`),
    document.fonts.load(`700 64px ${SANS}`),
  ]).catch(() => {});
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const nameOf = (id: string) => names[id] ?? "Player";

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);
  // A soft blue glow in the top left corner, like the app.
  const glow = ctx.createRadialGradient(120, -40, 0, 120, -40, 620);
  glow.addColorStop(0, "rgba(42, 108, 245, 0.28)");
  glow.addColorStop(1, "rgba(42, 108, 245, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  // The six faces along the top.
  STICKERS.forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.fillRect((W / STICKERS.length) * i, 0, W / STICKERS.length + 1, 8);
  });

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = COLORS.accent;
  ctx.font = `600 26px ${SANS}`;
  ctx.fillText(SITE.name, 64, 84);
  ctx.textAlign = "right";
  ctx.fillStyle = COLORS.muted;
  ctx.font = `500 22px ${SANS}`;
  ctx.fillText(`${window.location.host}, ${new Date().toLocaleDateString()}`, W - 64, 84);
  ctx.textAlign = "left";

  // Team matches: the two teams, with their players.
  if (match.teams) {
    drawTeams(ctx, match, settings, nameOf);
    return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No image"))), "image/png"));
  }

  // Headline: who won, and the score.
  const ranking = Object.entries(match.points).sort(([, a], [, b]) => b - a);
  const winners = match.winnerIds.map(nameOf);
  const headline = winners.length ? `${nameList(winners)} ${winners.length > 1 ? "win" : "wins"}` : "Match over";
  ctx.fillStyle = COLORS.text;
  ctx.font = `700 64px ${SANS}`;
  ctx.fillText(fit(ctx, headline, W - 128), 64, 174);

  const score = ranking.length > 1 ? `, ${ranking[0][1]}–${ranking[1][1]}` : "";
  const handicap = settings.scoring === "handicap" ? ", Handicap" : "";
  ctx.fillStyle = COLORS.text2;
  ctx.font = `500 28px ${MONO}`;
  ctx.fillText(
    `${roomEventShort(settings)}, ${FORMAT_LABELS[settings.format]}, ${WIN_CONDITION_LABELS[settings.winCondition]}${handicap}${score}`,
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
    ctx.fillStyle = won ? COLORS.gold : COLORS.text;
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
      await navigator.share({ files: [file], title: `${SITE.name} result` });
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

const TEAM_COLORS: Record<TeamId, string> = { A: STICKERS[0], B: STICKERS[1] };

/** The card of a team match: "Blue team wins 2–1", then a row per team with its players. */
function drawTeams(ctx: CanvasRenderingContext2D, match: MatchSnapshot, settings: RoomSettings, nameOf: (id: string) => string): void {
  const teams = match.teams!;
  const order = [...TEAM_IDS].sort((a, b) => teams.points[b] - teams.points[a]);
  const [high, low] = order.map((t) => teams.points[t]);
  ctx.textAlign = "left";
  ctx.fillStyle = COLORS.text;
  ctx.font = `700 64px ${SANS}`;
  const headline = teams.winners.length === 1 ? `${teamName(teams.winners[0])} wins ${high}–${low}` : `Team match, ${high}–${low}`;
  ctx.fillText(fit(ctx, headline, W - 128), 64, 174);
  ctx.fillStyle = COLORS.text2;
  ctx.font = `500 28px ${MONO}`;
  ctx.fillText(`${roomEventShort(settings)}, ${FORMAT_LABELS[settings.format]}, ${WIN_CONDITION_LABELS[settings.winCondition]}, Teams`, 64, 226);

  const rowH = 132;
  const top = 272;
  order.forEach((team, i) => {
    const y = top + i * (rowH + 16);
    const won = teams.winners.includes(team);
    ctx.fillStyle = COLORS.surface;
    roundRect(ctx, 48, y, W - 96, rowH, 14);
    ctx.fill();
    ctx.fillStyle = TEAM_COLORS[team];
    roundRect(ctx, 72, y + 30, 28, 28, 6);
    ctx.fill();
    ctx.textAlign = "left";
    ctx.fillStyle = won ? COLORS.gold : COLORS.text;
    ctx.font = `700 36px ${SANS}`;
    ctx.fillText(teamName(team), 118, y + 56);
    const members = Object.keys(teams.of).filter((id) => teams.of[id] === team).map(nameOf);
    ctx.fillStyle = COLORS.text2;
    ctx.font = `500 26px ${SANS}`;
    ctx.fillText(fit(ctx, members.join(", "), W - 360), 118, y + 100);
    ctx.textAlign = "right";
    ctx.fillStyle = COLORS.text;
    ctx.font = `700 56px ${MONO}`;
    ctx.fillText(String(teams.points[team]), W - 88, y + 84);
  });
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
