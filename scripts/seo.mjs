// Generates public/sitemap.xml and public/robots.txt from the content JSON. Runs before every build.
import { readFileSync, writeFileSync } from "node:fs";

const site = (process.env.VITE_SITE_URL || "https://www.duruvasa.com").replace(/\/$/, "");
const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const services = read("../src/content/services.json").items;
const posts = read("../src/content/posts.json").items;
const legal = ["privacy-policy", "accessibility-statement", "terms-and-conditions"];

const today = new Date().toISOString().slice(0, 10);
const urls = [
  ["/", today, "1.0"],
  ["/insights", today, "0.7"],
  ...services.map((s) => [`/services/${s.slug}`, today, "0.9"]),
  ...posts.map((p) => [`/insights/${p.slug}`, p.date, "0.6"]),
  ...legal.map((l) => [`/${l}`, today, "0.2"]),
];

const xml =
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map(([u, d, p]) => `  <url><loc>${site}${u}</loc><lastmod>${d}</lastmod><priority>${p}</priority></url>`).join("\n") +
  `\n</urlset>\n`;

writeFileSync(new URL("../public/sitemap.xml", import.meta.url), xml);
writeFileSync(new URL("../public/robots.txt", import.meta.url), `User-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml\n`);
console.log(`seo: wrote sitemap.xml (${urls.length} urls) and robots.txt for ${site}`);
