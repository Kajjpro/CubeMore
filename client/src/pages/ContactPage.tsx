// /contact: a short form (saved for the site owner, read on /admin), plus the
// email address and social links from site.ts, when they're filled in.

import { useState, type FormEvent } from "react";
import { ClientEvents } from "@cube-racing/shared";
import { useAccount } from "../auth";
import { Link, SiteFooter, SiteHeader } from "../components/Site";
import { SITE, socialLinks } from "../site";
import { request } from "../socket";
import { loadIdentity } from "../storage";

type Sent = { name: string; email: string } | null;

export function ContactPage({ demoSent }: { demoSent?: Sent }) {
  const [sent, setSent] = useState<Sent>(demoSent ?? null);
  const socials = socialLinks();

  return (
    <div className="home contact-page">
      <SiteHeader />
      <main className="contact-main">
        <section className="panel contact-panel" aria-labelledby="contact-title">
          {sent ? (
            <div className="contact-sent" role="status">
              <h1 id="contact-title">Thanks, {sent.name}!</h1>
              <p className="intro">Your message is in. We'll reply to {sent.email}.</p>
              <div className="row">
                <button type="button" onClick={() => setSent(null)}>
                  Send another
                </button>
                <Link to="/" className="button-link primary">
                  Back to the races
                </Link>
              </div>
            </div>
          ) : (
            <>
              <h1 id="contact-title">Contact</h1>
              <p className="intro">Questions, ideas, a bug, or an event you'd like to run on {SITE.name}? Write to us.</p>
              <ContactForm onSent={setSent} />
            </>
          )}
        </section>

        {(SITE.email || socials.length > 0) && (
          <aside className="panel contact-other" aria-label="Other ways to reach us">
            {SITE.email && (
              <div>
                <h2 className="card-title">Email</h2>
                <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
              </div>
            )}
            {socials.length > 0 && (
              <div>
                <h2 className="card-title">Follow {SITE.name}</h2>
                <ul className="social-list">
                  {socials.map((social) => (
                    <li key={social.key}>
                      <a href={social.url} target="_blank" rel="noopener noreferrer">
                        {social.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

function ContactForm({ onSent }: { onSent: (sent: NonNullable<Sent>) => void }) {
  const account = useAccount();
  const [name, setName] = useState(() => (account.signedIn && account.username) || loadIdentity().nickname);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  // A trap for bots: hidden from people, so it stays empty.
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const response = await request(ClientEvents.CONTACT_SEND, { name, email, message, ...(website ? { website } : {}) });
    setBusy(false);
    if (response.ok) onSent({ name: name.trim(), email: email.trim() });
    else setError(response.error);
  }

  return (
    <form className="contact-form" onSubmit={submit}>
      {error && <p className="banner banner-error">{error}</p>}
      <div className="contact-row">
        <label className="field">
          <span className="field-label">Your name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" required />
        </label>
        <label className="field">
          <span className="field-label">Email (so we can reply)</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} autoComplete="email" required />
        </label>
      </div>
      <label className="field">
        <span className="field-label">Message</span>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={7} maxLength={2000} minLength={10} required />
        <span className="tiny muted counter">{message.length}/2000</span>
      </label>
      <label className="contact-trap" aria-hidden="true">
        Website
        <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </label>
      <button type="submit" className="primary" disabled={busy}>
        {busy ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
