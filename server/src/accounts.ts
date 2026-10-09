/*
 * ACCOUNTS (optional): players can sign in with Clerk (Google, or email and
 * password). Guests still play with just a nickname.
 *
 * The browser sends its Clerk session token when it connects (Socket.IO
 * `auth`). The server checks it ONCE per connection, here. A signed-in player:
 *   - plays as `accountPlayerId(userId)`: the same player on every device, so
 *     their history, daily result and seat in a room follow the account;
 *   - is called by their Clerk username (unique, so nobody can pose as them).
 * Every reconnect sends a fresh token, so signing out ends it on the next connect.
 *
 * Without CLERK_SECRET_KEY there are no accounts: everyone is a guest.
 */

import { createClerkClient, verifyToken } from "@clerk/backend";
import { NICKNAME_MAX_LENGTH } from "@cube-racing/shared";

export interface Account {
  /** Clerk's user id, e.g. "user_2RfWKJ...". */
  userId: string;
  /** Shown to everyone (the account's username). */
  username: string;
}

export interface AccountVerifier {
  /** The account a session token belongs to, or null if the token isn't valid. */
  verify(token: string): Promise<Account | null>;
  /** How many accounts there are (for the owner's stats). */
  count?(): Promise<number>;
}

/**
 * The secret player id of an account. Guests send a random UUID from their
 * browser (checked by the schema), so a guest can never claim an account's id.
 */
export function accountPlayerId(userId: string): string {
  return `account:${userId}`;
}

/** Usernames are looked up once and kept this long (a renamed account shows up within it). */
const USERNAME_TTL_MS = 5 * 60_000;

export function clerkAccounts(secretKey: string, authorizedParties: string[]): AccountVerifier {
  const clerk = createClerkClient({ secretKey });
  const usernames = new Map<string, { username: string; at: number }>();

  async function usernameOf(userId: string): Promise<string | null> {
    const cached = usernames.get(userId);
    if (cached && Date.now() - cached.at < USERNAME_TTL_MS) return cached.username;
    try {
      const user = await clerk.users.getUser(userId);
      // The app asks for a username right after sign-up. Until then (a moment), the
      // first name stands in, and isn't kept: the next connect picks up the username.
      if (!user.username) return (user.firstName ?? "Cuber").slice(0, NICKNAME_MAX_LENGTH);
      const username = user.username.slice(0, NICKNAME_MAX_LENGTH);
      usernames.set(userId, { username, at: Date.now() });
      return username;
    } catch {
      return cached?.username ?? null; // Clerk unreachable: the old name is better than none
    }
  }

  let counted: { n: number; at: number } | null = null;
  return {
    async count() {
      // Asked at most every 5 minutes (it's a call to Clerk).
      if (counted && Date.now() - counted.at < USERNAME_TTL_MS) return counted.n;
      counted = { n: await clerk.users.getCount(), at: Date.now() };
      return counted.n;
    },
    async verify(token) {
      let userId: string;
      try {
        const payload = await verifyToken(token, { secretKey, ...(authorizedParties.length ? { authorizedParties } : {}) });
        userId = payload.sub;
      } catch {
        return null;
      }
      const username = await usernameOf(userId);
      return username ? { userId, username } : null;
    },
  };
}
