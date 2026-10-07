// Search, answer-engine and AI-assistant visibility (SEO / AEO / GEO) and server-side rendering.
// Every public page is rendered on the server by the real React app (dist-ssr/entry-server.js) and then hydrated in the
// browser, in each of the nine languages. This module also builds per-page <head> tags with hreflang alternates, JSON-LD
// structured data, a 404 status for unknown addresses, and sitemap.xml / robots.txt / llms.txt from the live CMS content.
import crypto from "node:crypto";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { type Request, type Response, type Router, Router as makeRouter } from "express";
import { config } from "./config.js";
import { getBundle } from "./content.js";
import { all } from "./db.js";
import { localizedBundle } from "./i18n.js";
import { clip, fullTitle, homeFaqs, homeTitle } from "../shared/seo.js";
import { DEFAULT_LANG, LANGS, langInfo, prefixPath, splitLang, type Lang } from "../shared/langs.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Doc = Record<string, any>;
interface Content { site: Doc; hero: Doc; about: Doc; sections: Doc; services: Doc[]; offerings: Doc[]; advantages: Doc[]; attributes: Doc[]; posts: Doc[]; legal: Doc[]; partners: Doc[]; team: Doc[]; resources: Doc[] }
type Tr = (key: string, fallback: string, vars?: Record<string, string | number>) => string;

