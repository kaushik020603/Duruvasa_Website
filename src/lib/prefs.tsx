import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { translate, type Lang } from "./i18n";
import { switchLangUrl } from "./router";

export type Theme = "dark" | "light";
export type Consent = "granted" | "denied" | null;

interface Prefs {
  theme: Theme; toggleTheme: () => void;
  lang: Lang; setLang: (l: Lang) => void;
  t: (key: string, fallback: string, vars?: Record<string, string | number>) => string;
  consent: Consent; setConsent: (c: Exclude<Consent, null>) => void;
}

const Ctx = createContext<Prefs | null>(null);

function read<T extends string>(key: string, allowed: readonly T[], fallback: T | null): T | null {
  try {
    const v = localStorage.getItem(key);
    return v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
  } catch { return fallback; }
}
function write(key: string, v: string) { try { localStorage.setItem(key, v); } catch { /* storage blocked */ } }

/**
 * The language comes from the page address (/hi/...), so server and browser always agree on it.
 * Theme and consent live in the browser only: they start at their defaults and are read after the page has hydrated,
 * which keeps the server-rendered markup identical to the first browser render.
 */
export function PrefsProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [consent, setConsentState] = useState<Consent>(null);
  const ready = useRef(false);

  useEffect(() => {
    setTheme(read("theme", ["dark", "light"] as const, "dark")!);
    setConsentState(read("consent", ["granted", "denied"] as const, null));
    ready.current = true;
  }, []);
  useEffect(() => {
    if (ready.current) document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggleTheme = useCallback(() => setTheme((t) => { const n = t === "dark" ? "light" : "dark"; write("theme", n); return n; }), []);
  const setLang = useCallback((l: Lang) => { window.location.assign(switchLangUrl(l, true)); }, []);
  const setConsent = useCallback((c: "granted" | "denied") => { write("consent", c); setConsentState(c); }, []);
  const t = useCallback((key: string, fb: string, vars?: Record<string, string | number>) => translate(key, fb, vars), []);

  // `lang` is in the dependency list so every consumer re-renders (and re-reads the strings) when the language changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useMemo(() => ({ theme, toggleTheme, lang, setLang, t, consent, setConsent }), [theme, toggleTheme, lang, setLang, t, consent, setConsent]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrefs(): Prefs {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePrefs must be used inside PrefsProvider");
  return v;
}

/** Privacy-friendly analytics (Plausible). Loads only after consent and when VITE_PLAUSIBLE_DOMAIN is set. */
export function useAnalytics() {
  const { consent } = usePrefs();
  useEffect(() => {
    const domain = import.meta.env.VITE_PLAUSIBLE_DOMAIN as string | undefined;
    if (consent !== "granted" || !domain || document.querySelector("script[data-analytics]")) return;
    const s = document.createElement("script");
    s.defer = true;
    s.dataset.domain = domain;
    s.dataset.analytics = "plausible";
    s.src = "https://plausible.io/js/script.js";
    document.head.appendChild(s);
  }, [consent]);
}
