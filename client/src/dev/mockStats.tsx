// Development only: the /admin stats with made-up numbers (for /dev/states).

import type { SiteStats } from "@cube-racing/shared";
import { SiteHeader } from "../components/Site";
import { StatsView } from "../pages/AdminPage";

const today = Date.UTC(2026, 9, 10);
const daily = Array.from({ length: 30 }, (_, i) => {
  const visitors = i < 8 ? 0 : Math.round(6 + i * 1.8 + ((i * 37) % 11));
  return { day: new Date(today - (29 - i) * 86_400_000).toISOString().slice(0, 10), visitors, newVisitors: Math.round(visitors * 0.45), signedIn: Math.round(visitors * 0.2) };
});

const STATS: SiteStats = {
  onlineNow: 7,
  roomsNow: 3,
  racingNow: 1,
  visitors: { today: 63, last7: 241, last30: 512, allTime: 540, newToday: 28 },
  daily,
  since: daily[8].day,
  accounts: 38,
  activity: { racesLast7: 57, racesAll: 212, solvesAll: 3480, analyzerSessions: 19 },
  kept: true,
};

export function MockStats() {
  return (
    <div className="home admin-page">
      <SiteHeader />
      <main className="contact-main admin-main">
        <StatsView stats={STATS} />
      </main>
    </div>
  );
}
