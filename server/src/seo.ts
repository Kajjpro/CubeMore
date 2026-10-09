/*
 * SEARCH ENGINES AND LINK PREVIEWS (pure).
 *
 * The website is one page (index.html) that JavaScript fills in. Crawlers and
 * link previews (Facebook, WhatsApp, Discord...) often read only the HTML the
 * server sends, so before sending it, the server writes in the page's own
 * title, description, canonical address and preview tags (from shared/seo.ts),
 * marks pages that shouldn't be in search results (rooms, admin), and adds
 * structured data that tells search engines what CubeMore is.
 */

import { algorithmCrumbs, algorithmPageHtml, algorithmPageMeta } from "@cube-racing/shared/content/algorithmPages";
import { indexablePaths, pageMeta, eventPageBySlug, isKnownPage, setExtraPageMeta, SITE_ALIASES, SITE_NAME, HOME_META, socialLinks, type PageMeta } from "@cube-racing/shared";

// The algorithm pages' titles and descriptions (odds, moves...).
setExtraPageMeta(algorithmPageMeta);

/** For HTML attributes and text: & < > " ' as entities. */
function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Replaces the content="..." of the meta tag with this name or property (if the page has it). */
function setMeta(html: string, key: string, value: string): string {
  const pattern = new RegExp(`(<meta (?:name|property)="${key}" content=")[^"]*(")`);
  return html.replace(pattern, `$1${escape(value)}$2`);
}

/** Structured data: what this page is, in the form search engines read (schema.org JSON-LD). */
function structuredData(meta: PageMeta, siteUrl: string): object[] {
  const url = `${siteUrl}${meta.path}`;
  if (meta.path === "/") {
    return [
      // The site's name as Google shows it in results (and how else people spell it).
      { "@context": "https://schema.org", "@type": "WebSite", name: SITE_NAME, alternateName: SITE_ALIASES, url: `${siteUrl}/`, inLanguage: ["en", "mn"] },
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: SITE_NAME,
        alternateName: SITE_ALIASES,
        url: `${siteUrl}/`,
        logo: `${siteUrl}/icon-512.png`,
        // CubeMore's own social profiles (shared/site.ts): "this Instagram is CubeMore".
        ...(socialLinks().length ? { sameAs: socialLinks().map((link) => link.url) } : {}),
      },
      {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        name: SITE_NAME,
        alternateName: SITE_ALIASES,
        url: `${siteUrl}/`,
        description: HOME_META.description,
        applicationCategory: "GameApplication",
        operatingSystem: "Any (in a web browser)",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        keywords: "CubeMore, Cube More, speedcubing, Rubik's cube timer, online cube race, cubing competition, csTimer alternative, WCA, Рубик шоо, кубик",
      },
    ];
  }
  if (meta.path.startsWith("/algorithms") && !meta.noindex) {
    const trail = [{ name: SITE_NAME, path: "/" }, ...algorithmCrumbs(meta.path)];
    return [
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: trail.map((step, i) => ({ "@type": "ListItem", position: i + 1, name: step.name, item: `${siteUrl}${step.path}` })),
      },
    ];
  }
  const event = meta.path.startsWith("/race/") ? eventPageBySlug(meta.path.slice("/race/".length)) : undefined;
  if (event) {
    return [
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: SITE_NAME, item: `${siteUrl}/` },
          { "@type": "ListItem", position: 2, name: `${event.name} race`, item: url },
        ],
      },
    ];
  }
  return [];
}

/**
 * The page HTML for one address: index.html with this page's tags.
 * `siteUrl` is the public address ("https://cubemore.com"), or "" (then links stay relative).
 */
export function renderPage(indexHtml: string, path: string, siteUrl: string, room?: { name: string; summary: string } | null): string {
  const meta = pageMeta(path, room);
  const url = `${siteUrl}${meta.path}`;
  let html = indexHtml.replace(/<title>[^<]*<\/title>/, `<title>${escape(meta.title)}</title>`);
  html = setMeta(html, "description", meta.description);
  html = setMeta(html, "og:title", meta.title);
  html = setMeta(html, "og:description", meta.description);
  html = setMeta(html, "og:url", url);
  html = setMeta(html, "twitter:title", meta.title);
  html = setMeta(html, "twitter:description", meta.description);
  html = html.replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${escape(url)}$2`);

  const extra: string[] = [];
  if (meta.noindex) extra.push('<meta name="robots" content="noindex" />');
  for (const data of structuredData(meta, siteUrl)) {
    // "<" escaped so the JSON can never close the script tag.
    extra.push(`<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`);
  }
  if (extra.length) html = html.replace("</head>", `    ${extra.join("\n    ")}\n  </head>`);
  // The page's own content, so search engines read it without running the app (which then replaces it).
  const body = pageBody(meta.path);
  return body ? html.replace('<div id="root"></div>', `<div id="root">${body}</div>`) : html;
}

/** The sitemap: every page search engines should know about. */
export function sitemap(siteUrl: string): string {
  const urls = indexablePaths().map((path) => `  <url><loc>${escape(siteUrl + path)}</loc></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

/**
 * Where a request should be sent instead, or null when it's fine: one address
 * per page, so search engines don't see the same page several times.
 *   - another host (e.g. the onrender.com address) -> the site's own address
 *   - a slash at the end -> without it ("/race/3x3/" -> "/race/3x3")
 *   - capitals in an event page ("/RACE/3x3" -> "/race/3x3"); room codes keep theirs
 */
export { isKnownPage };

export function canonicalRedirect(host: string | undefined, path: string, query: string, siteUrl: string): string | null {
  let clean = path.length > 1 ? path.replace(/\/+$/, "") : path;
  if (/^\/race\//i.test(clean)) clean = clean.toLowerCase();
  let siteHost = "";
  try {
    siteHost = siteUrl ? new URL(siteUrl).host : "";
  } catch {
    siteHost = "";
  }
  const otherHost = Boolean(siteHost && host && host !== siteHost && !host.startsWith("localhost") && !host.startsWith("127.0.0.1"));
  if (!otherHost && clean === path) return null;
  return `${otherHost ? siteUrl : ""}${clean}${query}`;
}

/** The site's header and footer around prerendered content (the app draws its own once it starts). */
function frame(main: string): string {
  return `<div class="home static-page"><header class="site-head"><a class="brand" href="/">${SITE_NAME}</a><span class="grow"></span><a class="head-link" href="/analyze">Solve analyzer</a><a class="head-link" href="/algorithms">Algorithms</a></header><main class="static-main">${main}</main><footer class="home-foot site-foot"><nav class="foot-links" aria-label="More"><a href="/">Race now</a><a href="/analyze">Solve analyzer</a><a href="/algorithms">OLL and PLL algorithms</a><a href="/daily">Daily scramble</a><a href="/contact">Contact</a><a href="/privacy">Privacy</a></nav></footer></div>`;
}

/** Prerendered content for a page, or null (the app alone). */
export function pageBody(path: string): string | null {
  const algorithms = path.startsWith("/algorithms") ? algorithmPageHtml(path) : null;
  return algorithms ? frame(algorithms) : null;
}
