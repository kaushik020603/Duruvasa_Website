// Translations: i18n/<code>.json files (interface strings + translated content), layered over the English CMS content.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { getBundle } from "./content.js";
import { DEFAULT_LANG, isLang, type Lang } from "../shared/langs.js";
import { localize, type Translation } from "../shared/localize.js";

const files = new Map<Lang, Translation | undefined>();

export function translation(lang: Lang): Translation | undefined {
  if (lang === DEFAULT_LANG) return undefined;
  if (!files.has(lang)) {
    try { files.set(lang, JSON.parse(fs.readFileSync(path.join(config.i18nDir, `${lang}.json`), "utf8")) as Translation); }
    catch (e) { console.warn(`i18n: no usable translation file for "${lang}" (${(e as Error).message}); serving English`); files.set(lang, undefined); }
  }
  return files.get(lang);
}

export interface LocalizedBundle { lang: Lang; obj: Record<string, any>; json: string; etag: string } // eslint-disable-line @typescript-eslint/no-explicit-any

let baseEtag = "";
const cache = new Map<Lang, LocalizedBundle>();

/** The public content bundle in one language, cached until the CMS content changes. */
export function localizedBundle(lang: Lang): LocalizedBundle {
  const base = getBundle();
  if (base.etag !== baseEtag) { cache.clear(); baseEtag = base.etag; }
  let hit = cache.get(lang);
  if (!hit) {
    const obj = { ...localize(JSON.parse(base.json), translation(lang)), lang };
    const json = JSON.stringify(obj);
    hit = { lang, obj, json, etag: `"${crypto.createHash("sha1").update(`${lang}:${json}`).digest("hex")}"` };
    cache.set(lang, hit);
  }
  return hit;
}

/** `?lang=hi` -> "hi"; anything unknown is English. */
export const parseLang = (v: unknown): Lang => (typeof v === "string" && isLang(v) ? v : DEFAULT_LANG);
