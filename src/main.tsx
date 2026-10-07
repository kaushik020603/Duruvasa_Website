import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import App from "./App";
import { applyContent } from "./data/content";
import { splitLang } from "../shared/langs";
import "@fontsource/roboto/latin-400.css";
import "@fontsource/roboto/latin-700.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "./styles.css";
import "./animations.css";
import "./team.css";
import "./extras.css";
import "./sections.css";
import "./header.css";
import "./contact.css";
import "./footer.css";

// The language is part of the address (/hi/...), so the browser and the server always agree on it.
const lang = splitLang(window.location.pathname).lang;
let etag = "";

/** Pulls the latest CMS content. Fails quietly: the content embedded in the page is the offline fallback. */
async function syncContent(): Promise<void> {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 4000);
    const r = await fetch(`/api/content?lang=${lang}`, { signal: ctl.signal, headers: { Accept: "application/json", ...(etag && { "If-None-Match": etag }) } });
    clearTimeout(timer);
    if (r.status === 304 || !r.ok || !(r.headers.get("content-type") ?? "").includes("json")) return;
    etag = r.headers.get("etag") ?? "";
    applyContent(await r.json());
  } catch { /* offline or no API: keep the content we have */ }
}

// The server renders the page and embeds the exact content it used, so the first browser render matches the HTML
// (hydration) and no flash of English or empty content is possible. Without it (vite dev) the app renders on the client.
const root = document.getElementById("root")!;
const boot = document.getElementById("__DATA__")?.textContent;
let hydrated = false;
if (boot) {
  try {
    const d = JSON.parse(boot) as { etag: string; content: Record<string, unknown> };
    etag = d.etag;
    applyContent({ ...d.content, lang });
    hydrated = root.childElementCount > 0;
  } catch { /* fall through to a client render */ }
} else {
  applyContent({ lang });
}
const app = (
  <StrictMode>
    <App lang={lang} />
  </StrictMode>
);
if (hydrated) hydrateRoot(root, app);
else createRoot(root).render(app);
void syncContent();
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void syncContent(); });
