import { useEffect, useState } from "react";
import { legal, posts, services } from "../data/content";
import { DEFAULT_LANG, prefixPath, splitLang, type Lang } from "../../shared/langs";
import { currentLang, lp } from "./i18n";

export type Route =
  | { name: "home" }
  | { name: "legal"; slug: string }
  | { name: "service"; slug: string }
  | { name: "insights" }
  | { name: "post"; slug: string }
  | { name: "notfound" };

/** On the server there is no window; the page being rendered is set here before each render. */
let ssrPath = "/";
export const setSsrPath = (p: string) => { ssrPath = p; };
const here = () => (typeof window === "undefined" ? ssrPath : window.location.pathname);

/** Which language a path is in ("/hi/insights" -> "hi"). */
export const langOf = (pathname: string): Lang => splitLang(pathname).lang;

export function parseRoute(pathname: string): Route {
  const p = splitLang(pathname).rest.replace(/\/+$/, "").replace(/^\//, "");
  if (p === "") return { name: "home" };
  if (legal.some((l) => l.slug === p)) return { name: "legal", slug: p };
  if (p === "insights") return { name: "insights" };
  const [a, b] = p.split("/");
  if (a === "services" && b && services.some((s) => s.slug === b)) return { name: "service", slug: b };
  if (a === "insights" && b && posts.some((x) => x.slug === b)) return { name: "post", slug: b };
  return { name: "notfound" };
}

/** The same page in another language (used by the language switcher). */
export function switchLangUrl(to: Lang, withHash = false): string {
  const { rest } = splitLang(here());
  const hash = withHash && typeof window !== "undefined" ? window.location.hash : "";
  return prefixPath(rest.replace(/\/+$/, "") || "/", to) + hash;
}

const EVT = "app:route";

export function navigate(to: string) {
  const localized = splitLang(new URL(to, "http://x").pathname).prefixed || currentLang() === DEFAULT_LANG ? to : lp(to);
  const url = new URL(localized, window.location.origin);
  if (url.pathname + url.search !== window.location.pathname + window.location.search) {
    history.pushState({}, "", url.pathname + url.search + url.hash);
    window.dispatchEvent(new Event(EVT));
  } else if (url.hash) {
    history.replaceState({}, "", url.pathname + url.search + url.hash);
  }
  requestAnimationFrame(() => {
    if (url.hash) document.getElementById(url.hash.slice(1))?.scrollIntoView();
    else window.scrollTo(0, 0);
  });
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(here()));
  useEffect(() => {
    const on = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener("popstate", on);
    window.addEventListener(EVT, on);
    return () => {
      window.removeEventListener("popstate", on);
      window.removeEventListener(EVT, on);
    };
  }, []);
  return route;
}

/** Intercepts clicks on any `a[data-route]` so the SPA navigates without a reload. */
export function installLinkInterceptor(): () => void {
  const onClick = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>("a[data-route]");
    if (!a) return;
    e.preventDefault();
    navigate(a.getAttribute("href") || "/");
  };
  document.addEventListener("click", onClick);
  return () => document.removeEventListener("click", onClick);
}
