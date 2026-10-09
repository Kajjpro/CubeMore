// An address that isn't a page (the server answers 404): say so, and offer the main pages.

import { Link, SiteFooter, SiteHeader } from "../components/Site";

export function NotFoundPage() {
  return (
    <div className="home contact-page">
      <SiteHeader />
      <main className="contact-main">
        <section className="panel contact-panel">
          <h1>Page not found</h1>
          <p className="intro">This page doesn't exist, or it moved.</p>
          <div className="row">
            <Link to="/" className="button-link">
              Open rooms
            </Link>
            <Link to="/analyze" className="button-link">
              Solve analyzer
            </Link>
            <Link to="/daily" className="button-link">
              Daily scramble
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
