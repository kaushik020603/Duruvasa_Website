import { useEffect } from "react";
import { SITE } from "../data/content";

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
  useEffect(() => {
    const full = title === SITE.name ? title : `${title} | ${SITE.name}`;
    const url = SITE.url + path;
    document.title = full;
    setMeta("name", "description", description);
    setMeta("property", "og:title", full);
    setMeta("property", "og:description", description);
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

    document.head.querySelector("script[data-route-ld]")?.remove();
    if (ld) {
      const s = document.createElement("script");
      s.type = "application/ld+json";
      s.setAttribute("data-route-ld", "");
      s.textContent = ld;
      document.head.appendChild(s);
    }
  }, [title, description, path, type, ld]);
}
