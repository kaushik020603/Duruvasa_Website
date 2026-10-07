import { renderToString } from "react-dom/server";
import App from "./App";
import { applyContent, type ContentBundle } from "./data/content";
import { setSsrPath } from "./lib/router";
import type { Lang } from "../shared/langs";

/**
 * Server-side render of one page. Called by server/seo.ts with the (already translated) content bundle.
 * It is synchronous and the content store is module-level, so concurrent requests cannot interleave.
 */
export function render(url: string, bundle: ContentBundle, lang: Lang): string {
  applyContent({ ...bundle, lang });
  setSsrPath(url);
  return renderToString(<App lang={lang} />);
}
