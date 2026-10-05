import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { applyContent } from "./data/content";
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

let etag = "";

/** Pulls the latest CMS content. Fails quietly: the bundled content is the offline fallback. */
async function syncContent(): Promise<void> {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 4000);
    const r = await fetch("/api/content", { signal: ctl.signal, headers: { Accept: "application/json", ...(etag && { "If-None-Match": etag }) } });
    clearTimeout(timer);
    if (r.status === 304 || !r.ok || !(r.headers.get("content-type") ?? "").includes("json")) return;
    etag = r.headers.get("etag") ?? "";
    applyContent(await r.json());
  } catch { /* offline or no API: keep bundled content */ }
}

// Render immediately (fast first paint); the content store re-renders the page when the CMS data arrives.
void syncContent();
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void syncContent(); });