const SITE = config.siteUrl;
const LOGO = "/img/logo-t.webp";
const OG_IMAGE = "/og-image.jpg";
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const abs = (u: string) => (/^https?:\/\//.test(u) ? u : SITE + u);
const iso = (ms: number) => new Date(ms).toISOString();
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s&/-])([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase()).replace(/\b(Ceo|Cto|Ciso|Coo|Soc)\b/g, (m) => m.toUpperCase());
const BS = String.fromCharCode(92);
const jsonForHtml = (o: unknown) => JSON.stringify(o).replace(/</g, `${BS}u003c`).replace(new RegExp(String.fromCharCode(0x2028) + "|" + String.fromCharCode(0x2029), "g"), "");
const url = (path: string, lang: Lang) => SITE + (path === "/" && lang === DEFAULT_LANG ? "/" : prefixPath(path, lang));

// ------------------------------------------------------------------ content + modification dates (cached per bundle version)
interface Snapshot { lang: Lang; c: Content; tr: Tr; mod: Map<string, number>; latest: number }
const snaps = new Map<Lang, { etag: string; v: Snapshot }>();
const pageCache = new Map<string, { status: number; html: string; etag: string }>();
let cacheKey = "";

function interpolate(s: string, vars?: Record<string, string | number>) {
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

function snapshot(lang: Lang): Snapshot {
  const lb = localizedBundle(lang);
  const key = getBundle().etag;
  if (key !== cacheKey) { cacheKey = key; snaps.clear(); pageCache.clear(); }
  const hit = snaps.get(lang);
  if (hit?.etag === lb.etag) return hit.v;
  const raw = lb.obj;
  const c = { ...raw } as unknown as Content;
  for (const k of ["services", "offerings", "advantages", "attributes", "posts", "legal", "partners", "team", "resources"] as const) c[k] = (raw[k] ?? []) as Doc[];
  for (const k of ["site", "hero", "about", "sections"] as const) c[k] = (raw[k] ?? {}) as Doc;
  const ui = (raw.ui ?? {}) as Record<string, string>;
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
  const v: Snapshot = { lang, c, mod, latest, tr: (k, fb, vars) => interpolate(ui[k] ?? fb, vars) };
  snaps.set(lang, { etag: lb.etag, v });
  return v;
}

// ------------------------------------------------------------------ structured data
const ORG_ID = `${SITE}/#organization`;
const personId = (name: string) => `${SITE}/#person-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

function organization(c: Content, lang: Lang) {
  const s = c.site;
  return {
    "@type": ["Organization", "ProfessionalService"], "@id": ORG_ID,
    name: s.name, url: url("/", lang), description: s.description,
    logo: { "@type": "ImageObject", url: abs(LOGO), width: 512, height: 512 },
    image: abs(OG_IMAGE),
    ...(s.email && { email: s.email }),
    ...(s.phone && { telephone: s.phone }),
    sameAs: [s.linkedin].filter(Boolean),
    knowsAbout: [...c.services.map((x) => x.title), "Cloud security", "Cybersecurity consulting", "Zero trust", "Security operations (SOC)"],
    founder: c.team[0]?.name ? { "@id": personId(c.team[0].name) } : undefined,
    employee: c.team.map((t) => ({ "@id": personId(t.name) })),
    contactPoint: [{ "@type": "ContactPoint", contactType: "customer support", ...(s.email && { email: s.email }), ...(s.phone && { telephone: s.phone }) }],
    availableLanguage: LANGS.map((l) => l.name),
    hasOfferCatalog: {
      "@type": "OfferCatalog", name: "Cybersecurity services",
      itemListElement: c.services.map((x) => ({ "@type": "Offer", itemOffered: { "@type": "Service", name: x.title, description: x.tagline, url: url(`/services/${x.slug}`, lang) } })),
    },
  };
}

function people(c: Content) {
  return c.team.filter((t) => t.name).map((t) => ({
    "@type": "Person", "@id": personId(t.name), name: t.name, jobTitle: /[A-Za-z]/.test(t.role || "") ? titleCase(t.role || "") : t.role,
    description: t.bio, ...(t.photo && { image: abs(t.photo) }),
    ...(t.linkedin && { sameAs: [t.linkedin] }), worksFor: { "@id": ORG_ID },
    ...(t.skills?.length && { knowsAbout: t.skills }),
    ...(t.certs?.length && { hasCredential: t.certs.map((x: Doc) => ({ "@type": "EducationalOccupationalCredential", credentialCategory: "certification", name: `${x.vendor} certification` })) }),
  }));
}

const breadcrumb = (items: [string, string][], lang: Lang) => ({
  "@context": "https://schema.org", "@type": "BreadcrumbList",
  itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: url(path, lang) })),
});

const speakable = (...cssSelector: string[]) => ({ "@type": "SpeakableSpecification", cssSelector });

const faqLd = (faqs: { q: string; a: string }[], lang: Lang) => ({
  "@context": "https://schema.org", "@type": "FAQPage", inLanguage: langInfo(lang).intl,
  mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
});

// ------------------------------------------------------------------ pages
interface Page {
  status: number; lang: Lang; title: string; description: string; path: string; type: "website" | "article"; noindex?: boolean;
  jsonLd: object[]; published?: string; modified?: string;
}

function homePage(s: Snapshot): Page {
  const { c, lang, tr } = s;
  const title = tr("home.title", homeTitle(c.site.name), { name: c.site.name });
  const desc = clip(c.site.description);
  const faqs = homeFaqs(c.services);
  return {
    status: 200, lang, title, description: desc, path: "/", type: "website", modified: iso(s.latest || Date.now()),
    jsonLd: [{
      "@context": "https://schema.org",
      "@graph": [
        organization(c, lang),
        ...people(c),
        { "@type": "WebSite", "@id": `${SITE}/#website`, url: `${SITE}/`, name: c.site.name, description: c.site.description, inLanguage: LANGS.map((l) => l.intl), publisher: { "@id": ORG_ID } },
        { "@type": "WebPage", "@id": `${url("/", lang)}#webpage`, url: url("/", lang), name: title, description: desc, isPartOf: { "@id": `${SITE}/#website` }, about: { "@id": ORG_ID }, primaryImageOfPage: { "@type": "ImageObject", url: abs(OG_IMAGE) }, dateModified: iso(s.latest || Date.now()), inLanguage: langInfo(lang).intl, speakable: speakable("h1", ".hero-card p") },
      ],
    }, ...(faqs.length ? [faqLd(faqs, lang)] : [])],
  };
}

function servicePage(s: Snapshot, svc: Doc, mod: number): Page {
  const { lang, tr } = s;
  const path = `/services/${svc.slug}`;
  return {
    status: 200, lang, title: svc.title, description: clip(svc.intro), path, type: "website", modified: iso(mod),
    jsonLd: [
      { "@context": "https://schema.org", "@type": "Service", "@id": `${url(path, lang)}#service`, name: svc.title, serviceType: svc.title, description: svc.intro, slogan: svc.tagline, url: url(path, lang), inLanguage: langInfo(lang).intl, provider: { "@id": ORG_ID } },
      { "@context": "https://schema.org", "@type": "WebPage", "@id": `${url(path, lang)}#webpage`, url: url(path, lang), name: svc.title, description: clip(svc.intro), inLanguage: langInfo(lang).intl, isPartOf: { "@id": `${SITE}/#website` }, about: { "@id": `${url(path, lang)}#service` }, speakable: speakable("h1", ".lede", ".page.service header > p:not(.lede):not(.mail-note):not(.eyebrow)") },
      ...(svc.faqs?.length ? [faqLd(svc.faqs, lang)] : []),
      breadcrumb([[tr("nav.home", "Home"), "/"], [tr("foot.services", "Services"), "/#services-list"], [svc.title, path]], lang),
    ],
  };
}

