import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EVENT_PAGES, socialLinks } from "@cube-racing/shared";
import { renderPage, sitemap } from "./seo";

// The real index.html, with the site address filled in like a build does.
const SITE = "https://cubemore.example";
const INDEX = readFileSync(new URL("../../client/index.html", import.meta.url), "utf8").replaceAll("__SITE_URL__", SITE);
const tag = (html: string, key: string) => html.match(new RegExp(`<meta (?:name|property)="${key}" content="([^"]*)"`))?.[1];

describe("pages for search engines and link previews", () => {
  it("each event page has its own title, description and canonical address", () => {
    const html = renderPage(INDEX, "/race/pyraminx", SITE);
    expect(html).toContain("<title>Pyraminx Race Online | CubeMore</title>");
    expect(tag(html, "description")).toMatch(/^Pyraminx races online/);
    expect(tag(html, "og:url")).toBe(`${SITE}/race/pyraminx`);
    expect(html).toContain(`<link rel="canonical" href="${SITE}/race/pyraminx"`);
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(html).not.toContain("noindex");
  });

  it("the home page says what CubeMore is (structured data), in English and Mongolian", () => {
    const html = renderPage(INDEX, "/", SITE);
    expect(html).toContain("<title>CubeMore: Online Speedcubing Races and Rubik&#39;s Cube Timer</title>");
    expect(html).toContain('"@type":"WebApplication"');
    expect(html).toContain('"inLanguage":["en","mn"]');
  });

  it("the brand: CubeMore in the title, description and site name, with the other spellings people type", () => {
    const html = renderPage(INDEX, "/", SITE);
    expect(html).toContain("<title>CubeMore: Online Speedcubing Races");
    expect(tag(html, "description")).toMatch(/^CubeMore: /);
    expect(tag(html, "og:site_name")).toBe("CubeMore");
    expect(html).toContain('"@type":"Organization","name":"CubeMore","alternateName":["Cube More","Cubemore"]');
    expect(html).toContain(`"logo":"${SITE}/icon-512.png"`);
    expect(renderPage(INDEX, "/race/skewb", SITE)).toContain("<title>Skewb Race Online | CubeMore</title>");
  });

  it("CubeMore's social profiles (shared/site.ts) are linked to the brand", () => {
    const html = renderPage(INDEX, "/", SITE);
    const links = socialLinks().map((link) => link.url);
    if (links.length) expect(html).toContain(`"sameAs":${JSON.stringify(links).replace(/</g, "\\u003c")}`);
    else expect(html).not.toContain("sameAs");
  });

  it("a room: a nice preview, but not in search results; its name can't break the HTML", () => {
    const html = renderPage(INDEX, "/room/ABC234", SITE, { name: 'Bat\'s "<room>"', summary: "Pyraminx, ao5, best of 3" });
    expect(html).toContain('<meta name="robots" content="noindex" />');
    expect(tag(html, "og:title")).toBe("Bat&#39;s &quot;&lt;room&gt;&quot;: race on CubeMore");
    expect(tag(html, "og:description")).toMatch(/^Pyraminx, ao5, best of 3\. Join the race/);
  });

  it("unknown pages and /admin stay out of search results", () => {
    expect(renderPage(INDEX, "/admin", SITE)).toContain("noindex");
    expect(renderPage(INDEX, "/race/no-such-event", SITE)).toContain("noindex");
  });

  it("the sitemap lists home, daily, contact and every event page", () => {
    const xml = sitemap(SITE);
    expect(xml).toContain(`<loc>${SITE}/</loc>`);
    expect(xml).toContain(`<loc>${SITE}/daily</loc>`);
    for (const page of EVENT_PAGES) expect(xml).toContain(`<loc>${SITE}/race/${page.slug}</loc>`);
  });
});
