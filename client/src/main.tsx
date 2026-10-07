import { StrictMode, useEffect, useRef, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider, useAuth } from "@clerk/react";
// Self-hosted fonts: Space Grotesk for the interface, JetBrains Mono for times
// and scrambles (700 for the big timer digits), and the WCA event icons.
import "@fontsource-variable/space-grotesk";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";
import "@fontsource/jetbrains-mono/700.css";
import "@cubing/icons";
import { App } from "./App";
import { AUTH_ENABLED, CLERK_PUBLISHABLE_KEY } from "./auth";
import { UsernameGate } from "./components/Account";
import { applyTheme } from "./prefs";
import { reconnectAsCurrentUser } from "./socket";
import "./styles.css";

applyTheme();

/**
 * The sign-in and account screens (Clerk) in the app's own colours and fonts.
 * They're CSS variables, so the screens follow the light / dark theme too.
 */
const clerkAppearance = {
  variables: {
    colorPrimary: "var(--accent-bg)",
    colorPrimaryForeground: "#ffffff",
    colorBackground: "var(--surface)",
    colorForeground: "var(--text)",
    colorMutedForeground: "var(--muted)",
    colorMuted: "var(--surface-2)",
    colorInput: "var(--surface-2)",
    colorInputForeground: "var(--text)",
    colorBorder: "var(--border)",
    colorNeutral: "var(--text)",
    colorDanger: "var(--red)",
    fontFamily: "var(--font-ui)",
    borderRadius: "10px",
  },
};

/** Signing in or out changes who you are: the connection starts again as the new you. */
function ReconnectOnSignIn() {
  const { isLoaded, userId } = useAuth();
  const last = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!isLoaded) return;
    if (last.current !== undefined && last.current !== userId) reconnectAsCurrentUser();
    last.current = userId ?? null;
  }, [isLoaded, userId]);
  return null;
}

function WithAccounts({ children }: { children: ReactNode }) {
  if (!AUTH_ENABLED) return children;
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} appearance={clerkAppearance}>
      <ReconnectOnSignIn />
      <UsernameGate>{children}</UsernameGate>
    </ClerkProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WithAccounts>
      <App />
    </WithAccounts>
  </StrictMode>,
);
