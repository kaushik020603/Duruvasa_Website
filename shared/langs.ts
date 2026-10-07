// The nine site languages. English lives at the root (/); every other language lives under its own prefix (/hi, /ta, ...)
// so each page has a stable, crawlable address per language (with hreflang links between them).

export const LANGS = [
  { code: "en", name: "English", native: "English", locale: "en_IN", intl: "en-IN" },
  { code: "hi", name: "Hindi", native: "हिन्दी", locale: "hi_IN", intl: "hi-IN" },
  { code: "kn", name: "Kannada", native: "ಕನ್ನಡ", locale: "kn_IN", intl: "kn-IN" },
  { code: "ta", name: "Tamil", native: "தமிழ்", locale: "ta_IN", intl: "ta-IN" },
  { code: "te", name: "Telugu", native: "తెలుగు", locale: "te_IN", intl: "te-IN" },
  { code: "ml", name: "Malayalam", native: "മലയാളം", locale: "ml_IN", intl: "ml-IN" },
  { code: "mr", name: "Marathi", native: "मराठी", locale: "mr_IN", intl: "mr-IN" },
  { code: "bn", name: "Bengali", native: "বাংলা", locale: "bn_IN", intl: "bn-IN" },
  { code: "gu", name: "Gujarati", native: "ગુજરાતી", locale: "gu_IN", intl: "gu-IN" },
] as const;

export type Lang = (typeof LANGS)[number]["code"];
export const DEFAULT_LANG: Lang = "en";
export const LANG_CODES = LANGS.map((l) => l.code) as readonly Lang[];
export const isLang = (s: string): s is Lang => (LANG_CODES as readonly string[]).includes(s);
export const langInfo = (l: Lang) => LANGS.find((x) => x.code === l)!;

/** "/hi/services/x" -> { lang: "hi", rest: "/services/x" }; "/services/x" -> { lang: "en", rest: "/services/x" }. */
export function splitLang(pathname: string): { lang: Lang; rest: string; prefixed: boolean } {
  const m = pathname.match(/^\/([a-z]{2})(?=\/|$)/);
  if (m && isLang(m[1]) && m[1] !== DEFAULT_LANG) return { lang: m[1], rest: pathname.slice(3) || "/", prefixed: true };
  return { lang: DEFAULT_LANG, rest: pathname || "/", prefixed: false };
}

/** Puts a language prefix on an internal path ("/", "/#contact", "/services/x"). English stays unprefixed. */
export function prefixPath(path: string, lang: Lang): string {
  if (lang === DEFAULT_LANG || !path.startsWith("/") || path.startsWith("//")) return path;
  const m = path.match(/^(\/[^?#]*)(.*)$/)!;
  const base = m[1] === "/" ? "" : m[1];
  return `/${lang}${base}${m[2]}` || `/${lang}`;
}
