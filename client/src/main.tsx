import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Self-hosted fonts: Space Grotesk for the interface, JetBrains Mono for times
// and scrambles (700 for the big timer digits), and the WCA event icons.
import "@fontsource-variable/space-grotesk";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";
import "@fontsource/jetbrains-mono/700.css";
import "@cubing/icons";
import { App } from "./App";
import { applyTheme } from "./prefs";
import "./styles.css";

applyTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
