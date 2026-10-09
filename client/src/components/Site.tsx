// The header and footer of CubeMore's pages (home, contact, admin).

import type { MouseEvent, ReactNode } from "react";
import { navigate } from "../router";
import { SITE, socialLinks } from "../site";
import { AccountButton } from "./Account";
import { Brand, ThemeButton } from "./ui";

/** A link inside the site: no page reload. */
export function Link({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  const go = (event: MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return; // new tab: let the browser do it
    event.preventDefault();
    navigate(to);
  };
  return (
    <a href={to} onClick={go} className={className}>
      {children}
    </a>
  );
}

/** Logo (back home), anything extra (e.g. "3 racing now"), theme, account. */
export function SiteHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="site-head">
      <Brand onClick={() => navigate("/")} />
      <span className="grow" />
      {children}
      <Link to="/analyze" className="head-link">
        Solve analyzer
      </Link>
      <ThemeButton />
      <AccountButton />
    </header>
  );
}

export function SiteFooter() {
  const socials = socialLinks();
  return (
    <footer className="home-foot site-foot">
      <nav className="foot-links" aria-label="More">
        <Link to="/analyze">Solve analyzer</Link>
        <Link to="/daily">Daily scramble</Link>
        <Link to="/contact">Contact</Link>
        <Link to="/privacy">Privacy</Link>
        {socials.map((social) => (
          <a key={social.key} href={social.url} target="_blank" rel="noopener noreferrer">
            {social.label}
          </a>
        ))}
      </nav>
      <span className="foot-note">
        <span>
          © {new Date().getFullYear()} {SITE.name}
        </span>
        <span>Scrambles and pictures by cubing.js</span>
      </span>
    </footer>
  );
}
