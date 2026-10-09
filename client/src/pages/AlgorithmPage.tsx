/*
 * /algorithms, /algorithms/oll, /algorithms/pll and one page per case. The
 * content is the same HTML the server sends to search engines
 * (shared/content/algorithmPages.ts); links inside it move without reloading.
 */

import { useEffect, type MouseEvent } from "react";
import { algorithmPageHtml, algorithmPageMeta } from "@cube-racing/shared/content/algorithmPages";
import { SiteFooter, SiteHeader } from "../components/Site";
import { navigate } from "../router";

export function AlgorithmPage({ path }: { path: string }) {
  const html = algorithmPageHtml(path) ?? "";
  useEffect(() => {
    window.scrollTo(0, 0);
    const meta = algorithmPageMeta(path);
    if (meta) document.title = meta.title;
  }, [path]);

  // Links in the page: move inside the app (new tab and outside links: the browser).
  const follow = (event: MouseEvent<HTMLElement>) => {
    const link = (event.target as HTMLElement).closest("a");
    const href = link?.getAttribute("href");
    if (!link || !href?.startsWith("/") || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    navigate(href);
  };

  return (
    <div className="home static-page">
      <SiteHeader />
      <main className="static-main" onClick={follow} dangerouslySetInnerHTML={{ __html: html }} />
      <SiteFooter />
    </div>
  );
}
