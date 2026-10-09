import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EVENT_PAGES, socialLinks } from "@cube-racing/shared";
import { canonicalRedirect, isKnownPage, renderPage, sitemap } from "./seo";
import { startServer } from "./server";

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

describe("one address per page", () => {
  it("knows which addresses are pages", () => {
    for (const path of ["/", "/analyze", "/race/3x3", "/room/ABC234", "/room/ABC234/overlay", "/daily"]) expect(isKnownPage(path), path).toBe(true);
    for (const path of ["/nope", "/race/no-such-event", "/room/", "/analyze/x"]) expect(isKnownPage(path), path).toBe(false);
  });

  it("sends other hosts, trailing slashes and capital letters to the one address", () => {
    expect(canonicalRedirect("cubemore.example", "/race/3x3", "", SITE)).toBeNull();
    expect(canonicalRedirect("cubemore.example", "/", "", SITE)).toBeNull();
    expect(canonicalRedirect("cubits-orcn.onrender.com", "/race/3x3", "?x=1", SITE)).toBe(`${SITE}/race/3x3?x=1`);
    expect(canonicalRedirect("cubemore.example", "/race/3x3/", "", SITE)).toBe("/race/3x3");
    expect(canonicalRedirect("cubemore.example", "/RACE/3X3", "", SITE)).toBe("/race/3x3");
    // Room codes keep their capitals; development addresses aren't sent anywhere.
    expect(canonicalRedirect("cubemore.example", "/room/ABC234", "", SITE)).toBeNull();
    expect(canonicalRedirect("localhost:3001", "/race/3x3", "", SITE)).toBeNull();
    expect(canonicalRedirect("anything", "/race/3x3", "", "")).toBeNull();
  });

  it("over HTTP: unknown pages answer 404, other hosts and variants get a 301", async () => {
    const dist = mkdtempSync(path.join(tmpdir(), "cubemore-dist-"));
    writeFileSync(path.join(dist, "index.html"), INDEX);
    const server = await startServer({ port: 0, timing: { solveReviewMs: 0, setResultMs: 100, submitGraceMs: 0 }, logs: false, clientDist: dist, siteUrl: SITE });
    try {
      // node:http, because fetch can't set the Host header.
      const get = (p: string, host?: string) =>
        new Promise<{ status: number; headers: { get(name: string): string | null }; text(): Promise<string> }>((resolve, reject) => {
          const req = request({ port: server.port, path: p, headers: host ? { host } : {} }, (res) => {
            let body = "";
            res.on("data", (chunk) => (body += chunk));
            res.on("end", () =>
              resolve({ status: res.statusCode ?? 0, headers: { get: (name) => (res.headers[name] as string | undefined) ?? null }, text: async () => body }),
            );
          });
          req.on("error", reject);
          req.end();
        });
      expect((await get("/race/3x3")).status).toBe(200);
      expect((await get("/nope")).status).toBe(404);
      expect(await (await get("/nope")).text()).toContain("noindex");
      const slash = await get("/race/3x3/");
      expect(slash.status).toBe(301);
      expect(slash.headers.get("location")).toBe("/race/3x3");
      const other = await get("/analyze", "cubits-orcn.onrender.com");
      expect(other.status).toBe(301);
      expect(other.headers.get("location")).toBe(`${SITE}/analyze`);
      // The uptime check works on any host.
      expect((await get("/health", "cubits-orcn.onrender.com")).status).toBe(200);
    } finally {
      await server.close();
    }
  });
});

describe("the algorithm pages", () => {
  it("are sent with their whole content, title and breadcrumb", () => {
    const html = renderPage(INDEX, "/algorithms/pll/t-perm", SITE);
    expect(html).toContain("<title>T Perm Algorithm and How to Recognize It | CubeMore</title>");
    expect(html).toContain("<h1>T Perm algorithm</h1>");
    expect(html).toContain("R U R&#39; U&#39; R&#39; F R2 U&#39; R&#39; U&#39; R U R&#39; F&#39;");
    expect(html).toContain("1 of 18 solves");
    expect(html).toContain('<svg class="case-diagram"');
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(html).toContain(`"item":"${SITE}/algorithms/pll"`);
    expect(html).not.toContain("noindex");
  });

  it("the lists and the index are pages too, and all of them are in the sitemap", () => {
    expect(renderPage(INDEX, "/algorithms/oll", SITE)).toContain("<h1>All 57 OLL algorithms</h1>");
    expect(renderPage(INDEX, "/algorithms", SITE)).toContain("Start with 2-look");
    const xml = sitemap(SITE);
    expect(xml).toContain(`<loc>${SITE}/algorithms/oll/27-sune</loc>`);
    expect(xml).toContain(`<loc>${SITE}/algorithms/pll/ua-perm</loc>`);
    expect(isKnownPage("/algorithms/oll/99-nothing")).toBe(false);
    expect(renderPage(INDEX, "/algorithms/oll/99-nothing", SITE)).toContain("noindex");
  });
});
