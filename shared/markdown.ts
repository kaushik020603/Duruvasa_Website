/**
 * Tiny, safe markdown renderer for blog posts: ##/### headings, paragraphs, - lists, 1. lists,
 * **bold**, *italic*, [links](url). All input is HTML-escaped first, so no raw HTML gets through.
 */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inline(s: string, lp: (p: string) => string): string {
  return esc(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text: string, href: string) => {
      const internal = href.startsWith("/");
      const safe = internal || /^https?:\/\//.test(href) || href.startsWith("mailto:");
      if (!safe) return text;
      return internal
        ? `<a href="${lp(href)}" data-route>${text}</a>`
        : `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    });
}

/** `lp` adds the language prefix to internal links (/hi/services/x). */
export function renderMarkdown(md: string, lp: (p: string) => string = (p) => p): string {
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };

  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();
    let m: RegExpMatchArray | null;
    if (!line.trim()) { close(); continue; }
    if ((m = line.match(/^(#{2,3})\s+(.*)$/))) {
      close();
      const lvl = m[1].length;
      out.push(`<h${lvl}>${inline(m[2], lp)}</h${lvl}>`);
    } else if ((m = line.match(/^[-*]\s+(.*)$/))) {
      if (list !== "ul") { close(); out.push("<ul>"); list = "ul"; }
      out.push(`<li>${inline(m[1], lp)}</li>`);
    } else if ((m = line.match(/^\d+\.\s+(.*)$/))) {
      if (list !== "ol") { close(); out.push("<ol>"); list = "ol"; }
      out.push(`<li>${inline(m[1], lp)}</li>`);
    } else {
      close();
      out.push(`<p>${inline(line, lp)}</p>`);
    }
  }
  close();
  return out.join("\n");
}
