// Accounts (optional): sign in with Google, or email and password, through
// Clerk. Guests can always race with just a nickname.
//
// Turned on by VITE_CLERK_PUBLISHABLE_KEY (from the Clerk dashboard, baked into
// the website when it's built). Without it there's no sign-in anywhere.

import { useEffect, useState } from "react";
import { getToken, useUser } from "@clerk/react";

export const CLERK_PUBLISHABLE_KEY: string = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? "";
export const AUTH_ENABLED = CLERK_PUBLISHABLE_KEY !== "";

export interface AccountState {
  /** False until Clerk has loaded (then we know whether you're signed in). */
  loaded: boolean;
  signedIn: boolean;
  /** Your unique username: your name in every room. null until you've picked one. */
  username: string | null;
  /** Signed up but no username yet: the app asks for one before anything else. */
  needsUsername: boolean;
  /**
   * The id you play under when signed in (the server makes the same one), so
   * your avatar colour here matches the one in rooms. null for guests.
   */
  playerId: string | null;
}

const NO_ACCOUNTS: AccountState = { loaded: true, signedIn: false, username: null, needsUsername: false, playerId: null };

/**
 * Set when Clerk refused to save a username because usernames are switched
 * off in its dashboard: then nobody is asked for one (their first name is
 * their name) for the rest of this visit, instead of being stuck on that screen.
 */
const USERNAMES_OFF_KEY = "cubemore:usernames-off";

export function markUsernamesOff(): void {
  try {
    sessionStorage.setItem(USERNAMES_OFF_KEY, "1");
  } catch {
    // Storage blocked: the page reload below still lets them in for now.
  }
}

function usernamesOff(): boolean {
  try {
    return sessionStorage.getItem(USERNAMES_OFF_KEY) === "1";
  } catch {
    return false;
  }
}

/** If Clerk hasn't loaded by then (blocked, offline), carry on as a guest rather than wait forever. */
const LOAD_TIMEOUT_MS = 6_000;

/** Whether you're signed in, and as whom. */
export function useAccount(): AccountState {
  // AUTH_ENABLED never changes while the page is open, so the hook order is always the same.
  if (!AUTH_ENABLED) return NO_ACCOUNTS;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useClerkAccount();
}

function useClerkAccount(): AccountState {
  const { isLoaded, isSignedIn, user } = useUser();
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    if (isLoaded) return;
    const timer = setTimeout(() => setGaveUp(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isLoaded]);
  if (!isLoaded) return gaveUp ? NO_ACCOUNTS : { ...NO_ACCOUNTS, loaded: false };
  if (!isSignedIn) return NO_ACCOUNTS;
  const off = !user.username && usernamesOff();
  return {
    loaded: true,
    signedIn: true,
    // The server does the same: the first name when there's no username.
    username: user.username ?? (off ? (user.firstName ?? "Cuber") : null),
    needsUsername: !user.username && !off,
    playerId: `account:${user.id}`,
  };
}

/**
 * The session token sent when connecting to the game server (null = play as a
 * guest). `fresh` skips Clerk's cache, after the server refused an old one.
 */
export async function sessionToken(fresh = false): Promise<string | null> {
  if (!AUTH_ENABLED) return null;
  try {
    return await getToken(fresh ? { skipCache: true } : undefined);
  } catch {
    return null; // Clerk couldn't load (offline, blocked): race as a guest
  }
}
