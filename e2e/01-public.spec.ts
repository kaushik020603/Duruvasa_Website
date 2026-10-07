import { expect, test } from "@playwright/test";
import { skipIntro } from "./helpers";

test.beforeEach(async ({ page }) => { await skipIntro(page); });

test("home page renders, has no console errors and no horizontal overflow", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto("/");
  await expect(page).toHaveTitle(/DuRuVaSa CloudSec/);
  await expect(page.locator("h1")).toContainText("Protecting Your");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(errors, errors.join("\n")).toEqual([]);
});

test("header: logo is visible, sized and sharp; navigation works", async ({ page, isMobile }) => {
  await page.goto("/");
  const logo = page.locator(".site-header .logo img");
  await expect(logo).toBeVisible();
  const box = await logo.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(46);
  expect(await logo.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(300);
  if (isMobile) {
    await page.getByRole("button", { name: "Toggle menu" }).click();
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  }
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Insights" }).click();
  await expect(page).toHaveURL(/\/insights$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Cloud security");
});

test("partners: identical-size cards, every one links out, carousel revolves", async ({ page }) => {
  await page.goto("/");
  const cards = page.locator(".partner-card-link:not([aria-hidden])");
  await expect(cards).toHaveCount(6);
  const sizes = await cards.evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}`; }));
  expect(new Set(sizes).size).toBe(1);
  const hrefs = await cards.evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).href));
  expect(hrefs.every((h) => /^https:\/\//.test(h))).toBe(true);
  expect(new Set(hrefs).size).toBe(6);
  const t1 = await page.locator(".carousel-track").evaluate((e) => getComputedStyle(e).transform);
  await page.waitForTimeout(1200);
  const t2 = await page.locator(".carousel-track").evaluate((e) => getComputedStyle(e).transform);
  expect(t1).not.toBe(t2);
});

test("call and WhatsApp buttons use the configured numbers", async ({ page, isMobile }) => {
  await page.goto("/");
  const call = page.locator(".fab .fab-call");
  const wa = page.locator(".fab .fab-wa");
  await expect(wa).toBeVisible();
  expect(await wa.getAttribute("href")).toContain("https://wa.me/917506045810?text=");
  expect(await call.getAttribute("href")).toBe("tel:+919833445810");
  if (isMobile) await expect(call).toBeVisible(); else await expect(call).toBeHidden();
});

test("security quiz scores and hands off to the contact form", async ({ page }) => {
  await page.goto("/");
  await page.locator("#quiz").scrollIntoViewIfNeeded();
  for (let i = 0; i < 6; i++) await page.locator("#quiz .opt").first().click();
  await expect(page.locator("#quiz .result h3")).toHaveText("Strong");
  await page.getByRole("button", { name: "Discuss my results" }).click();
  await expect(page.locator("#contact textarea")).toHaveValue(/scored 12\/12/);
});

test("contact form validates, then saves an enquiry", async ({ page }) => {
  await page.goto("/");
  const form = page.locator("#contact form");
  await form.scrollIntoViewIfNeeded();
  await page.waitForTimeout(2600); // the anti-bot timer ignores instant submissions
  await form.getByRole("button", { name: "Submit" }).click();
  await expect(form.getByText("Enter your first name")).toBeVisible();
  await form.getByPlaceholder("Enter your first name").fill("Priya");
  await form.getByPlaceholder("Enter your last name").fill("Nair");
  await form.getByPlaceholder("Enter your email").fill("priya.e2e@example.com");
  await form.getByPlaceholder("Phone (optional)").fill("+91 90000 11111");
  await form.getByPlaceholder("Give a detailed example").fill("E2E: please contact me about a cloud security assessment.");
  await form.getByRole("button", { name: "Submit" }).click();
  await expect(form.getByText(/Thanks! We will get back/)).toBeVisible();
});

test("consultation booking stores the preferred time", async ({ page }) => {
  await page.goto("/");
  const form = page.locator("#contact form");
  await form.scrollIntoViewIfNeeded();
  await form.getByRole("tab", { name: "Book a consultation" }).click();
  await page.waitForTimeout(2600);
  await form.getByRole("button", { name: "Request consultation" }).click();
  await expect(form.getByText("Choose a time slot")).toBeVisible();
  await form.getByRole("radio", { name: "15:00" }).click();
  await form.getByPlaceholder("Enter your first name").fill("Karan");
  await form.getByPlaceholder("Enter your last name").fill("Mehta");
  await form.getByPlaceholder("Enter your email").fill("karan.e2e@example.com");
  await form.getByRole("button", { name: "Request consultation" }).click();
  await expect(form.getByText(/Thanks! We will get back/)).toBeVisible();
  await expect(form.getByRole("button", { name: "Add to calendar" })).toBeVisible();
});

test("free checklist: needs consent, then delivers a real PDF", async ({ page }) => {
  await page.goto("/");
  const sec = page.locator("#resources");
  await sec.scrollIntoViewIfNeeded();
  await sec.getByPlaceholder("Your email address").fill("lead.e2e@example.com");
  await sec.getByRole("button", { name: "Send me the checklist" }).click();
  await expect(sec.getByText("Please tick the box to continue")).toBeVisible();
  await sec.getByRole("checkbox").check();
  const downloadPromise = page.waitForEvent("download");
  await sec.getByRole("button", { name: "Send me the checklist" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("Cloud-Security-Checklist.pdf");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  expect(Buffer.concat(chunks).subarray(0, 5).toString()).toBe("%PDF-");
  await expect(sec.getByText("Your checklist is on its way")).toBeVisible();
});

test("service page: FAQ accordion and structured data", async ({ page }) => {
  await page.goto("/services/threat-detection");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Threat Detection");
  const second = page.getByRole("button", { name: /Will this create a flood of false alerts/ });
  await second.click();
  await expect(second).toHaveAttribute("aria-expanded", "true");
  const ld = (await page.locator("script[data-route-ld]").allTextContents()).join(" ");
  for (const type of ["Service", "FAQPage", "BreadcrumbList"]) expect(ld).toContain(`"@type":"${type}"`);
  expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toBe("https://www.duruvasa.com/services/threat-detection");
});

test("unknown pages show a friendly 404 and the sitemap is served", async ({ page, request }) => {
  await page.goto("/definitely-not-a-page");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  const sm = await request.get("/sitemap.xml");
  expect(sm.ok()).toBe(true);
  expect(await sm.text()).toContain("https://www.duruvasa.com/services/threat-detection");
});

test("public pages send security headers", async ({ request }) => {
  const r = await request.get("/");
  const h = r.headers();
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-powered-by"]).toBeUndefined();
});

test("footer: copyright is fully visible and never covered by the back-to-top button or chat bubble", async ({ page, isMobile }) => {
  await page.goto("/");
  await page.locator(".site-footer").scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  const copy = page.locator(".foot-bottom p");
  await expect(copy).toContainText("All rights reserved");
  const c = await copy.boundingBox();
  const fixedBoxes = await page.evaluate(() =>
    [".to-top", ".fab"].map((sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return cs.visibility === "hidden" || cs.opacity === "0" ? null : { x: r.x, y: r.y, w: r.width, h: r.height }; }).filter(Boolean));
  for (const b of fixedBoxes as { x: number; y: number; w: number; h: number }[]) {
    const overlap = !(c!.x + c!.width <= b.x || b.x + b.w <= c!.x || c!.y + c!.height <= b.y || b.y + b.h <= c!.y);
    expect(overlap, `copyright overlaps a fixed button (${JSON.stringify(b)})`).toBe(false);
  }
  void isMobile;
});

test("team: exactly two consulting partners, OEM logos on every certification, no third column", async ({ page }) => {
  await page.goto("/");
  await page.locator("#team").scrollIntoViewIfNeeded();
  await page.locator(".partner-grid").scrollIntoViewIfNeeded();
  await expect(page.locator(".partner-card")).toHaveCount(2);
  await expect(page.locator(".partner-bio")).toHaveCount(0);
  const imgs = page.locator(".partner-card .certs img.oem");
  await expect(imgs).toHaveCount(6);
  const srcs = await imgs.evaluateAll((els) => els.map((e) => (e as HTMLImageElement).src.split("/").pop()));
  expect(new Set(srcs)).toEqual(new Set(["zscaler-symbol.svg", "fortinet.svg", "paloalto.svg"]));
  await imgs.first().scrollIntoViewIfNeeded();
  for (const i of await imgs.all()) {
    await i.scrollIntoViewIfNeeded();
    await expect.poll(() => i.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0)).toBe(true);
  }
});
