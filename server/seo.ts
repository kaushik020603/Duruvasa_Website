// Search, answer-engine and AI-assistant visibility (SEO / AEO / GEO).
// The site is a single-page app, so crawlers that do not run JavaScript (most AI bots) would see an empty page.
// This module renders, on the server and from the live CMS content: per-page <head> tags, JSON-LD structured data,
// a crawlable HTML snapshot of each page, a 404 status for unknown addresses, plus sitemap.xml, robots.txt and llms.txt.
import crypto from "node:crypto";
import fs from "node:fs";
import { type Request, type Response, type Router, Router as makeRouter } from "express";
import { config } from "./config.js";
import { getBundle } from "./content.js";
import { all } from "./db.js";
import { clip, fullTitle, homeTitle } from "../shared/seo.js";
import { renderMarkdown } from "../shared/markdown.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Doc = Record<string, any>;
interface Content { site: Doc; hero: Doc; about: Doc; sections: Doc; services: Doc[]; offerings: Doc[]; advantages: Doc[]; attributes: Doc[]; posts: Doc[]; legal: Doc[]; partners: Doc[]; team: Doc[]; resources: Doc[] }

const SITE = config.siteUrl;
const LOGO = "/img/logo-t.webp";
const OG_IMAGE = "/og-image.jpg";
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const abs = (u: string) => (/^https?:\/\//.test(u) ? u : SITE + u);
const iso = (ms: number) => new Date(ms).toISOString();
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s&/-])([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase()).replace(/\b(Ceo|Cto|Ciso|Coo|Soc)\b/g, (m) => m.toUpperCase());
const jsonLdText = (o: unknown) => JSON.stringify(o).replace(/</g, "\\u003c").replace(new RegExp(String.fromCharCode(0x2028) + "|" + String.fromCharCode(0x2029), "g"), "");

// ------------------------------------------------------------------ content + modification dates (cached per bundle version)
interface Snapshot { c: Content; mod: Map<string, number>; latest: number }
let snap: { etag: string; v: Snapshot } | null = null;
const pageCache = new Map<string, { status: number; html: string; etag: string }>();

function snapshot(): Snapshot {
  const b = getBundle();
  if (snap?.etag === b.etag) return snap.v;
  const raw = JSON.parse(b.json) as Record<string, any>;
  const c = { ...raw } as unknown as Content;
  for (const k of ["services", "offerings", "advantages", "attributes", "posts", "legal", "partners", "team", "resources"] as const) c[k] = (raw[k] ?? []) as Doc[];
  for (const k of ["site", "hero", "about", "sections"] as const) c[k] = (raw[k] ?? {}) as Doc;
  const mod = new Map<string, number>();
  let latest = 0;
  for (const r of all<{ collection: string; doc_key: string; updated_at: number; updated_by: string | null }>("SELECT collection, doc_key, updated_at, updated_by FROM docs WHERE published = 1")) {
    // An article nobody has edited since it was imported is dated by its own publish date, not by the import.
    mod.set(`${r.collection}/${r.doc_key}`, r.collection === "posts" && r.updated_by === "seed" ? 0 : r.updated_at);
    latest = Math.max(latest, r.updated_at);
  }
  for (const r of all<{ key: string; updated_at: number }>("SELECT key, updated_at FROM settings")) {
    mod.set(`settings/${r.key}`, r.updated_at);
    latest = Math.max(latest, r.updated_at);
  }
  snap = { etag: b.etag, v: { c, mod, latest } };
  pageCache.clear();
  return snap.v;
}

// ------------------------------------------------------------------ structured data
const ORG_ID = `${SITE}/#organization`;
const personId = (name: string) => `${SITE}/#person-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

function organization(c: Content) {
  const s = c.site;
  return {
    "@type": ["Organization", "ProfessionalService"], "@id": ORG_ID,
    name: s.name, url: `${SITE}/`, description: s.description,
    logo: { "@type": "ImageObject", url: abs(LOGO), width: 512, height: 512 },
    image: abs(OG_IMAGE),
    ...(s.email && { email: s.email }),
    ...(s.phone && { telephone: s.phone }),
    sameAs: [s.linkedin].filter(Boolean),
    knowsAbout: [...c.services.map((x) => x.title), "Cloud security", "Cybersecurity consulting", "Zero trust", "Security operations (SOC)"],
    founder: c.team[0]?.name ? { "@id": personId(c.team[0].name) } : undefined,
    employee: c.team.map((t) => ({ "@id": personId(t.name) })),
    contactPoint: [{ "@type": "ContactPoint", contactType: "customer support", ...(s.email && { email: s.email }), ...(s.phone && { telephone: s.phone }) }],
    hasOfferCatalog: {
      "@type": "OfferCatalog", name: "Cybersecurity services",
      itemListElement: c.services.map((x) => ({ "@type": "Offer", itemOffered: { "@type": "Service", name: x.title, description: x.tagline, url: `${SITE}/services/${x.slug}` } })),
    },
  };
}

function people(c: Content) {
  return c.team.filter((t) => t.name).map((t) => ({
    "@type": "Person", "@id": personId(t.name), name: t.name, jobTitle: titleCase(t.role || ""),
    description: t.bio, ...(t.photo && { image: abs(t.photo) }),
    ...(t.linkedin && { sameAs: [t.linkedin] }), worksFor: { "@id": ORG_ID },
    ...(t.skills?.length && { knowsAbout: t.skills }),
    ...(t.certs?.length && { hasCredential: t.certs.map((x: Doc) => ({ "@type": "EducationalOccupationalCredential", credentialCategory: "certification", name: `${x.vendor} certification` })) }),
  }));
}

const breadcrumb = (items: [string, string][]) => ({
  "@context": "https://schema.org", "@type": "BreadcrumbList",
  itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: SITE + path })),
});

// ------------------------------------------------------------------ pages
interface Page {
  status: number; title: string; description: string; path: string; type: "website" | "article"; noindex?: boolean;
  jsonLd: object[]; body: string; published?: string; modified?: string;
}

const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const list = (items: string[]) => (items.length ? `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>` : "");

function navHtml(c: Content) {
  return `<header><nav aria-label="Main"><a href="/">${esc(c.site.name)}</a> ` +
    `<a href="/#services-list">Services</a> <a href="/#about">About us</a> <a href="/#team">Team</a> <a href="/insights">Insights</a> <a href="/#contact">Contact</a></nav></header>`;
}
function footerHtml(c: Content) {
  const s = c.site;
  const legal = c.legal.map((l) => `<a href="/${esc(l.slug)}">${esc(l.title)}</a>`).join(" ");
  return `<footer><p>${esc(s.footerNote || s.description)}</p><p>Email <a href="mailto:${esc(s.email)}">${esc(s.email)}</a>` +
    `${s.phone ? ` · Call <a href="tel:${esc(s.phone)}">${esc(s.phone)}</a>` : ""}</p><nav aria-label="Legal">${legal}</nav></footer>`;
}
const wrap = (c: Content, inner: string) => `<div class="ssr">${navHtml(c)}<main>${inner}</main>${footerHtml(c)}</div>`;

function homePage(c: Content, lastmod: number): Page {
  const s = c.site, h = c.hero, a = c.about, sec = c.sections;
  const body = wrap(c, [
    `<h1>${esc(h.lineA)} ${esc(h.lineB)}</h1>`,
    h.card && `<p>${esc(h.card)}</p>`,
    h.words?.length && list(h.words.map(esc)),
    `<section><h2>${esc(sec.partners?.heading ?? "Our partners")}</h2><p>${esc(sec.partners?.sub)}</p>` +
      list(c.partners.map((p) => `<a href="${esc(p.url)}" rel="noopener">${esc(p.name)}</a>: ${esc(p.tagline)}`)) + `</section>`,
    `<section id="about"><h2>${esc(a.lead)}</h2><p>${esc(a.intro)}</p>${(a.paragraphs ?? []).map((p: string) => `<p>${esc(p)}</p>`).join("")}` +
      (a.stats?.length ? list(a.stats.map((x: Doc) => `${esc(x.label)}: ${esc(x.value)}${esc(x.suffix)}`)) : "") +
      (a.pillars ?? []).map((p: Doc) => `<h3>${esc(p.title)}</h3><p>${esc(p.text)}</p>`).join("") +
      (a.values?.length ? `<h3>What we stand for</h3>${list(a.values.map((v: Doc) => `<b>${esc(v.title)}</b>: ${esc(v.text)}`))}` : "") + `</section>`,
    `<section id="team"><h2>${esc(sec.team?.heading ?? "Team")}</h2>` +
      c.team.map((t) => `<article><h3>${esc(t.name)}</h3><p>${esc(t.role)}</p><p>${esc(t.bio)}</p>` +
        (t.certs?.length ? `<p>Certifications: ${t.certs.map((x: Doc) => esc(x.vendor)).join(", ")}</p>` : "") +
        (t.skills?.length ? `<p>Expertise: ${t.skills.map(esc).join(", ")}</p>` : "") +
        (t.linkedin ? `<p><a href="${esc(t.linkedin)}" rel="noopener">${esc(t.name)} on LinkedIn</a></p>` : "") + `</article>`).join("") + `</section>`,
    `<section><h2>${esc(sec.advantages?.heading ?? "Why choose us")}</h2>${c.advantages.map((x) => `<h3>${esc(x.title)}</h3><p>${esc(x.text)}</p>`).join("")}</section>`,
    `<section id="services-list"><h2>${esc(sec.offerings?.heading ?? "Our offerings")}</h2><p>${esc(sec.offerings?.intro)}</p>` +
      c.offerings.map((o) => `<h3>${o.slug ? `<a href="/services/${esc(o.slug)}">${esc(o.title)}</a>` : esc(o.title)}</h3><p>${esc(o.text)}</p>`).join("") + `</section>`,
    `<section><h2>${esc(sec.attributes?.heading ?? "Key attributes")}</h2><p>${esc(sec.attributes?.text)}</p>${c.attributes.map((x) => `<h3>${esc(x.title)}</h3><p>${esc(x.text)}</p>`).join("")}</section>`,
    c.resources.length ? `<section><h2>${esc(sec.resources?.heading ?? "Free resources")}</h2>${c.resources.map((r) => `<h3>${esc(r.title)}</h3><p>${esc(r.description)}</p>`).join("")}</section>` : "",
    `<section id="contact"><h2>${esc(sec.contact?.heading ?? "Contact us")}</h2><p>${esc(sec.contact?.emailNote)} <a href="mailto:${esc(s.email)}">${esc(s.email)}</a></p>` +
      (s.phone ? `<p>Phone: <a href="tel:${esc(s.phone)}">${esc(s.phone)}</a>${s.phoneLabel ? ` (${esc(s.phoneLabel)})` : ""}</p>` : "") + `</section>`,
  ].filter(Boolean).join(""));

  return {
    status: 200, title: homeTitle(s.name), description: clip(s.description), path: "/", type: "website", body, modified: iso(lastmod),
    jsonLd: [{
      "@context": "https://schema.org",
      "@graph": [
        organization(c),
        ...people(c),
        { "@type": "WebSite", "@id": `${SITE}/#website`, url: `${SITE}/`, name: s.name, description: s.description, inLanguage: "en", publisher: { "@id": ORG_ID } },
        { "@type": "WebPage", "@id": `${SITE}/#webpage`, url: `${SITE}/`, name: homeTitle(s.name), description: clip(s.description), isPartOf: { "@id": `${SITE}/#website` }, about: { "@id": ORG_ID }, primaryImageOfPage: { "@type": "ImageObject", url: abs(OG_IMAGE) }, dateModified: iso(lastmod), inLanguage: "en" },
      ],
    }],
  };
}

