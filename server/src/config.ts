// All server settings in one place. Each one can be changed with an
// environment variable (see .env.example in the project root).

import { SET_RESULT_MS, SOLVE_REVIEW_MS, SUBMIT_GRACE_MS } from "@cube-racing/shared";

// Loads the `.env` file in the project's root folder, if there is one
// (optional; real environment variables win).
try {
  process.loadEnvFile(new URL("../../.env", import.meta.url));
} catch {
  // No .env file: that's fine.
}

function numberFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export const config = {
  /** The port the server listens on. Fly.io and most hosts set PORT for you. */
  port: numberFromEnv("PORT", 3001),
  /** "production" makes the server also serve the built website (client/dist). */
  isProduction: process.env.NODE_ENV === "production",
  /** Where the built website is. Only used in production. */
  clientDist: process.env.CLIENT_DIST ?? new URL("../../client/dist", import.meta.url).pathname,
  /**
   * Websites on OTHER addresses that may connect to this server, separated by
   * commas, e.g. "https://cube-racing.vercel.app". Needed when the website is
   * hosted somewhere else (like Vercel). Empty = only this server's own address.
   */
  clientOrigins: (process.env.CLIENT_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean),
  /**
   * A Postgres database, e.g. from Neon, Supabase or Render: saved rooms, match
   * history, the daily leaderboard. Empty = kept in memory (reset on every restart).
   */
  databaseUrl: process.env.DATABASE_URL ?? "",
  /**
   * Accounts (sign in with Google, or email and password) through Clerk: the
   * Secret Key from the Clerk dashboard. Empty = no accounts, everyone is a guest.
   */
  clerkSecretKey: process.env.CLERK_SECRET_KEY ?? "",
  /**
   * The website address(es) people sign in on, e.g. "https://cubits.onrender.com".
   * Clerk tokens from any other site are refused. Empty = not checked.
   */
  clerkAuthorizedParties: (process.env.CLERK_AUTHORIZED_PARTIES ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean),
  /**
   * The site's public address, e.g. "https://cubemore.com" (the same VITE_SITE_URL
   * the website is built with): canonical links, link previews, the sitemap.
   */
  siteUrl: (process.env.VITE_SITE_URL ?? "").trim().replace(/\/$/, ""),
  /**
   * Who may read the contact form's messages on /admin: Clerk user ids
   * ("user_2Rf..."), separated by commas. Find yours in the Clerk dashboard → Users.
   */
  adminUserIds: (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),
  /**
   * The analyzer's AI coach: a Google AI Studio key (aistudio.google.com, free tier).
   * Empty = no coach; the analyzer's own suggestions still show.
   */
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  /** Which Gemini model writes the summaries. */
  geminiModel: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
  /** The weekly smart-cube race: day (0 = Sunday ... 6 = Saturday) and hour, in UTC. */
  weeklySchedule: {
    day: Math.min(6, numberFromEnv("WEEKLY_RACE_DAY", 6)),
    hourUtc: Math.min(23, numberFromEnv("WEEKLY_RACE_HOUR_UTC", 12)),
  },
  timing: {
    solveReviewMs: numberFromEnv("SOLVE_REVIEW_MS", SOLVE_REVIEW_MS),
    setResultMs: numberFromEnv("SET_RESULT_MS", SET_RESULT_MS),
    submitGraceMs: numberFromEnv("SUBMIT_GRACE_MS", SUBMIT_GRACE_MS),
  },
};
