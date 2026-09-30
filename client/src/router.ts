// A tiny router: the pages are "/" (home), "/room/CODE", "/room/CODE/overlay"
// (for streamers) and "/daily" (the daily scramble).

import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

// The browser's back/forward buttons.
window.addEventListener("popstate", notify);

/** Go to another page without reloading. */
export function navigate(path: string): void {
  window.history.pushState(null, "", path);
  notify();
}

/** The current path, e.g. "/room/ABC234". Re-renders when it changes. */
export function usePath(): string {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => window.location.pathname,
  );
}
