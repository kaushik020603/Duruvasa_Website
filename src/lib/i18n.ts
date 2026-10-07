import { DEFAULT_LANG, LANGS, prefixPath, type Lang } from "../../shared/langs";

export { LANGS, type Lang };

// The active language and its interface strings. Translations are files on the server (i18n/<code>.json); the server
// sends the current language's strings with the page content. English is the source text and lives in the components.
let active: Lang = DEFAULT_LANG;
let ui: Record<string, string> = {};

export function setI18n(lang: Lang, dict: Record<string, string>) {
  active = lang;
  ui = dict;
}
export const currentLang = () => active;

/** Looks up `key` in the active language; `{name}` placeholders are filled from `vars`. */
export function translate(key: string, fallback: string, vars?: Record<string, string | number>): string {
  const s = ui[key] ?? fallback;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

/** Internal link in the active language: lp("/services/x") is "/hi/services/x" on the Hindi site. */
export const lp = (path: string) => prefixPath(path, active);
