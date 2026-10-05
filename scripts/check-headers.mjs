// Security-header audit. Usage: node scripts/check-headers.mjs https://www.duruvasa.com
// Exits non-zero if anything required is missing, so it can gate a deployment.
const base = (process.argv[2] ?? process.env.AUDIT_URL ?? "http://127.0.0.1:4180").replace(/\/$/, "");
const https = base.startsWith("https://");

const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok, detail });

async function get(path, init) {
  return fetch(base + path, { redirect: "manual", ...init });
}

const home = await get("/");
const h = (k) => home.headers.get(k) ?? "";
const csp = h("content-security-policy");

check("Home page responds 200", home.status === 200, `HTTP ${home.status}`);
check("Content-Security-Policy present", !!csp);
check("CSP: default-src 'self'", /default-src 'self'/.test(csp));
check("CSP: frame-ancestors 'none' (clickjacking)", /frame-ancestors 'none'/.test(csp));
check("CSP: object-src 'none'", /object-src 'none'/.test(csp));
check("CSP: no 'unsafe-eval'", !/unsafe-eval/.test(csp));
check("CSP: scripts do not allow 'unsafe-inline'", !/script-src[^;]*'unsafe-inline'/.test(csp));
check("X-Content-Type-Options: nosniff", h("x-content-type-options") === "nosniff");
check("X-Frame-Options: DENY", h("x-frame-options").toUpperCase() === "DENY");
check("Referrer-Policy set", /strict-origin|no-referrer|same-origin/.test(h("referrer-policy")), h("referrer-policy"));
check("Permissions-Policy set", !!h("permissions-policy"));
check("Cross-Origin-Opener-Policy set", !!h("cross-origin-opener-policy"));
check("X-Powered-By hidden", !h("x-powered-by"));
if (https) check("Strict-Transport-Security (1 year+)", Number(/max-age=(\d+)/.exec(h("strict-transport-security"))?.[1] ?? 0) >= 31536000, h("strict-transport-security"));

// The admin API must never be cacheable and must refuse anonymous access.
const adminApi = await get("/api/admin/enquiries");
check("Admin API rejects anonymous requests (401)", adminApi.status === 401, `HTTP ${adminApi.status}`);
check("Admin API responses are not cacheable", /no-store/.test(adminApi.headers.get("cache-control") ?? ""));
const adminPage = await get("/admin/");
check("Admin page is served at /admin/", adminPage.status === 200);
check("Admin page is not cacheable", /no-store/.test(adminPage.headers.get("cache-control") ?? ""));
check("Admin page asks search engines not to index", /noindex/.test(await adminPage.text()));

// Gated download must not be fetchable without a token.
const dl = await get("/api/resources/cloud-security-checklist/download");
check("Gated download needs a token (403)", dl.status === 403, `HTTP ${dl.status}`);

// Private data must not be reachable as static files.
for (const p of ["/data/site.db", "/server-dist/server/index.js", "/.env", "/uploads/../data/site.db"]) {
  const r = await get(p);
  const type = r.headers.get("content-type") ?? "";
  check(`Not exposed: ${p}`, r.status === 404 || type.includes("text/html"), `HTTP ${r.status}`);
}

if (https) {
  const plain = await fetch(base.replace("https://", "http://") + "/", { redirect: "manual" }).catch(() => null);
  if (plain) check("HTTP redirects to HTTPS", [301, 302, 307, 308].includes(plain.status) && (plain.headers.get("location") ?? "").startsWith("https://"), `HTTP ${plain.status}`);
}

let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? "  PASS" : "  FAIL"}  ${r.name}${r.detail && !r.ok ? `  (${r.detail})` : ""}`);
}
console.log(`\n${results.length - failed}/${results.length} checks passed for ${base}`);
process.exitCode = failed ? 1 : 0; // (not process.exit: avoids a libuv assertion on Windows with open fetch sockets)
