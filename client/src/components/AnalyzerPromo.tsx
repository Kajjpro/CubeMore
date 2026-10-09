/*
 * The solve analyzer, shown where cubers already are: a card on the home page
 * and a short line on the 3x3 event pages. Few words, one button.
 */

import { Link } from "./Site";
import { Icon } from "./ui";

export function AnalyzerPromo() {
  return (
    <section className="panel analyzer-promo" aria-labelledby="analyzer-promo-title">
      <div className="promo-text">
        <p className="promo-kicker">
          <span className="tag">New</span> Solve analyzer
        </p>
        <h2 id="analyzer-promo-title">See where your solve loses time</h2>
        <p className="promo-lead">Every stage timed, and what to practice next.</p>
      </div>
      <div className="promo-actions">
        <Link to="/analyze" className="button-link promo-go">
          Analyze my solves <Icon name="arrowRight" size={16} />
        </Link>
        <span className="tiny muted">Free, with a smart cube</span>
      </div>
    </section>
  );
}

/** One line for the 3x3 and OH event pages. */
export function AnalyzerLine() {
  return (
    <p className="small analyzer-line">
      Have a smart cube? Try the <Link to="/analyze">solve analyzer</Link>.
    </p>
  );
}
