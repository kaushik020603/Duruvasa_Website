import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Config reads env at import time, so point it at a throwaway data dir first.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "duruvasa-test-"));
process.env.DATA_DIR = dataDir;
process.env.ADMIN_EMAIL = "rajesh@duruvasa.com";
process.env.PUBLIC_URL = "http://localhost:5173";

let base = "";
let server: Server;
let setupToken = "";

class Client {
  cookie = "";
  csrf = "";
  async req(method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
    const h: Record<string, string> = { ...headers };
    if (this.cookie) h.cookie = this.cookie;
    if (this.csrf && method !== "GET") h["x-csrf-token"] = this.csrf;
    let payload: BodyInit | undefined;
    if (body !== undefined) {
      if (Buffer.isBuffer(body)) payload = new Uint8Array(body);
      else { payload = JSON.stringify(body); h["content-type"] = h["content-type"] ?? "application/json"; }
    }
    const res = await fetch(base + url, { method, headers: h, body: payload, redirect: "manual" });
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0];
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json, text, headers: res.headers };
  }
}

const GOOD_PW = "Correct-Horse-Battery-9!";

beforeAll(async () => {
  const { seedIfEmpty } = await import("./content.js");
  const { bootstrapAdmin, issueSetupToken } = await import("./auth.js");
  const { createApp } = await import("./app.js");
  const { get } = await import("./db.js");
  seedIfEmpty();
  bootstrapAdmin();
  const u = get<{ id: number }>("SELECT id FROM users WHERE email = 'rajesh@duruvasa.com'")!;
  setupToken = issueSetupToken(u.id, 1);
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.close();
  const { db } = await import("./db.js");
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("public API", () => {
  it("serves the seeded content bundle with ETag support", async () => {
    const c = new Client();
    const r = await c.req("GET", "/api/content");
    expect(r.status).toBe(200);
    expect(r.json.partners).toHaveLength(6);
    expect(r.json.partners[0].url).toMatch(/^https:/);
    expect(r.json.team.length).toBe(3);
    expect(r.json.site.email).toBe("info@duruvasa.com");
    expect(r.json.legal.length).toBe(3);
    const etag = r.headers.get("etag")!;
    const again = await fetch(base + "/api/content", { headers: { "if-none-match": etag } });
    expect(again.status).toBe(304);
  });

  it("sends strict security headers", async () => {
    const r = await fetch(base + "/api/health");
    expect(r.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("x-frame-options")).toBe("DENY");
  });

  it("stores a valid enquiry and rejects an invalid one", async () => {
    const c = new Client();
    const bad = await c.req("POST", "/api/enquiries", { first: "", last: "X", email: "nope", message: "hi" });
    expect(bad.status).toBe(422);
    expect(bad.json.errors.email).toBeTruthy();
    const ok = await c.req("POST", "/api/enquiries", { type: "consultation", first: "Asha", last: "Rao", email: "asha@example.com", phone: "+91 98765 43210", message: "We need a cloud security review.", preferredTime: "Tue 7 Oct at 14:00", elapsed: 9000 });
    expect(ok.status).toBe(201);
  });

  it("silently drops honeypot and instant submissions", async () => {
    const c = new Client();
    const r1 = await c.req("POST", "/api/enquiries", { first: "Bot", last: "Bot", email: "bot@example.com", message: "buy now", website: "http://spam" });
    const r2 = await c.req("POST", "/api/enquiries", { first: "Fast", last: "Bot", email: "fast@example.com", message: "too quick", elapsed: 50 });
    expect(r1.json.ok).toBe(true);
    expect(r2.json.ok).toBe(true);
  });

  it("gates the PDF behind an email and a one-time token", async () => {
    const c = new Client();
    const noConsent = await c.req("POST", "/api/subscribe", { email: "lead@example.com", resource: "cloud-security-checklist" });
    expect(noConsent.status).toBe(422);
    const sub = await c.req("POST", "/api/subscribe", { email: "Lead@Example.com", name: "Lee", resource: "cloud-security-checklist", consent: true });
    expect(sub.status).toBe(201);
    const pdf = await fetch(base + sub.json.downloadUrl);
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    expect((await pdf.arrayBuffer()).byteLength).toBeGreaterThan(5000);
    const forged = await fetch(base + "/api/resources/cloud-security-checklist/download?token=forged");
    expect(forged.status).toBe(403);
    const noToken = await fetch(base + "/api/resources/cloud-security-checklist/download");
    expect(noToken.status).toBe(403);
  });
});

describe("SEO, AEO and GEO", () => {
  const page = async (p: string) => { const r = await fetch(base + p, { redirect: "manual" }); return { r, html: await r.text() }; };
  const ld = (html: string) => [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

  it("renders per-page head tags and a crawlable body without JavaScript", async () => {
    const { r, html } = await page("/services/threat-detection");
    expect(r.status).toBe(200);
    expect(html).toContain("<title>Threat Detection | DuRuVaSa CloudSec</title>");
    expect(html).toContain('<link rel="canonical" href="https://www.duruvasa.com/services/threat-detection" />');
    expect(html).toContain('<meta name="twitter:title"');
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html.match(/name="description"/g)).toHaveLength(1);
    expect(html).toMatch(/<div id="root"><div class="ssr">[\s\S]*<h1>Threat Detection<\/h1>/);
    const types = ld(html).map((x) => x["@type"]);
    expect(types).toEqual(["Service", "FAQPage", "BreadcrumbList"]);
  });

  it("describes the organisation, team and site on the home page", async () => {
    const { html } = await page("/");
    expect(html).toContain("<h1>Protecting Your Digital Future Today</h1>");
    const graph = ld(html)[0]["@graph"] as { "@type": string | string[] }[];
    const kinds = graph.map((n) => (Array.isArray(n["@type"]) ? n["@type"][0] : n["@type"]));
    expect(kinds).toEqual(expect.arrayContaining(["Organization", "Person", "WebSite", "WebPage"]));
    expect(kinds.filter((k) => k === "Person")).toHaveLength(3);
  });

  it("marks articles up as BlogPosting and keeps JSON-LD safe inside the page", async () => {
    const { html } = await page("/insights/how-ai-improves-threat-detection");
    const post = ld(html)[0];
    expect(post["@type"]).toBe("BlogPosting");
    expect(post.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(html).toContain('property="article:published_time"');
  });

  it("answers unknown addresses with a real 404 and noindex, and canonicalises slashes", async () => {
    const nf = await page("/no-such-page");
    expect(nf.r.status).toBe(404);
    expect(nf.r.headers.get("x-robots-tag")).toContain("noindex");
    expect(nf.html).toContain('content="noindex, follow"');
    const slash = await fetch(base + "/insights/", { redirect: "manual" });
    expect(slash.status).toBe(301);
    expect(slash.headers.get("location")).toBe("/insights");
    expect((await fetch(base + "/index.html", { redirect: "manual" })).status).toBe(301);
  });

  it("publishes sitemap.xml, robots.txt and llms.txt from the live content", async () => {
    const sm = await (await fetch(base + "/sitemap.xml")).text();
    expect(sm).toContain("<loc>https://www.duruvasa.com/services/compliance-management</loc>");
    expect(sm).not.toContain("/admin");
    const robots = await (await fetch(base + "/robots.txt")).text();
    expect(robots).toContain("Disallow: /admin");
    expect(robots).toContain("User-agent: GPTBot");
    expect(robots).toContain("Sitemap: https://www.duruvasa.com/sitemap.xml");
    const llms = await (await fetch(base + "/llms.txt")).text();
    expect(llms).toMatch(/^# DuRuVaSa CloudSec/);
    expect(llms).toContain("info@duruvasa.com");
    expect(llms).toContain("Founder & CEO");
    expect((await (await fetch(base + "/llms-full.txt")).text()).length).toBeGreaterThan(llms.length * 3);
  });

  it("keeps the admin and API out of search results", async () => {
    expect((await fetch(base + "/admin/")).headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect((await fetch(base + "/api/content")).headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("reflects CMS edits in the rendered page and sitemap", async () => {
    const { all } = await import("./db.js");
    const { invalidateBundle } = await import("./content.js");
    const { run } = await import("./db.js");
    const row = all<{ value: string }>("SELECT value FROM settings WHERE key = 'hero'")[0];
    const hero = JSON.parse(row.value);
    run("UPDATE settings SET value = ? WHERE key = 'hero'", JSON.stringify({ ...hero, lineA: "Defending Your" }));
    invalidateBundle();
    expect((await page("/")).html).toContain("<h1>Defending Your ");
    run("UPDATE settings SET value = ? WHERE key = 'hero'", row.value);
    invalidateBundle();
  });
});

describe("admin API", () => {
  const admin = new Client();

  it("rejects unauthenticated access", async () => {
    expect((await new Client().req("GET", "/api/admin/content/hero")).status).toBe(401);
    expect((await new Client().req("GET", "/api/admin/enquiries")).status).toBe(401);
  });

  it("enforces the password policy and a valid setup token", async () => {
    const c = new Client();
    const email = "rajesh@duruvasa.com";
    expect((await c.req("POST", "/api/admin/auth/setup", { email, token: "wrong", password: GOOD_PW })).status).toBe(400);
    const weak = await c.req("POST", "/api/admin/auth/setup", { email, token: setupToken, password: "short" });
    expect(weak.status).toBe(400);
    expect(weak.json.error).toMatch(/12/);
    const ok = await admin.req("POST", "/api/admin/auth/setup", { email, token: setupToken, password: GOOD_PW, name: "Rajesh" });
    expect(ok.status).toBe(200);
    admin.csrf = ok.json.csrf;
    expect(ok.json.user.role).toBe("admin");
    // token is single use
    expect((await new Client().req("POST", "/api/admin/auth/setup", { email, token: setupToken, password: GOOD_PW })).status).toBe(400);
  });

  it("sets an HttpOnly SameSite=Strict session cookie", async () => {
    const r = await fetch(base + "/api/admin/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "rajesh@duruvasa.com", password: GOOD_PW }) });
    const cookie = r.headers.get("set-cookie") ?? "";
    expect(r.status).toBe(200);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
  });

  it("requires the CSRF token for changes", async () => {
    const noToken = new Client();
    noToken.cookie = admin.cookie;
    const r = await noToken.req("PUT", "/api/admin/content/hero", { data: {} });
    expect(r.status).toBe(403);
    const crossOrigin = await admin.req("PUT", "/api/admin/content/hero", { data: {} }, { origin: "https://evil.example" });
    expect(crossOrigin.status).toBe(403);
  });

  it("edits a singleton and the change reaches the public bundle", async () => {
    const cur = await admin.req("GET", "/api/admin/content/hero");
    const data = { ...cur.json.data, lineA: "Defending Your" };
    const r = await admin.req("PUT", "/api/admin/content/hero", { data });
    expect(r.status).toBe(200);
    expect((await new Client().req("GET", "/api/content")).json.hero.lineA).toBe("Defending Your");
  });

  it("validates fields and blocks unsafe links", async () => {
    const r = await admin.req("POST", "/api/admin/content/partners", { data: { name: "Evil", src: "/img/x.webp", url: "javascript:alert(1)", color: "red", tagline: "" } });
    expect(r.status).toBe(422);
    expect(r.json.errors.url).toBeTruthy();
    expect(r.json.errors.color).toBeTruthy();
  });

  it("supports full CRUD, duplicate, reorder and draft visibility on a collection", async () => {
    const created = await admin.req("POST", "/api/admin/content/partners", { data: { name: "Acme Security", src: "/img/p-dc.webp", url: "https://acme.example", color: "#112233", tagline: "Testing" } });
    expect(created.status).toBe(201);
    const id = created.json.item.id;
    let pub = (await new Client().req("GET", "/api/content")).json.partners;
    expect(pub.map((p: any) => p.name)).toContain("Acme Security");

    const upd = await admin.req("PUT", `/api/admin/content/partners/${id}`, { data: { ...created.json.item.data, name: "Acme Cyber" }, published: false });
    expect(upd.status).toBe(200);
    pub = (await new Client().req("GET", "/api/content")).json.partners;
    expect(pub.map((p: any) => p.name)).not.toContain("Acme Cyber"); // draft hidden

    const dup = await admin.req("POST", `/api/admin/content/partners/${id}/duplicate`);
    expect(dup.status).toBe(201);
    expect(dup.json.item.data.name).toContain("(copy)");

    const list = (await admin.req("GET", "/api/admin/content/partners")).json.items;
    const ids = list.map((i: any) => i.id).reverse();
    expect((await admin.req("POST", "/api/admin/content/partners/reorder", { ids })).status).toBe(200);
    expect((await admin.req("GET", "/api/admin/content/partners")).json.items[0].id).toBe(ids[0]);

    expect((await admin.req("DELETE", `/api/admin/content/partners/${id}`)).status).toBe(200);
    expect((await admin.req("DELETE", `/api/admin/content/partners/${dup.json.item.id}`)).status).toBe(200);
  });

  it("rejects duplicate slugs", async () => {
    const svc = (await admin.req("GET", "/api/admin/content/services")).json.items[0];
    const r = await admin.req("POST", "/api/admin/content/services", { data: { ...svc.data } });
    expect(r.status).toBe(422);
  });

  it("lists, filters, updates and exports enquiries", async () => {
    const list = await admin.req("GET", "/api/admin/enquiries?type=consultation");
    expect(list.json.total).toBe(1);
    expect(list.json.items[0].first).toBe("Asha");
    const id = list.json.items[0].id;
    const upd = await admin.req("PATCH", `/api/admin/enquiries/${id}`, { status: "in_progress", notes: "Called back" });
    expect(upd.json.item.status).toBe("in_progress");
    expect((await admin.req("PATCH", `/api/admin/enquiries/${id}`, { status: "bogus" })).status).toBe(422);
    const csv = await admin.req("GET", "/api/admin/enquiries/export.csv");
    expect(csv.text).toContain("asha@example.com");
    expect((await admin.req("GET", "/api/admin/enquiries?q=cloud%20security")).json.total).toBe(1);
  });

  it("lists subscribers (the mailing list)", async () => {
    const r = await admin.req("GET", "/api/admin/subscribers");
    expect(r.json.total).toBe(1);
    expect(r.json.items[0].email).toBe("lead@example.com");
  });

  it("uploads only real images and replaces the PDF only with a real PDF", async () => {
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
    const up = await admin.req("POST", "/api/admin/media?name=pixel.png", png, { "content-type": "image/png" });
    expect(up.status).toBe(201);
    expect(up.json.item.path).toMatch(/^\/uploads\/.+\.png$/);
    const served = await fetch(base + up.json.item.path);
    expect(served.status).toBe(200);
    expect(served.headers.get("x-content-type-options")).toBe("nosniff");
    const fake = await admin.req("POST", "/api/admin/media?name=evil.png", Buffer.from("<svg onload=alert(1)>"), { "content-type": "image/png" });
    expect(fake.status).toBe(415);
    const badPdf = await admin.req("POST", "/api/admin/resources/cloud-security-checklist/file", Buffer.from("not a pdf at all"), { "content-type": "application/pdf" });
    expect(badPdf.status).toBe(415);
  });

  it("manages users: create, setup link, protect the last admin", async () => {
    const created = await admin.req("POST", "/api/admin/users", { email: "editor@duruvasa.com", name: "Ed", role: "editor" });
    expect(created.status).toBe(201);
    expect(created.json.setupLink).toContain("#/setup?");
    const selfId = (await admin.req("GET", "/api/admin/users")).json.items.find((u: any) => u.email === "rajesh@duruvasa.com").id;
    expect((await admin.req("PATCH", `/api/admin/users/${selfId}`, { active: false })).status).toBe(400);
    expect((await admin.req("DELETE", `/api/admin/users/${selfId}`)).status).toBe(400);

    // an editor can edit content but cannot manage users or delete enquiries
    const token = new URL(created.json.setupLink.replace("#", "")).searchParams.get("token")!;
    const ed = new Client();
    const s = await ed.req("POST", "/api/admin/auth/setup", { email: "editor@duruvasa.com", token, password: "Another-Strong-Pass-7#" });
    ed.csrf = s.json.csrf;
    expect((await ed.req("GET", "/api/admin/users")).status).toBe(403);
    expect((await ed.req("DELETE", "/api/admin/enquiries/1")).status).toBe(403);
    expect((await ed.req("GET", "/api/admin/enquiries")).status).toBe(200);
  });

  it("supports TOTP two-factor sign-in", async () => {
    const { totpAt } = await import("./security.js");
    const begin = await admin.req("POST", "/api/admin/auth/2fa/begin");
    expect(begin.json.uri).toContain("otpauth://totp/");
    expect((await admin.req("POST", "/api/admin/auth/2fa/enable", { code: "000000" })).status).toBe(400);
    expect((await admin.req("POST", "/api/admin/auth/2fa/enable", { code: totpAt(begin.json.secret, Date.now()) })).status).toBe(200);

    const c = new Client();
    const step1 = await c.req("POST", "/api/admin/auth/login", { email: "rajesh@duruvasa.com", password: GOOD_PW });
    expect(step1.json.needs2fa).toBe(true);
    expect(c.cookie).toBe(""); // no session until the code is verified
    const wrong = await c.req("POST", "/api/admin/auth/login", { email: "rajesh@duruvasa.com", password: GOOD_PW, code: "123456" });
    expect(wrong.status).toBe(401);
    const good = await c.req("POST", "/api/admin/auth/login", { email: "rajesh@duruvasa.com", password: GOOD_PW, code: totpAt(begin.json.secret, Date.now()) });
    expect(good.status).toBe(200);
  });

  it("changes a password from the sign-in page using the old password", async () => {
    const email = "editor@duruvasa.com", oldPw = "Another-Strong-Pass-7#", newPw = "Brand-New-Reset-Pass-8$";
    const c = new Client();
    const live = new Client();
    const sessionBefore = await live.req("POST", "/api/admin/auth/login", { email, password: oldPw });
    expect(sessionBefore.status).toBe(200);

    // wrong old password: generic error, nothing changes
    const bad = await c.req("POST", "/api/admin/auth/change-password", { email, current: "not-the-password-1A!", next: newPw });
    expect(bad.status).toBe(401);
    expect(bad.json.error).toBe("Incorrect email, password or code.");
    // unknown account: identical answer
    const ghost = await c.req("POST", "/api/admin/auth/change-password", { email: "ghost@example.com", current: oldPw, next: newPw });
    expect(ghost.status).toBe(401);
    expect(ghost.json.error).toBe(bad.json.error);
    // right old password but a weak or unchanged new one
    expect((await c.req("POST", "/api/admin/auth/change-password", { email, current: oldPw, next: "short" })).status).toBe(400);
    expect((await c.req("POST", "/api/admin/auth/change-password", { email, current: oldPw, next: oldPw })).status).toBe(400);

    const ok = await c.req("POST", "/api/admin/auth/change-password", { email, current: oldPw, next: newPw });
    expect(ok.status).toBe(200);
    expect((await new Client().req("POST", "/api/admin/auth/login", { email, password: oldPw })).status).toBe(401);
    expect((await new Client().req("POST", "/api/admin/auth/login", { email, password: newPw })).status).toBe(200);
    // the older session was ended
    expect((await live.req("GET", "/api/admin/auth/me")).status).toBe(401);
  });

  it("requires the 2FA code too when changing a password for a 2FA account", async () => {
    const { totpAt, newTotpSecret } = await import("./security.js");
    const { run } = await import("./db.js");
    const secret = newTotpSecret();
    run("UPDATE users SET totp_secret = ?, totp_enabled = 1 WHERE email = 'editor@duruvasa.com'", secret);
    const c = new Client();
    const step1 = await c.req("POST", "/api/admin/auth/change-password", { email: "editor@duruvasa.com", current: "Brand-New-Reset-Pass-8$", next: "Yet-Another-Strong-Pass-9%" });
    expect(step1.json.needs2fa).toBe(true);
    const step2 = await c.req("POST", "/api/admin/auth/change-password", { email: "editor@duruvasa.com", current: "Brand-New-Reset-Pass-8$", next: "Yet-Another-Strong-Pass-9%", code: totpAt(secret, Date.now()) });
    expect(step2.status).toBe(200);
    run("UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE email = 'editor@duruvasa.com'");
  });

  it("locks the account after repeated failures and shows a generic message", async () => {
    const { run } = await import("./db.js");
    run("UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE email = 'editor@duruvasa.com'");
    const c = new Client();
    let last = { status: 0, json: null as any };
    for (let i = 0; i < 5; i++) last = await c.req("POST", "/api/admin/auth/login", { email: "editor@duruvasa.com", password: "wrong-password-123" });
    expect(last.status).toBe(401);
    expect(last.json.error).toBe("Incorrect email, password or code.");
    const locked = await c.req("POST", "/api/admin/auth/login", { email: "editor@duruvasa.com", password: "Another-Strong-Pass-7#" });
    expect(locked.status).toBe(429);
    // unknown accounts get the same generic error
    const ghost = await new Client().req("POST", "/api/admin/auth/login", { email: "nobody@example.com", password: "whatever-123456" });
    expect(ghost.status).toBe(401);
    expect(ghost.json.error).toBe("Incorrect email, password or code.");
  });

  it("records an audit trail and creates a downloadable backup", async () => {
    const a = await admin.req("GET", "/api/admin/audit?limit=200");
    const actions = a.json.items.map((i: any) => i.action);
    expect(actions).toEqual(expect.arrayContaining(["login", "content.update", "content.create", "enquiry.status", "user.create", "password.changed"]));
    const b = await admin.req("POST", "/api/admin/backups");
    expect(b.status).toBe(201);
    const dl = await fetch(`${base}/api/admin/backups/${b.json.file}`, { headers: { cookie: admin.cookie } });
    expect(dl.status).toBe(200);
    expect((await dl.arrayBuffer()).byteLength).toBeGreaterThan(10_000);
    expect((await fetch(`${base}/api/admin/backups/..%2f..%2fsecret`, { headers: { cookie: admin.cookie } })).status).toBe(404);
  });

  it("signs out and invalidates the session", async () => {
    const out = await admin.req("POST", "/api/admin/auth/logout");
    expect(out.status).toBe(200);
    const c = new Client();
    c.cookie = admin.cookie;
    expect((await c.req("GET", "/api/admin/auth/me")).status).toBe(401);
  });
});
