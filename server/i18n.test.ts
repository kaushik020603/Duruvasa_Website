import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LANGS } from "../shared/langs.js";
import { localize, type Translation } from "../shared/localize.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
const root = path.resolve(import.meta.dirname, "..");
const rd = (f: string) => JSON.parse(fs.readFileSync(path.join(root, f), "utf8"));
const enUi: Record<string, string> = rd("i18n/en.ui.json");
const pages = rd("src/content/pages.json");
const site = rd("src/content/site.json");
const base = {
  ...pages, ...site,
  services: rd("src/content/services.json").items, posts: rd("src/content/posts.json").items,
};
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

/** Every path in the translation must exist in the English content, and lists must have the same length. */
function checkShape(tr: any, en: any, where: string, problems: string[]) {
  if (Array.isArray(en)) {
    if (!Array.isArray(tr) || tr.length !== en.length) { problems.push(`${where}: expected a list of ${en.length}`); return; }
    tr.forEach((t, i) => checkShape(t, en[i], `${where}[${i}]`, problems));
  } else if (en && typeof en === "object") {
    for (const k of Object.keys(tr)) {
      if (!(k in en)) problems.push(`${where}.${k}: not in the English content`);
      else checkShape(tr[k], en[k], `${where}.${k}`, problems);
    }
  } else if (typeof tr !== typeof en) problems.push(`${where}: wrong type`);
}

// I18N_ONLY=hi,ta limits the run while translations are being written.
const only = process.env.I18N_ONLY?.split(",");
const others = LANGS.filter((l) => l.code !== "en" && (!only || only.includes(l.code)));

describe.each(others)("translation: $name ($code)", ({ code }) => {
  const tr: Translation = rd(`i18n/${code}.json`);

  it("has every interface string, with the same placeholders", () => {
    const ui = tr.ui ?? {};
    const missing = Object.keys(enUi).filter((k) => !ui[k]);
    expect(missing, "missing keys").toEqual([]);
    const extra = Object.keys(ui).filter((k) => !(k in enUi));
    expect(extra, "unknown keys").toEqual([]);
    const bad = Object.keys(enUi).filter((k) => placeholders(ui[k] ?? "") !== placeholders(enUi[k]));
    expect(bad, "placeholders changed").toEqual([]);
  });

  it("matches the shape of the English content", () => {
    const problems: string[] = [];
    for (const k of ["site", "hero", "about", "sections", "partners", "advantages", "offerings", "attributes"] as const) {
      if (!tr[k]) { problems.push(`${k}: missing`); continue; }
      checkShape(tr[k], (base as any)[k], k, problems);
    }
    const keyed: [keyof Translation, string, string][] = [["team", "team", "name"], ["services", "services", "slug"], ["posts", "posts", "slug"], ["legal", "legal", "slug"], ["resources", "resources", "slug"]];
    for (const [k, baseKey, id] of keyed) {
      const t = (tr as any)[k] as Record<string, any> | undefined;
      if (!t) { problems.push(`${k}: missing`); continue; }
      for (const item of (base as any)[baseKey]) {
        if (!t[item[id]]) problems.push(`${k}.${item[id]}: missing`);
        else checkShape(t[item[id]], item, `${k}.${item[id]}`, problems);
      }
      for (const key of Object.keys(t)) if (!(base as any)[baseKey].some((i: any) => i[id] === key)) problems.push(`${k}.${key}: no such item in English`);
    }
    expect(problems).toEqual([]);
  });

  it("translates the visible text (not left in English) and keeps links and markdown intact", () => {
    const out = localize(base, tr) as any;
    expect(out.hero.lineA).not.toBe(base.hero.lineA);
    for (const s of out.services) expect(s.intro).not.toBe(base.services.find((b: any) => b.slug === s.slug).intro);
    for (const p of out.posts) {
      const en = base.posts.find((b: any) => b.slug === p.slug);
      expect(p.body).not.toBe(en.body);
      const links = (b: string) => [...b.matchAll(/\]\((\/[^)]*)\)/g)].map((m) => m[1]);
      expect(links(p.body)).toEqual(links(en.body));
      expect((p.body.match(/^## /gm) ?? []).length).toBe((en.body.match(/^## /gm) ?? []).length);
    }
    expect(out.ui["quiz.mfa.q"]).not.toBe(enUi["quiz.mfa.q"]);
  });
});
