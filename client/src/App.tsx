import { lazy, Suspense } from "react";
import { DailyPage } from "./pages/DailyPage";
import { HomePage } from "./pages/HomePage";
import { OverlayPage } from "./pages/OverlayPage";
import { RoomPage } from "./pages/RoomPage";
import { usePath } from "./router";

// Development only: every screen and state with mock data. `import.meta.env.DEV`
// is false in production builds, so this page isn't even included there.
const DevStates = import.meta.env.DEV ? lazy(() => import("./dev/DevStates").then((m) => ({ default: m.DevStates }))) : null;

export function App() {
  const path = usePath();

  if (DevStates && path === "/dev/states") {
    return (
      <Suspense fallback={null}>
        <DevStates />
      </Suspense>
    );
  }

  if (path === "/daily" || path === "/daily/") return <DailyPage />;

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
