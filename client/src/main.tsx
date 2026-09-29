import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Self-hosted monospace font for times and scrambles, and the WCA event icons.
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";
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
