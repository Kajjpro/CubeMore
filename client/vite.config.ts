import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // One .env file for everything, in the project root (only VITE_* values reach the website).
  const env = loadEnv(mode, "..", "VITE_");
  return {
    plugins: [react(), siteAddress(env.VITE_SITE_URL ?? "")],
    envDir: "..",
    server: {
      port: 5173,
      // The browser only talks to this Vite server. Vite forwards all Socket.IO
      // traffic ("/socket.io/...") to our Node server on port 3001.
      // `ws: true` means WebSocket connections are forwarded too.
      proxy: {
        "/socket.io": { target: "http://localhost:3001", ws: true },
      },
    },
  };
});

/**
 * The site's public address (VITE_SITE_URL, e.g. https://cubist.app): link
 * previews need full addresses for the page and its image, and search engines
 * read robots.txt and the sitemap. Without it, the links stay relative.
 */
function siteAddress(raw: string): Plugin {
  const siteUrl = raw.trim().replace(/\/$/, "");
  const pages = ["/", "/daily", "/contact"];
  return {
    name: "cubist-site-address",
    transformIndexHtml: (html) => html.replaceAll("__SITE_URL__", siteUrl),
    generateBundle() {
      const sitemapLine = siteUrl ? `\nSitemap: ${siteUrl}/sitemap.xml\n` : "";
      this.emitFile({ type: "asset", fileName: "robots.txt", source: `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /dev\n${sitemapLine}` });
      if (!siteUrl) return;
      const urls = pages.map((page) => `  <url><loc>${siteUrl}${page}</loc></url>`).join("\n");
      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
      });
    },
  };
}