function insightsPage(s: Snapshot, mod: number): Page {
  const { c, lang, tr } = s;
  const desc = tr("ins.desc", "Practical articles on cloud security, threat detection and compliance from the DuRuVaSa CloudSec team.");
  const name = tr("hdr.insights", "Insights");
  const posts = [...c.posts].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return {
    status: 200, lang, title: name, description: desc, path: "/insights", type: "website", modified: iso(mod),
    jsonLd: [
      { "@context": "https://schema.org", "@type": "CollectionPage", name: `${name} | ${c.site.name}`, description: desc, url: url("/insights", lang), inLanguage: langInfo(lang).intl, isPartOf: { "@id": `${SITE}/#website` }, publisher: { "@id": ORG_ID },
        mainEntity: { "@type": "ItemList", itemListElement: posts.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: url(`/insights/${p.slug}`, lang), name: p.title })) } },
      breadcrumb([[tr("nav.home", "Home"), "/"], [name, "/insights"]], lang),
    ],
  };
}

function postPage(s: Snapshot, p: Doc, mod: number): Page {
  const { lang, tr } = s;
  const path = `/insights/${p.slug}`;
  const text = String(p.body ?? "").replace(/[#*\-\[\]()]/g, " ");
  const published = `${p.date}T00:00:00.000Z`;
  const modified = iso(Math.max(mod, Date.parse(published)));
  return {
    status: 200, lang, title: p.title, description: clip(p.excerpt), path, type: "article", published, modified,
    jsonLd: [
      {
        "@context": "https://schema.org", "@type": "BlogPosting", "@id": `${url(path, lang)}#article`, mainEntityOfPage: { "@type": "WebPage", "@id": url(path, lang) },
        headline: p.title, description: p.excerpt, url: url(path, lang), image: abs(OG_IMAGE), inLanguage: langInfo(lang).intl,
        datePublished: published, dateModified: modified, wordCount: text.split(/\s+/).filter(Boolean).length,
        author: { "@id": ORG_ID }, publisher: { "@id": ORG_ID }, speakable: speakable("h1", ".prose p:first-of-type"),
      },
      breadcrumb([[tr("nav.home", "Home"), "/"], [tr("hdr.insights", "Insights"), "/insights"], [p.title, path]], lang),
    ],
  };
}

function legalPage(s: Snapshot, l: Doc, mod: number): Page {
  const { c, lang, tr } = s;
  return { status: 200, lang, title: l.title, description: clip(`${l.title} | ${c.site.name}`), path: `/${l.slug}`, type: "website", modified: iso(mod), jsonLd: [breadcrumb([[tr("nav.home", "Home"), "/"], [l.title, `/${l.slug}`]], lang)] };
}

function notFound(s: Snapshot): Page {
  const { lang, tr } = s;
  return { status: 404, lang, title: tr("nf.h", "Page not found"), description: tr("nf.p", "The page you are looking for does not exist."), path: "/404", type: "website", noindex: true, jsonLd: [] };
}

export function resolvePage(pathname: string): Page {
  const { lang, rest } = splitLang(pathname);
  const s = snapshot(lang);
  const { c, mod, latest } = s;
  const p = rest.replace(/\/+$/, "").replace(/^\//, "");
  if (p === "") return homePage(s);
  if (p === "insights") return insightsPage(s, Math.max(0, ...c.posts.map((x) => mod.get(`posts/${x.slug}`) ?? 0)) || latest);
  const legal = c.legal.find((l) => l.slug === p);
  if (legal) return legalPage(s, legal, mod.get(`legal/${legal.slug}`) ?? latest);
  const [a, b] = p.split("/");
  if (a === "services" && b && !p.includes("/", a.length + 1)) {
    const svc = c.services.find((x) => x.slug === b);
    if (svc) return servicePage(s, svc, mod.get(`services/${svc.slug}`) ?? latest);
  }
  if (a === "insights" && b && !p.includes("/", a.length + 1)) {
    const post = c.posts.find((x) => x.slug === b);
    if (post) return postPage(s, post, mod.get(`posts/${post.slug}`) ?? latest);
  }
  return notFound(s);
}

// ------------------------------------------------------------------ HTML assembly
function headTags(pg: Page, siteName: string): string {
  const lang = pg.lang;
  const title = fullTitle(pg.title, siteName);
  const here = url(pg.path === "/404" ? "/" : pg.path, lang);
  const t = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(pg.description)}" />`,
    `<meta name="robots" content="${pg.noindex ? "noindex, follow" : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"}" />`,
  ];
  if (!pg.noindex) {
    t.push(`<link rel="canonical" href="${esc(here)}" />`);
    for (const l of LANGS) t.push(`<link rel="alternate" hreflang="${l.code}" href="${esc(url(pg.path, l.code))}" />`);
    t.push(`<link rel="alternate" hreflang="x-default" href="${esc(url(pg.path, DEFAULT_LANG))}" />`);
  }
  t.push(
    `<meta property="og:site_name" content="${esc(siteName)}" />`,
    `<meta property="og:locale" content="${langInfo(lang).locale}" />`,
    ...LANGS.filter((l) => l.code !== lang).map((l) => `<meta property="og:locale:alternate" content="${l.locale}" />`),
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(pg.description)}" />`,
    `<meta property="og:type" content="${pg.type}" />`,
    `<meta property="og:url" content="${esc(here)}" />`,
    `<meta property="og:image" content="${esc(abs(OG_IMAGE))}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${esc(siteName)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(pg.description)}" />`,
    `<meta name="twitter:image" content="${esc(abs(OG_IMAGE))}" />`,
  );
  if (pg.type === "article" && pg.published) {
    t.push(`<meta property="article:published_time" content="${esc(pg.published)}" />`);
    if (pg.modified) t.push(`<meta property="article:modified_time" content="${esc(pg.modified)}" />`);
  }
  t.push(`<link rel="alternate" type="text/plain" href="/llms.txt" title="llms.txt" />`);
  for (const ld of pg.jsonLd) t.push(`<script type="application/ld+json" data-route-ld="${esc(pg.path)}">${jsonForHtml(ld)}</script>`);
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

type RenderFn = (url: string, bundle: unknown, lang: Lang) => string;
let ssr: RenderFn | null | undefined;
async function loadSsr(): Promise<RenderFn | null> {
  if (ssr !== undefined) return ssr;
  try {
    ssr = ((await import(pathToFileURL(config.ssrBundle).href)) as { render: RenderFn }).render;
  } catch (e) {
    console.warn(`ssr: server bundle not available (${(e as Error).message}); pages will render in the browser only`);
    ssr = null;
  }
  return ssr;
}

export async function renderHtml(indexFile: string, pathname: string): Promise<{ status: number; html: string; etag: string; lang: Lang }> {
  const html0 = template(indexFile);
  const { lang } = splitLang(pathname);
  const key = pathname.replace(/\/+$/, "") || "/";
  const pg = resolvePage(pathname); // also refreshes the caches when the CMS content changed
  const hit = pageCache.get(key);
  if (hit) return { ...hit, lang };
  const render = await loadSsr();
  const { c } = snapshot(lang);
  const lb = localizedBundle(lang);
  let body = "";
  let data = "";
  if (render) {
    try {
      body = render(key, lb.obj, lang);
      data = `<script type="application/json" id="__DATA__">${jsonForHtml({ etag: lb.etag, content: lb.obj })}</script>`;
    } catch (e) {
      console.error(`ssr: rendering ${pathname} failed, serving the client-rendered shell:`, e);
      body = "";
      data = "";
    }
  }
  const html = html0
    .replace(/<html lang="[^"]*"/i, `<html lang="${lang}" dir="ltr"`)
    .replace(/<\/head>/i, () => `    ${headTags(pg, c.site.name)}\n  </head>`)
    .replace(/<div id="root">\s*<\/div>/i, () => `<div id="root">${body}</div>${data}`);
  const out = { status: pg.status, html, etag: `"${crypto.createHash("sha1").update(html).digest("base64url").slice(0, 20)}"` };
  if (pageCache.size < 800) pageCache.set(key, out);
  return { ...out, lang };
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
  const s = snapshot(DEFAULT_LANG);
  const { c, mod, latest } = s;
  const day = (ms: number) => iso(ms).slice(0, 10);
  const postMod = (p: Doc) => Math.max(mod.get(`posts/${p.slug}`) ?? 0, Date.parse(p.date) || 0);
  const pages: [string, number][] = [
    ["/", latest],
    ["/insights", Math.max(0, ...c.posts.map(postMod))],
    ...c.services.map((x): [string, number] => [`/services/${x.slug}`, mod.get(`services/${x.slug}`) ?? latest]),
    ...c.posts.map((p): [string, number] => [`/insights/${p.slug}`, postMod(p)]),
    ...c.legal.map((l): [string, number] => [`/${l.slug}`, mod.get(`legal/${l.slug}`) ?? latest]),
  ];
  // One <url> per language version, each listing all of its alternates (the form Google documents for hreflang).
  const alternates = (path: string) =>
    [...LANGS.map((l) => `<xhtml:link rel="alternate" hreflang="${l.code}" href="${url(path, l.code)}"/>`), `<xhtml:link rel="alternate" hreflang="x-default" href="${url(path, DEFAULT_LANG)}"/>`].join("");
  const entries = pages.flatMap(([path, m]) => LANGS.map((l) => `  <url><loc>${url(path, l.code)}</loc><lastmod>${day(m || latest)}</lastmod>${alternates(path)}</url>`));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries.join("\n")}\n</urlset>\n`;
}

const plain = (md: string) => md.replace(/^#{2,3}\s+/gm, "").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");

function llmsTxt(full: boolean): string {
  const { c } = snapshot(DEFAULT_LANG);
  const s = c.site;
  const L: string[] = [`# ${s.name}`, "", `> ${s.description}`, ""];
  L.push(`${s.name} is a cybersecurity consulting firm. ${c.about.intro ?? ""}`.trim(), "");
  L.push("## Services");
  for (const x of c.services) L.push(`- [${x.title}](${url(`/services/${x.slug}`, DEFAULT_LANG)}): ${x.tagline}`);
  L.push("", "## Team");
  for (const t of c.team) L.push(`- ${t.name}, ${titleCase(t.role || "")}${t.linkedin ? ` (${t.linkedin})` : ""}`);
  L.push("", "## Insights");
  for (const p of c.posts) L.push(`- [${p.title}](${url(`/insights/${p.slug}`, DEFAULT_LANG)}): ${p.excerpt}`);
  L.push("", "## Contact", `- Email: ${s.email}`);
  if (s.phone) L.push(`- Phone: ${s.phone}`);
  if (s.whatsapp) L.push(`- WhatsApp: ${s.whatsapp}`);
  L.push(`- Website: ${SITE}/`);
  L.push("", "## Languages", `The whole site is available in ${LANGS.length} languages:`, ...LANGS.map((l) => `- [${l.name}](${url("/", l.code)})`));
  L.push("", "## Optional", ...c.legal.map((l) => `- [${l.title}](${url(`/${l.slug}`, DEFAULT_LANG)})`), `- [Sitemap](${SITE}/sitemap.xml)`);
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
  r.get("/.well-known/security.txt", (_req, res) => {
    const { c } = snapshot(DEFAULT_LANG);
    const expires = new Date(Date.now() + 300 * 86400_000).toISOString();
    send(res, "text/plain", `Contact: mailto:${c.site.email}\nExpires: ${expires}\nPreferred-Languages: en, hi\nCanonical: ${SITE}/.well-known/security.txt\n`, 86400);
  });
  return r;
}

/** Serves a page's HTML with the right status code (404 for unknown addresses) and conditional-request support. */
export function pageHandler(indexFile: string) {
  return async (req: Request, res: Response, next: (e?: unknown) => void) => {
    try {
      const { status, html, etag, lang } = await renderHtml(indexFile, req.path);
      res.status(status).set({ "Cache-Control": "no-cache", ETag: etag, "Content-Type": "text/html; charset=utf-8", "Content-Language": lang });
      if (status === 404) res.set("X-Robots-Tag", "noindex");
      if (status === 200 && req.headers["if-none-match"] === etag) return void res.status(304).end();
      res.send(html);
    } catch (e) { next(e); }
  };
}
