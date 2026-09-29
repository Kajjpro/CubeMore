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
  timing: {
    solveReviewMs: numberFromEnv("SOLVE_REVIEW_MS", SOLVE_REVIEW_MS),
    setResultMs: numberFromEnv("SET_RESULT_MS", SET_RESULT_MS),
    submitGraceMs: numberFromEnv("SUBMIT_GRACE_MS", SUBMIT_GRACE_MS),
  },
};