function servicePage(c: Content, s: Doc, mod: number): Page {
  const path = `/services/${s.slug}`;
  const others = c.services.filter((x) => x.slug !== s.slug);
  const body = wrap(c, [
    `<nav aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/#services-list">Services</a> / ${esc(s.title)}</nav>`,
    `<article><h1>${esc(s.title)}</h1><p><b>${esc(s.tagline)}</b></p><p>${esc(s.intro)}</p>`,
    `<h2>What it covers</h2>${list((s.covers ?? []).map(esc))}`,
    `<h2>How it works</h2><ol>${(s.steps ?? []).map((x: Doc) => `<li><h3>${esc(x.title)}</h3><p>${esc(x.text)}</p></li>`).join("")}</ol>`,
    `<h2>Frequently asked questions</h2>${(s.faqs ?? []).map((f: Doc) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join("")}`,
    `<h2>Other services</h2>${list(others.map((o) => `<a href="/services/${esc(o.slug)}">${esc(o.title)}</a>: ${esc(o.tagline)}`))}</article>`,
  ].join(""));
  return {
    status: 200, title: s.title, description: clip(s.intro), path, type: "website", body, modified: iso(mod),
    jsonLd: [
      { "@context": "https://schema.org", "@type": "Service", "@id": `${SITE}${path}#service`, name: s.title, serviceType: s.title, description: s.intro, slogan: s.tagline, url: SITE + path, provider: { "@id": ORG_ID }, areaServed: undefined },
      ...(s.faqs?.length ? [{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: s.faqs.map((f: Doc) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }] : []),
      breadcrumb([["Home", "/"], ["Services", "/#services-list"], [s.title, path]]),
    ],
  };
}

function insightsPage(c: Content, mod: number): Page {
  const desc = "Practical articles on cloud security, threat detection and compliance from the DuRuVaSa CloudSec team.";
  const posts = [...c.posts].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const body = wrap(c, `<h1>Cloud security, in plain language</h1>` + posts.map((p) =>
    `<article><h2><a href="/insights/${esc(p.slug)}">${esc(p.title)}</a></h2><p><time datetime="${esc(p.date)}">${esc(fmtDate(p.date))}</time> · ${esc(p.readMins)} min read</p><p>${esc(p.excerpt)}</p></article>`).join(""));
  return {
    status: 200, title: "Insights", description: desc, path: "/insights", type: "website", body, modified: iso(mod),
    jsonLd: [
      { "@context": "https://schema.org", "@type": "CollectionPage", name: `Insights | ${c.site.name}`, description: desc, url: `${SITE}/insights`, isPartOf: { "@id": `${SITE}/#website` }, publisher: { "@id": ORG_ID },
        mainEntity: { "@type": "ItemList", itemListElement: posts.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}/insights/${p.slug}`, name: p.title })) } },
      breadcrumb([["Home", "/"], ["Insights", "/insights"]]),
    ],
  };
}

function postPage(c: Content, p: Doc, mod: number): Page {
  const path = `/insights/${p.slug}`;
  const text = String(p.body ?? "").replace(/[#*\-\[\]()]/g, " ");
  const published = `${p.date}T00:00:00.000Z`;
  const body = wrap(c, `<nav aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/insights">Insights</a></nav><article><h1>${esc(p.title)}</h1>` +
    `<p><time datetime="${esc(p.date)}">${esc(fmtDate(p.date))}</time> · ${esc(p.readMins)} min read</p>${renderMarkdown(String(p.body ?? ""))}</article>`);
  return {
    status: 200, title: p.title, description: clip(p.excerpt), path, type: "article", body, published, modified: iso(Math.max(mod, Date.parse(published))),
    jsonLd: [
      {
        "@context": "https://schema.org", "@type": "BlogPosting", "@id": `${SITE}${path}#article`, mainEntityOfPage: { "@type": "WebPage", "@id": SITE + path },
        headline: p.title, description: p.excerpt, url: SITE + path, image: abs(OG_IMAGE), inLanguage: "en",
        datePublished: published, dateModified: iso(Math.max(mod, Date.parse(published))), wordCount: text.split(/\s+/).filter(Boolean).length,
        author: { "@id": ORG_ID }, publisher: { "@id": ORG_ID },
      },
      breadcrumb([["Home", "/"], ["Insights", "/insights"], [p.title, path]]),
    ],
  };
}

function legalPage(c: Content, l: Doc, mod: number): Page {
  const body = wrap(c, `<article><h1>${esc(l.title)}</h1>${renderMarkdown(String(l.body ?? ""))}</article>`);
  return { status: 200, title: l.title, description: clip(`${l.title} for ${c.site.name}.`), path: `/${l.slug}`, type: "website", body, modified: iso(mod), jsonLd: [breadcrumb([["Home", "/"], [l.title, `/${l.slug}`]])] };
}

function notFound(c: Content): Page {
  return { status: 404, title: "Page not found", description: "The page you are looking for does not exist.", path: "/404", type: "website", noindex: true, jsonLd: [],
    body: wrap(c, `<h1>Page not found</h1><p>The page you are looking for does not exist.</p><p><a href="/">Back to home</a></p>`) };
}

export function resolvePage(pathname: string): Page {
  const { c, mod, latest } = snapshot();
  const p = pathname.replace(/\/+$/, "").replace(/^\//, "");
  if (p === "") return homePage(c, latest || Date.now());
  if (p === "insights") return insightsPage(c, Math.max(0, ...c.posts.map((x) => mod.get(`posts/${x.slug}`) ?? 0)) || latest);
  const legal = c.legal.find((l) => l.slug === p);
  if (legal) return legalPage(c, legal, mod.get(`legal/${legal.slug}`) ?? latest);
  const [a, b] = p.split("/");
  if (a === "services" && b && !p.includes("/", a.length + 1)) {
    const s = c.services.find((x) => x.slug === b);
    if (s) return servicePage(c, s, mod.get(`services/${s.slug}`) ?? latest);
  }
  if (a === "insights" && b && !p.includes("/", a.length + 1)) {
    const post = c.posts.find((x) => x.slug === b);
    if (post) return postPage(c, post, mod.get(`posts/${post.slug}`) ?? latest);
  }
  return notFound(c);
}

// ------------------------------------------------------------------ HTML assembly
function headTags(pg: Page, siteName: string): string {
  const title = fullTitle(pg.title, siteName);
  const url = SITE + (pg.path === "/" ? "/" : pg.path);
  const t = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(pg.description)}" />`,
    `<meta name="robots" content="${pg.noindex ? "noindex, follow" : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"}" />`,
    ...(pg.noindex ? [] : [`<link rel="canonical" href="${esc(url)}" />`]),
    `<meta property="og:site_name" content="${esc(siteName)}" />`,
    `<meta property="og:locale" content="en_IN" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(pg.description)}" />`,
    `<meta property="og:type" content="${pg.type}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${esc(abs(OG_IMAGE))}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${esc(siteName)}: cybersecurity consulting" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(pg.description)}" />`,
    `<meta name="twitter:image" content="${esc(abs(OG_IMAGE))}" />`,
  ];
  if (pg.type === "article" && pg.published) {
    t.push(`<meta property="article:published_time" content="${esc(pg.published)}" />`);
    if (pg.modified) t.push(`<meta property="article:modified_time" content="${esc(pg.modified)}" />`);
  }
  t.push(`<link rel="alternate" type="text/plain" href="/llms.txt" title="llms.txt" />`);
  for (const ld of pg.jsonLd) t.push(`<script type="application/ld+json" data-route-ld="${esc(pg.path)}">${jsonLdText(ld)}</script>`);
  return t.join("\n    ");
}

/** Removes the generic tags from the built index.html so the per-page ones replace them. */
function prepareTemplate(html: string): string {
  return html
    .replace(/<title>[\s\S]*?<\/title>\s*/i, "")
    .replace(/<meta\s+(?:name|property)="(?:description|robots|og:[^"]*|twitter:[^"]*)"[^>]*>\s*/gi, "")
    .replace(/<link\s+rel="canonical"[^>]*>\s*/gi, "");
}

let tpl: { file: string; mtime: number; html: string } | null = null;
function template(file: string): string {
  const m = fs.statSync(file).mtimeMs;
  if (tpl?.file === file && tpl.mtime === m) return tpl.html;
  tpl = { file, mtime: m, html: prepareTemplate(fs.readFileSync(file, "utf8")) };
  pageCache.clear();
  return tpl.html;
}

export function renderHtml(indexFile: string, pathname: string): { status: number; html: string; etag: string } {
  const html0 = template(indexFile);
  const { c } = snapshot();
  const key = pathname.replace(/\/+$/, "") || "/";
  const hit = pageCache.get(key);
  if (hit) return hit;
  const pg = resolvePage(pathname);
  const html = html0
    .replace(/<\/head>/i, `    ${headTags(pg, c.site.name)}
  </head>`)
    .replace(/<div id="root">\s*<\/div>/i, `<div id="root">${pg.body}</div>`);
  const out = { status: pg.status, html, etag: `"${crypto.createHash("sha1").update(html).digest("base64url").slice(0, 20)}"` };
  if (pageCache.size < 500) pageCache.set(key, out);
  return out;
}

// ------------------------------------------------------------------ sitemap, robots, llms.txt
const AI_BOTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User", "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot-Extended"];
const BLOCKED = ["/admin", "/api/admin/"];

function robotsTxt(): string {
  const rules = `Allow: /\n${BLOCKED.map((b) => `Disallow: ${b}`).join("\n")}\n`;
  return [
    `# DuRuVaSa CloudSec: public pages are open to search engines and AI assistants.`,
    `User-agent: *\n${rules}`,
    ...AI_BOTS.map((b) => `User-agent: ${b}\n${rules}`),
    `Sitemap: ${SITE}/sitemap.xml`,
    `# AI-readable summary: ${SITE}/llms.txt`,
    "",
  ].join("\n");
}

function sitemapXml(): string {
  const { c, mod, latest } = snapshot();
  const day = (ms: number) => iso(ms).slice(0, 10);
  const postMod = (p: Doc) => Math.max(mod.get(`posts/${p.slug}`) ?? 0, Date.parse(p.date) || 0);
  const urls: [string, number][] = [
    ["/", latest],
    ["/insights", Math.max(0, ...c.posts.map(postMod))],
    ...c.services.map((s): [string, number] => [`/services/${s.slug}`, mod.get(`services/${s.slug}`) ?? latest]),
    ...c.posts.map((p): [string, number] => [`/insights/${p.slug}`, postMod(p)]),
    ...c.legal.map((l): [string, number] => [`/${l.slug}`, mod.get(`legal/${l.slug}`) ?? latest]),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(([u, m]) => `  <url><loc>${SITE}${u === "/" ? "/" : u}</loc><lastmod>${day(m || latest)}</lastmod></url>`).join("\n") + `\n</urlset>\n`;
}

const plain = (md: string) => md.replace(/^#{2,3}\s+/gm, "").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");

function llmsTxt(full: boolean): string {
  const { c } = snapshot();
  const s = c.site;
  const L: string[] = [`# ${s.name}`, "", `> ${s.description}`, ""];
  L.push(`${s.name} is a cybersecurity consulting firm. ${c.about.intro ?? ""}`.trim(), "");
  L.push("## Services");
  for (const x of c.services) L.push(`- [${x.title}](${SITE}/services/${x.slug}): ${x.tagline}`);
  L.push("", "## Team");
  for (const t of c.team) L.push(`- ${t.name}, ${titleCase(t.role || "")}${t.linkedin ? ` (${t.linkedin})` : ""}`);
  L.push("", "## Insights");
  for (const p of c.posts) L.push(`- [${p.title}](${SITE}/insights/${p.slug}): ${p.excerpt}`);
  L.push("", "## Contact", `- Email: ${s.email}`);
  if (s.phone) L.push(`- Phone: ${s.phone}`);
  if (s.whatsapp) L.push(`- WhatsApp: ${s.whatsapp}`);
  L.push(`- Website: ${SITE}/`, "", "## Optional", ...c.legal.map((l) => `- [${l.title}](${SITE}/${l.slug})`), `- [Sitemap](${SITE}/sitemap.xml)`);
  if (full) {
    L.push("", "---", "", "# Full content", "");
    for (const x of c.services) {
      L.push(`## ${x.title}`, "", x.tagline, "", x.intro, "", "What it covers:", ...(x.covers ?? []).map((v: string) => `- ${v}`), "", "How it works:");
      (x.steps ?? []).forEach((st: Doc, i: number) => L.push(`${i + 1}. ${st.title}: ${st.text}`));
      L.push("", "Frequently asked questions:");
      for (const f of x.faqs ?? []) L.push("", `Q: ${f.q}`, `A: ${f.a}`);
      L.push("");
    }
    L.push("## About", "", c.about.intro ?? "", "", ...(c.about.paragraphs ?? []).flatMap((p: string) => [p, ""]));
    for (const t of c.team) L.push(`## ${t.name} (${titleCase(t.role || "")})`, "", t.bio, "");
    for (const p of c.posts) L.push(`## ${p.title}`, "", `Published ${p.date}. ${p.excerpt}`, "", plain(String(p.body ?? "")), "");
  }
  return L.join("\n") + "\n";
}

const send = (res: Response, type: string, body: string, maxAge = 3600) =>
  void res.set({ "Content-Type": `${type}; charset=utf-8`, "Cache-Control": `public, max-age=${maxAge}`, "X-Robots-Tag": "noindex" }).send(body);

/** Machine-readable files. Registered before the static files so the CMS-driven versions win over any build-time copies. */
export function seoFileRoutes(): Router {
  const r = makeRouter();
  r.get("/robots.txt", (_req, res) => void res.set({ "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" }).send(robotsTxt()));
  r.get("/sitemap.xml", (_req, res) => void res.set({ "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" }).send(sitemapXml()));
  r.get("/llms.txt", (_req, res) => send(res, "text/plain", llmsTxt(false)));
  r.get("/llms-full.txt", (_req, res) => send(res, "text/plain", llmsTxt(true)));
  return r;
}

/** Serves a page's HTML with the right status code (404 for unknown addresses) and conditional-request support. */
export function pageHandler(indexFile: string) {
  return (req: Request, res: Response) => {
    const { status, html, etag } = renderHtml(indexFile, req.path);
    res.status(status).set({ "Cache-Control": "no-cache", ETag: etag, "Content-Type": "text/html; charset=utf-8" });
    if (status === 404) res.set("X-Robots-Tag", "noindex");
    if (status === 200 && req.headers["if-none-match"] === etag) return void res.status(304).end();
    res.send(html);
  };
}
