import { useEffect } from "react";

/**
 * Keeps the screen on while `active` (a phone lying on the table shouldn't dim
 * between solves). Uses the Screen Wake Lock API; does nothing where it isn't
 * supported. The browser drops the lock when the tab is hidden, so it's taken
 * again when the tab becomes visible.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let stopped = false;

    async function acquire(): Promise<void> {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        lock = await navigator.wakeLock.request("screen");
      } catch {
        // Not allowed (battery saver, iframe...): fail silently.
      }
    }

    const onVisibility = () => void acquire();
    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void lock?.release().catch(() => {});
    };
  }, [active]);
}
