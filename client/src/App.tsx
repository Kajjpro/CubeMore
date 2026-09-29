import { lazy, Suspense } from "react";
import { HomePage } from "./pages/HomePage";
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

  // "/room/ABC234" -> room page for ABC234. Anything else -> home page.
  const match = path.match(/^\/room\/([A-Za-z0-9]+)\/?$/);
  if (match) {
    const code = match[1].toUpperCase();
    // key={code}: switching to another room starts the room page fresh.
    return <RoomPage key={code} code={code} />;
  }
  return <HomePage />;
}
