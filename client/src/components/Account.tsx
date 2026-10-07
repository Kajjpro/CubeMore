// Sign in / sign up (Clerk's own screens, in a pop-up) and your account button.
// Nothing here shows unless accounts are on (see auth.ts).

import { useState, type FormEvent, type ReactNode } from "react";
import { useClerk, useUser, UserButton } from "@clerk/react";
import { isClerkAPIResponseError } from "@clerk/react/errors";
import { AUTH_ENABLED, useAccount } from "../auth";
import { reconnectAsCurrentUser } from "../socket";
import { suggestUsername, USERNAME_MAX_LENGTH, usernameProblem } from "../username";
import { Brand } from "./ui";

/** In the header: "Sign in" for guests; once signed in, your account button (profile, sign out). */
export function AccountButton() {
  return AUTH_ENABLED ? <AccountButtonInner /> : null;
}

function AccountButtonInner() {
  const account = useAccount();
  const clerk = useClerk();
  if (!account.loaded) return null;
  if (account.signedIn) return <UserButton />;
  return (
    <button type="button" className="quiet sign-in-button" onClick={() => clerk.openSignIn()}>
      Sign in
    </button>
  );
}

/** Under a nickname box: guests can keep their name and stats with an account. */
export function GuestHint() {
  return AUTH_ENABLED ? <GuestHintInner /> : null;
}

function GuestHintInner() {
  const clerk = useClerk();
  return (
    <div className="guest-hint">
      <p className="tiny muted">Racing as a guest. An account keeps your name and stats on every device.</p>
      <div className="guest-hint-actions">
        <button type="button" className="link-button" onClick={() => clerk.openSignUp()}>
          Create an account
        </button>
        <button type="button" className="link-button" onClick={() => clerk.openSignIn()}>
          Sign in
        </button>
      </div>
    </div>
  );
}

/** Instead of the nickname box once you're signed in: your username, which is your name everywhere. */
export function SignedInName({ username, label = "Racing as" }: { username: string; label?: string }) {
  return (
    <div className="field grow">
      <span className="field-label">{label}</span>
      <span className="account-name">{username}</span>
    </div>
  );
}

/**
 * Right after signing up, before anything else: choose your username. (Sign-up
 * itself stays quick, one tap with Google; Clerk doesn't ask for it.)
 */
export function UsernameGate({ children }: { children: ReactNode }) {
  return AUTH_ENABLED ? <UsernameGateInner>{children}</UsernameGateInner> : children;
}

function UsernameGateInner({ children }: { children: ReactNode }) {
  const account = useAccount();
  return account.needsUsername ? <ChooseUsername /> : children;
}

function ChooseUsername() {
  const { user } = useUser();
  const clerk = useClerk();
  const email = user?.primaryEmailAddress?.emailAddress;
  const suggestion = suggestUsername([user?.fullName, user?.firstName, email]);

  async function save(username: string): Promise<string | null> {
    if (!user) return "You're not signed in anymore. Please sign in again.";
    try {
      await user.update({ username });
      // The server learns your name when you connect: connect again as the named you.
      reconnectAsCurrentUser();
      return null;
    } catch (error) {
      return usernameError(error);
    }
  }

  return <UsernameForm suggestion={suggestion} onSave={save} onSignOut={() => void clerk.signOut()} />;
}

/** Clerk's reason in words people understand ("That username is taken…"). */
function usernameError(error: unknown): string {
  if (isClerkAPIResponseError(error)) {
    const first = error.errors[0];
    if (first?.code === "form_identifier_exists" || first?.code === "username_exists_code") {
      return "That username is taken. Try another one.";
    }
    // Usernames are switched off in the Clerk dashboard: nobody can fix that here.
    if (first?.code === "form_param_unknown" || /username is not a valid parameter/i.test(first?.message ?? "")) {
      return "Usernames aren't switched on for this site yet. Please tell the site owner (Clerk: turn on Username).";
    }
    return first?.longMessage ?? first?.message ?? "That username can't be used. Try another one.";
  }
  return "Couldn't save it. Check your connection and try again.";
}

/** The username screen itself (also shown on /dev/states). `onSave` returns an error to show, or null. */
export function UsernameForm(props: {
  suggestion: string;
  onSave: (username: string) => Promise<string | null>;
  onSignOut: () => void;
}) {
  const [value, setValue] = useState(props.suggestion);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const problem = usernameProblem(value);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (problem || busy) return;
    setBusy(true);
    setError(await props.onSave(value));
    setBusy(false);
  }

  return (
    <main className="page page-center">
      <div className="panel auth-card">
        <Brand />
        <h1>Choose your username</h1>
        <p className="intro">It's your name in every race and on the leaderboards. Nobody else can take it.</p>
        {error && <p className="banner banner-error">{error}</p>}
        <form className="field auth-form" onSubmit={submit}>
          <label className="field">
            <span className="field-label">Username</span>
            <input
              value={value}
              onChange={(e) => {
                setValue(e.target.value.replace(/\s/g, ""));
                setError(null);
              }}
              maxLength={USERNAME_MAX_LENGTH}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="e.g. anar_cubes"
              autoFocus
            />
          </label>
          <p className={`tiny ${value && problem ? "" : "muted"}`} role="status">
            {value && problem ? problem : "4 to 20 letters, numbers or _."}
          </p>
          <button className="primary" type="submit" disabled={!!problem || busy}>
            {busy ? "Saving…" : "Continue"}
          </button>
          <button type="button" className="quiet" onClick={props.onSignOut}>
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
