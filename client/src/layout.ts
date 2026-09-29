import { useSyncExternalStore } from "react";

/**
 * The three layouts (see DESIGN.md):
 *  "phone"     portrait phones: stage + bottom sheet
 *  "landscape" phones on their side: stage 2/3 + compact standings 1/3
 *  "wide"      tablets and desktops: stage + room panel
 */
export type Layout = "phone" | "landscape" | "wide";

const LANDSCAPE = "(orientation: landscape) and (max-height: 500px)";
const WIDE = "(min-width: 768px) and (min-height: 501px)";

function current(): Layout {
  if (window.matchMedia(LANDSCAPE).matches) return "landscape";
  if (window.matchMedia(WIDE).matches) return "wide";
  return "phone";
}

function subscribe(listener: () => void): () => void {
  const queries = [LANDSCAPE, WIDE].map((q) => window.matchMedia(q));
  queries.forEach((q) => q.addEventListener("change", listener));
  return () => queries.forEach((q) => q.removeEventListener("change", listener));
}

export function useLayout(): Layout {
  return useSyncExternalStore(subscribe, current);
}
