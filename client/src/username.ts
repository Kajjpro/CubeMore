// Usernames: what counts as one, and a first suggestion after sign-up.
// (Clerk checks them again, and that nobody else has it.)

import { NICKNAME_MAX_LENGTH } from "@cube-racing/shared";

export const USERNAME_MIN_LENGTH = 4;
/** It's your name in rooms, so no longer than a nickname. */
export const USERNAME_MAX_LENGTH = NICKNAME_MAX_LENGTH;

/** Why this can't be a username, or null if it can. */
export function usernameProblem(name: string): string | null {
  if (name.length < USERNAME_MIN_LENGTH) return `At least ${USERNAME_MIN_LENGTH} characters.`;
  if (name.length > USERNAME_MAX_LENGTH) return `At most ${USERNAME_MAX_LENGTH} characters.`;
  if (!/^[A-Za-z0-9_]+$/.test(name)) return "Only letters, numbers and _.";
  return null;
}

/** A first try, from the name or email they signed up with ("Anar B." -> "anarb"). Empty if nothing fits. */
export function suggestUsername(from: (string | null | undefined)[]): string {
  for (const source of from) {
    const clean = (source ?? "")
      .split("@")[0]
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9_]/g, "")
      .toLowerCase()
      .slice(0, USERNAME_MAX_LENGTH);
    if (clean.length >= USERNAME_MIN_LENGTH) return clean;
  }
  return "";
}
