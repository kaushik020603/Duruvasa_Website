// Small helpers shared by the browser (useHead) and the server (server/seo.ts) so both emit identical metadata.

/** Meta descriptions are cut at a word boundary near 155 characters, the length search engines show in full. */
export function clip(text: string, max = 155): string {
  const s = text.replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:.\-–—]+$/, "")}…`;
}

/** "Threat Detection" -> "Threat Detection | DuRuVaSa CloudSec". A title that already names the site is kept as is. */
export function fullTitle(title: string, siteName: string): string {
  return title.includes(siteName) ? title : `${title} | ${siteName}`;
}

/** The home page gets a keyword-bearing title instead of the bare company name. */
export const homeTitle = (siteName: string) => `${siteName} | Cybersecurity Consulting & Cloud Security Services`;

/** Questions shown in the home page FAQ and published as FAQPage structured data: the first few of each service. */
export function homeFaqs(services: { faqs?: { q: string; a: string }[] }[], perService = 2): { q: string; a: string }[] {
  return services.flatMap((s) => (s.faqs ?? []).slice(0, perService));
}
