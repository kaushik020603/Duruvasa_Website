import { useEffect } from "react";
import { SITE } from "../data/content";
import { clip, fullTitle } from "../../shared/seo";
import { lp } from "./i18n";

interface Head {
  title: string;
  description?: string;
  path?: string;
  type?: "website" | "article";
  jsonLd?: object | object[];
}

function setMeta(attr: "name" | "property", key: string, value: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = value;
}

/** Per-route title, description, canonical, Open Graph and JSON-LD. */
export function useHead({ title, description = SITE.description, path = "/", type = "website", jsonLd }: Head) {
  const ld = jsonLd ? JSON.stringify(jsonLd) : "";
  const ldItems = jsonLd;
  useEffect(() => {
    const full = fullTitle(title, SITE.name);
    const desc = clip(description);
    const url = SITE.url + (path === "/" && lp("/") === "/" ? "/" : lp(path));
    document.title = full;
    setMeta("name", "description", desc);
    setMeta("property", "og:title", full);
    setMeta("property", "og:description", desc);
    setMeta("name", "twitter:title", full);
    setMeta("name", "twitter:description", desc);
    setMeta("property", "og:type", type);
    setMeta("property", "og:url", url);
    setMeta("property", "og:image", `${SITE.url}/og-image.jpg`);
    setMeta("name", "twitter:card", "summary_large_image");
    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    link.href = url;

    // The server already rendered this page's structured data; only replace it when navigating inside the app.
    const existing = Array.from(document.head.querySelectorAll<HTMLScriptElement>("script[data-route-ld]"));
    if (existing.length && existing.every((e) => e.getAttribute("data-route-ld") === path)) return;
    existing.forEach((e) => e.remove());
    for (const item of Array.isArray(ldItems) ? ldItems : ld ? [ldItems] : []) {
      const s = document.createElement("script");
      s.type = "application/ld+json";
      s.setAttribute("data-route-ld", path);
      s.textContent = JSON.stringify(item);
      document.head.appendChild(s);
    }
  }, [title, description, path, type, ld]);
}
