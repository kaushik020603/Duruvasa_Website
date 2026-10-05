import { useEffect, useState } from "react";
import { legal, posts, services } from "../data/content";

export type Route =
  | { name: "home" }
  | { name: "legal"; slug: string }
  | { name: "service"; slug: string }
  | { name: "insights" }
  | { name: "post"; slug: string }
  | { name: "notfound" };

export function parseRoute(pathname: string): Route {
  const p = pathname.replace(/\/+$/, "").replace(/^\//, "");
  if (p === "") return { name: "home" };
  if (legal.some((l) => l.slug === p)) return { name: "legal", slug: p };
  if (p === "insights") return { name: "insights" };
  const [a, b] = p.split("/");
  if (a === "services" && b && services.some((s) => s.slug === b)) return { name: "service", slug: b };
  if (a === "insights" && b && posts.some((x) => x.slug === b)) return { name: "post", slug: b };
  return { name: "notfound" };
}

const EVT = "app:route";

export function navigate(to: string) {
  const url = new URL(to, window.location.origin);
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
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));
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
