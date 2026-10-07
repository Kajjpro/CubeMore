// /admin: the contact form's messages, for the site owner only (the server
// checks that you're signed in with an account listed in ADMIN_USER_IDS).

import { useCallback, useEffect, useState } from "react";
import { ClientEvents, type ContactMessage } from "@cube-racing/shared";
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
      <main className="contact-main">
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
                    <a className="button-link" href={`mailto:${m.email}?subject=${encodeURIComponent("Re: your message to Cubist")}`}>
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
