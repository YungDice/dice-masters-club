import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

const BASE_URL = "https://yungdice.com";

interface SitemapEntry {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

const entries: SitemapEntry[] = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/play", changefreq: "weekly", priority: "0.9" },
  { path: "/challenges", changefreq: "daily", priority: "0.9" },
  { path: "/missions", changefreq: "daily", priority: "0.8" },
  { path: "/marketplace", changefreq: "daily", priority: "0.8" },
  { path: "/crews", changefreq: "weekly", priority: "0.7" },
  { path: "/leaderboard", changefreq: "daily", priority: "0.8" },
  { path: "/leaderboard/crews", changefreq: "daily", priority: "0.6" },
  { path: "/season-pass", changefreq: "weekly", priority: "0.6" },
  { path: "/cosmetics", changefreq: "weekly", priority: "0.5" },
  { path: "/gallery", changefreq: "weekly", priority: "0.5" },
  { path: "/baddies", changefreq: "weekly", priority: "0.5" },
  { path: "/upgrader", changefreq: "weekly", priority: "0.5" },
  { path: "/dikdok", changefreq: "weekly", priority: "0.5" },
  { path: "/play/roulette", changefreq: "monthly", priority: "0.6" },
  { path: "/play/dice", changefreq: "monthly", priority: "0.6" },
  { path: "/play/coinflip", changefreq: "monthly", priority: "0.6" },
  { path: "/play/blackjack", changefreq: "monthly", priority: "0.6" },
  { path: "/play/slots", changefreq: "monthly", priority: "0.6" },
  { path: "/play/split-steal", changefreq: "monthly", priority: "0.6" },
  { path: "/play/poker", changefreq: "monthly", priority: "0.6" },
  { path: "/play/flappy", changefreq: "monthly", priority: "0.6" },
  { path: "/play/obby", changefreq: "monthly", priority: "0.6" },
  { path: "/play/dice-dominion", changefreq: "monthly", priority: "0.6" },
  { path: "/play/numguess", changefreq: "monthly", priority: "0.6" },
  { path: "/play/rocket", changefreq: "monthly", priority: "0.6" },
  { path: "/play/wheel", changefreq: "monthly", priority: "0.6" },
];

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ].filter(Boolean).join("\n"),
        );
        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");
        return new Response(xml, {
          headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" },
        });
      },
    },
  },
});
