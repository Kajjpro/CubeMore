// /privacy: what CubeMore keeps about you, and why. Plain words; kept in line
// with what the code really stores (see the tables in server/src/persistence,
// server/src/daily and server/src/contact.ts, and client/src/storage.ts).

import { Link, SiteFooter, SiteHeader } from "../components/Site";
import { SITE } from "../site";

const UPDATED = "October 9, 2026";

export function PrivacyPage() {
  return (
    <div className="home contact-page">
      <SiteHeader />
      <main className="contact-main">
        <article className="panel contact-panel privacy" aria-labelledby="privacy-title">
          <h1 id="privacy-title">Privacy</h1>
          <p className="small muted">Last updated: {UPDATED}</p>
          <p className="intro">
            {SITE.name} is a place to race other cubers. We keep only what the races need, we show no ads, use no analytics or
            tracking, and never sell your data.
          </p>

          <h2>Racing as a guest</h2>
          <p>
            Your browser keeps your nickname, a random id (so a room knows you after a refresh), your settings and the PINs of
            rooms you joined. They stay on your device; clearing your browser's site data removes them.
          </p>

          <h2>Your account</h2>
          <p>
            If you create an account, sign-in is handled by Clerk: they keep your email address and password, or your Google
            name and picture if you sign in with Google. We see your username and use it as your name in rooms. Sign-in uses
            cookies from Clerk; we set no other cookies.
          </p>

          <h2>Races</h2>
          <p>
            Your times, penalties and points in each race, the scrambles, your nickname or username, and (for smart cube solves)
            the moves of your solve are kept in our database as match history, results and leaderboards. A room's chat is kept
            while the room is open, then deleted with it. Daily scramble results are kept for the leaderboard.
          </p>

          <h2>The solve analyzer</h2>
          <p>
            The analyzer works out your stages, cases and suggestions in your browser. If you're signed in, each analyzed solve
            (its scramble, moves, move times and analysis) is kept with your account so you can see it again under Your sessions,
            until you delete it there. Guests' solves are not kept.
          </p>
          <p>
            If you ask for a coach summary, the numbers of that session (times, stages, cases and suggestions, never your name,
            username or email) are sent to Google's Gemini AI to write it. The summary is then kept with the session. Google may use
            what it receives to improve its services, so only these solve statistics are ever sent.
          </p>

          <h2>The contact form</h2>
          <p>
            Your name, email address and message (and your username, if you're signed in) are kept so we can reply, until we
            delete them. To stop spam, the server remembers your internet address in its memory (never in the database) until it restarts.
          </p>

          <h2>Who helps us run {SITE.name}</h2>
          <p>
            Render (hosting), Neon (our database, in Singapore), Clerk (accounts) and Google (if you sign in with Google, and for
            analyzer coach summaries you ask for).
            They process data for us to run the site, under their own privacy policies.
          </p>

          <h2>Deleting your data</h2>
          <p>
            You can delete your account from your account settings (the account button, then Manage account). To delete your
            race history or a message you sent, <Link to="/contact">write to us</Link>
            {SITE.email ? (
              <>
                {" "}
                or email <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
              </>
            ) : null}
            , and we'll remove it.
          </p>

          <h2>Young cubers</h2>
          <p>Lots of cubers are young. If you're under 13, please ask a parent before creating an account; racing as a guest needs only a nickname.</p>

          <h2>Changes</h2>
          <p>If this changes, we'll update this page and its date.</p>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
