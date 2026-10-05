import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { translate, type Lang } from "./i18n";

export type Theme = "dark" | "light";
export type Consent = "granted" | "denied" | null;

interface Prefs {
  theme: Theme; toggleTheme: () => void;
  lang: Lang; setLang: (l: Lang) => void;
  t: (key: string, fallback: string) => string;
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

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => read("theme", ["dark", "light"] as const, "dark")!);
  const [lang, setLangState] = useState<Lang>(() => read("lang", ["en", "hi", "kn"] as const, "en")!);
  const [consent, setConsentState] = useState<Consent>(() => read("consent", ["granted", "denied"] as const, null));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = lang;
  }, [theme, lang]);

  const toggleTheme = useCallback(() => setTheme((t) => { const n = t === "dark" ? "light" : "dark"; write("theme", n); return n; }), []);
  const setLang = useCallback((l: Lang) => { write("lang", l); setLangState(l); }, []);
  const setConsent = useCallback((c: "granted" | "denied") => { write("consent", c); setConsentState(c); }, []);
  const t = useCallback((key: string, fb: string) => translate(lang, key, fb), [lang]);

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
