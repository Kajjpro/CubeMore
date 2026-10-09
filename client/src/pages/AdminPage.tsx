// /admin, for the site owner only (the server checks that you're signed in with
// an account listed in ADMIN_USER_IDS): how many people use CubeMore, and the
// contact form's messages.

import { useCallback, useEffect, useState } from "react";
import { ClientEvents, type ContactMessage, type SiteStats } from "@cube-racing/shared";
import { AUTH_ENABLED, useAccount } from "../auth";
import { ConfirmButton } from "../components/ConfirmButton";
import { SiteHeader } from "../components/Site";
import { request, socket } from "../socket";

export function AdminPage() {
  const account = useAccount();
  const [messages, setMessages] = useState<ContactMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await request(ClientEvents.ADMIN_MESSAGES, {});
    if (response.ok) {
      setMessages(response.messages);
      setError(null);
    } else {
      setError(response.error);
    }
  }, []);

  // Ask again on every (re)connect: signing in connects again as the new you.
  useEffect(() => {
    if (!account.signedIn) return;
    const onConnect = () => void load();
    socket.on("connect", onConnect);
    if (socket.connected) void load();
    return () => void socket.off("connect", onConnect);
  }, [account.signedIn, load]);

  async function remove(id: string): Promise<void> {
    const response = await request(ClientEvents.ADMIN_DELETE_MESSAGE, { id });
    if (response.ok) setMessages((list) => list?.filter((m) => m.id !== id) ?? null);
    else setError(response.error);
  }

  return (
    <div className="home admin-page">
      <SiteHeader />
      <main className="contact-main admin-main">
        {account.signedIn && !error && <StatsPanel />}
        <section className="panel contact-panel">
          <div className="card-head">
            <h1>Messages</h1>
            {messages && <span className="card-head-meta muted">{messages.length}</span>}
          </div>
          {!AUTH_ENABLED ? (
            <p className="intro">Accounts aren't set up, so nobody can sign in here. See "Accounts" in DEPLOY.md.</p>
          ) : !account.loaded ? (
            <p className="muted">Loading…</p>
          ) : !account.signedIn ? (
            <p className="intro">Sign in with the site owner's account to read the contact messages.</p>
          ) : error ? (
            <p className="banner banner-error">{error}</p>
          ) : messages === null ? (
            <p className="muted">Loading…</p>
          ) : messages.length === 0 ? (
            <p className="intro">No messages yet.</p>
          ) : (
            <ul className="message-list">
              {messages.map((m) => (
                <li key={m.id} className="message">
                  <div className="message-head">
                    <b>{m.name}</b>
                    {m.username && <span className="tag">@{m.username}</span>}
                    <a href={`mailto:${m.email}`}>{m.email}</a>
                    <span className="grow" />
                    <time className="tiny muted" dateTime={new Date(m.at).toISOString()}>
                      {new Date(m.at).toLocaleString()}
                    </time>
                  </div>
                  <p className="message-text">{m.message}</p>
                  <div className="row">
                    <a className="button-link" href={`mailto:${m.email}?subject=${encodeURIComponent("Re: your message to CubeMore")}`}>
                      Reply
                    </a>
                    <ConfirmButton className="quiet danger" label="Delete" confirmLabel="Tap again to delete" onConfirm={() => void remove(m.id)} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

/** How many people use CubeMore: now, per day, all time. Refreshed every 30 seconds. */
function StatsPanel() {
  const [stats, setStats] = useState<SiteStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = () =>
      void request(ClientEvents.ADMIN_STATS, {}).then((r) => {
        if (r.ok) {
          setStats(r.stats);
          setError(null);
        } else {
          setError(r.error);
        }
      });
    socket.on("connect", load);
    if (socket.connected) load();
    const interval = setInterval(load, 30_000);
    return () => {
      socket.off("connect", load);
      clearInterval(interval);
    };
  }, []);

  if (error) return <p className="banner banner-error">{error}</p>;
  if (!stats) return <p className="muted">Loading the stats…</p>;
  return <StatsView stats={stats} />;
}

const dayLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

/** The stats on screen (also used by /dev/states). */
export function StatsView({ stats }: { stats: SiteStats }) {
  const { visitors, activity } = stats;
  const most = Math.max(1, ...stats.daily.map((d) => d.visitors));
  return (
    <section className="panel contact-panel admin-stats" aria-labelledby="stats-title">
      <div className="card-head">
        <h1 id="stats-title">Stats</h1>
        <span className="card-head-meta tiny muted">Updates every 30 s</span>
      </div>

      <dl className="stat-grid">
        <Stat label="Online now" value={stats.onlineNow} note={`${stats.roomsNow} ${stats.roomsNow === 1 ? "room" : "rooms"} open, ${stats.racingNow} racing`} />
        <Stat label="Today" value={visitors.today} note={`${visitors.newToday} new`} />
        <Stat label="Last 7 days" value={visitors.last7} />
        <Stat label="Last 30 days" value={visitors.last30} />
        <Stat label="All time" value={visitors.allTime} note={stats.since ? `since ${dayLabel(stats.since)}` : undefined} />
        <Stat label="Accounts" value={stats.accounts ?? "–"} note={stats.accounts === null ? "accounts are off" : undefined} />
      </dl>

      <div className="visits-chart">
        <p className="small">
          <b>Visitors per day</b> <span className="muted">(last 30 days, the solid part is new visitors)</span>
        </p>
        <ol className="visits-bars">
          {stats.daily.map((d) => (
            <li key={d.day} title={`${dayLabel(d.day)}: ${d.visitors} visitors, ${d.newVisitors} new`} aria-label={`${dayLabel(d.day)}: ${d.visitors} visitors, ${d.newVisitors} new`}>
              <span className="visits-bar" style={{ height: `${(d.visitors / most) * 100}%` }}>
                <span className="visits-new" style={{ height: d.visitors ? `${(d.newVisitors / d.visitors) * 100}%` : 0 }} />
              </span>
            </li>
          ))}
        </ol>
        <div className="visits-axis tiny muted" aria-hidden>
          <span>{dayLabel(stats.daily[0].day)}</span>
          <span>{dayLabel(stats.daily[14].day)}</span>
          <span>Today</span>
        </div>
      </div>

      {activity && (
        <dl className="stat-grid stat-grid-small">
          <Stat label="Races this week" value={activity.racesLast7} />
          <Stat label="Races, all time" value={activity.racesAll} />
          <Stat label="Solves in races" value={activity.solvesAll} />
          <Stat label="Analyzer sessions" value={activity.analyzerSessions} />
        </dl>
      )}

      <p className="tiny muted">
        A visitor is one browser, counted once a day.
        {stats.kept ? "" : " These numbers are kept in memory and start again when the server restarts (set DATABASE_URL to keep them)."}
      </p>
      <div className="stats-more">
        <span className="small muted">Countries, devices and where visitors come from:</span>
        <a className="button-link" href="https://dash.cloudflare.com/?to=/:account/web-analytics" target="_blank" rel="noopener noreferrer">
          Cloudflare Web Analytics
        </a>
      </div>
    </section>
  );
}

function Stat({ label, value, note }: { label: string; value: number | string; note?: string }) {
  return (
    <div className="stat">
      <dt className="tiny muted">{label}</dt>
      <dd>
        <span className="stat-value mono">{typeof value === "number" ? value.toLocaleString() : value}</span>
        {note && <span className="tiny muted">{note}</span>}
      </dd>
    </div>
  );
}
