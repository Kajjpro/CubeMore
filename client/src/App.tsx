import { lazy, Suspense, useEffect } from "react";
import { eventPageBySlug, pageMeta } from "@cube-racing/shared";
import { AdminPage } from "./pages/AdminPage";
import { ContactPage } from "./pages/ContactPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { DailyPage } from "./pages/DailyPage";
import { EventPage } from "./pages/EventPage";
import { HomePage } from "./pages/HomePage";
import { OverlayPage } from "./pages/OverlayPage";
import { RoomPage } from "./pages/RoomPage";
import { usePath } from "./router";

// Development only: every screen and state with mock data. `import.meta.env.DEV`
// is false in production builds, so this page isn't even included there.
// The analyzer brings the analysis engine and the 3D cube: loaded only when opened.
const AnalyzerPage = lazy(() => import("./pages/AnalyzerPage").then((m) => ({ default: m.AnalyzerPage })));

const DevStates = import.meta.env.DEV ? lazy(() => import("./dev/DevStates").then((m) => ({ default: m.DevStates }))) : null;

export function App() {
  const path = usePath();

  // The browser tab shows the page's title (rooms keep their own, with "New scramble" alerts).
  useEffect(() => {
    if (!path.startsWith("/room/")) document.title = pageMeta(path).title;
  }, [path]);

  if (DevStates && path === "/dev/states") {
    return (
      <Suspense fallback={null}>
        <DevStates />
      </Suspense>
    );
  }

  if (path === "/daily" || path === "/daily/") return <DailyPage />;
  if (path === "/analyze" || path === "/analyze/") {
    return (
      <Suspense fallback={<div className="home" />}>
        <AnalyzerPage />
      </Suspense>
    );
  }
  if (path === "/contact" || path === "/contact/") return <ContactPage />;
  if (path === "/privacy" || path === "/privacy/") return <PrivacyPage />;

  // "/race/pyraminx" -> that event's page (an unknown event: the home page).
  const race = path.match(/^\/race\/([\w-]+)\/?$/);
  const eventPage = race ? eventPageBySlug(race[1]) : undefined;
  if (eventPage) return <EventPage key={eventPage.slug} page={eventPage} />;
  if (path === "/admin" || path === "/admin/") return <AdminPage />;

  // "/room/ABC234/overlay" -> the streamer overlay for that room.
  const overlay = path.match(/^\/room\/([A-Za-z0-9]+)\/overlay\/?$/);
  if (overlay) return <OverlayPage code={overlay[1].toUpperCase()} />;

  // "/room/ABC234" -> room page for ABC234. Anything else -> home page.
  const match = path.match(/^\/room\/([A-Za-z0-9]+)\/?$/);
  if (match) {
    const code = match[1].toUpperCase();
    // key={code}: switching to another room starts the room page fresh.
    return <RoomPage key={code} code={code} />;
  }
  return <HomePage />;
}
