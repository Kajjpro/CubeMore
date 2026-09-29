// Player preferences (saved in localStorage per ?profile=), as a small store
// that React components can subscribe to with usePrefs().

import { useSyncExternalStore } from "react";
import { profileKey } from "./storage";

export type ThemePref = "system" | "light" | "dark";
/** What the timer shows while running: hundredths, whole seconds, or just "solving". */
export type RunningDisplay = "full" | "seconds" | "hidden";
export type InputMode = "timer" | "typing";
export type PreviewPref = "2d" | "3d" | "off";

export interface Prefs {
  theme: ThemePref;
  runningDisplay: RunningDisplay;
  inputMode: InputMode;
  sound: boolean;
  preview: PreviewPref;
}

const DEFAULTS: Prefs = { theme: "system", runningDisplay: "full", inputMode: "timer", sound: true, preview: "2d" };
const KEY = profileKey("prefs");

function load(): Prefs {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Prefs>;
    // Older versions saved the input mode on its own.
    const oldMode = localStorage.getItem(profileKey("timer-mode"));
    return { ...DEFAULTS, ...(oldMode === "typing" ? { inputMode: "typing" } : {}), ...saved };
  } catch {
    return DEFAULTS;
  }
}

let prefs = load();
const listeners = new Set<() => void>();

export function getPrefs(): Prefs {
  return prefs;
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
  prefs = { ...prefs, [key]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Storage full or blocked: the setting still applies until the page is closed.
  }
  if (key === "theme") applyTheme();
  listeners.forEach((listener) => listener());
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => prefs,
  );
}

/** Puts the theme on <html>. "system" removes the attribute so the CSS follows the OS setting. */
export function applyTheme(override?: ThemePref): void {
  const theme = override ?? prefs.theme;
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
}
