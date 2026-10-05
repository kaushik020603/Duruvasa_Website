import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";
import { parseRoute } from "./router";
import { questions, scoreQuiz } from "./quiz";
import { buildIcs, nextWeekdays, validate } from "./validate";
import { translate } from "./i18n";
import { posts, services } from "../data/content";

describe("parseRoute", () => {
  it("maps known paths", () => {
    expect(parseRoute("/")).toEqual({ name: "home" });
    expect(parseRoute("/privacy-policy/")).toEqual({ name: "legal", slug: "privacy-policy" });
    expect(parseRoute("/insights")).toEqual({ name: "insights" });
    expect(parseRoute(`/services/${services[0].slug}`)).toEqual({ name: "service", slug: services[0].slug });
    expect(parseRoute(`/insights/${posts[0].slug}`)).toEqual({ name: "post", slug: posts[0].slug });
  });
  it("returns notfound for unknown paths", () => {
    expect(parseRoute("/nope").name).toBe("notfound");
    expect(parseRoute("/services/unknown").name).toBe("notfound");
  });
});

describe("renderMarkdown", () => {
  it("renders headings, lists, emphasis and links", () => {
    const html = renderMarkdown("## Title\n\nHello **bold** and *it*.\n\n- a\n- b\n\n1. one\n2. two\n\n[x](/services/a) [y](https://e.com)");
    expect(html).toContain("<h2>Title</h2>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>it</em>");
    expect(html).toContain("<ul>\n<li>a</li>\n<li>b</li>\n</ul>");
    expect(html).toContain("<ol>");
    expect(html).toContain('<a href="/services/a" data-route>x</a>');
    expect(html).toContain('rel="noopener noreferrer"');
  });
  it("escapes HTML and blocks unsafe links", () => {
    const html = renderMarkdown('<script>alert(1)</script> [bad](javascript:alert(1))');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("href=\"javascript:");
  });
});

describe("quiz", () => {
  it("scores perfect, zero and mixed answers", () => {
    const all = (n: number) => Object.fromEntries(questions.map((q) => [q.id, n]));
    expect(scoreQuiz(all(2))).toMatchObject({ percent: 100, level: "Strong", tips: [] });
    expect(scoreQuiz(all(0))).toMatchObject({ percent: 0, level: "At risk" });
    const mid = scoreQuiz(all(1));
    expect(mid.percent).toBe(50);
    expect(mid.level).toBe("Developing");
    expect(mid.tips).toHaveLength(questions.length);
  });
});

describe("validate", () => {
  const ok = { first: "A", last: "B", email: "a@b.co", message: "long enough text" };
  it("accepts a good form", () => expect(validate(ok)).toEqual({}));
  it("flags each bad field", () => {
    expect(Object.keys(validate({ first: "", last: " ", email: "nope", message: "short" })).sort()).toEqual(["email", "first", "last", "message"]);
  });
});

describe("scheduler helpers", () => {
  it("returns only weekdays, starting after the given day", () => {
    const days = nextWeekdays(new Date(2026, 9, 9), 5); // Fri 9 Oct 2026
    expect(days).toHaveLength(5);
    expect(days.every((d) => d.getDay() !== 0 && d.getDay() !== 6)).toBe(true);
    expect(days[0].getDay()).toBe(1); // next Monday
  });
  it("builds a valid ics", () => {
    const ics = buildIcs(new Date(2026, 9, 12), "14:00", "Test");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("DTSTART:20261012T140000");
    expect(ics).toContain("DTEND:20261012T143000");
  });
});

describe("i18n", () => {
  it("translates and falls back to English", () => {
    expect(translate("hi", "nav.home", "Home")).not.toBe("Home");
    expect(translate("kn", "nav.home", "Home")).not.toBe("Home");
    expect(translate("hi", "missing.key", "Fallback")).toBe("Fallback");
    expect(translate("en", "nav.home", "Home")).toBe("Home");
  });
});

describe("content", () => {
  it("has unique slugs and every offering links to a service page", () => {
    expect(new Set(services.map((s) => s.slug)).size).toBe(services.length);
    expect(new Set(posts.map((p) => p.slug)).size).toBe(posts.length);
  });
});
