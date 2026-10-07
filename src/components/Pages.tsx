import { useState } from "react";
import { legal, posts, SITE, services } from "../data/content";
import { useHead } from "../lib/head";
import { renderMarkdown } from "../lib/markdown";
import { prefillContact } from "../lib/bus";
import { navigate } from "../lib/router";
import { lp, currentLang } from "../lib/i18n";
import { langInfo } from "../../shared/langs";
import { usePrefs } from "../lib/prefs";

const fmtDate = (d: string) => new Date(d).toLocaleDateString(langInfo(currentLang()).intl, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function Legal({ slug }: { slug: string }) {
  const { t } = usePrefs();
  const page = legal.find((l) => l.slug === slug)!;
  useHead({ title: page.title, path: `/${slug}`, description: `${page.title} for ${SITE.name}.` });
  return (
    <section className="page legal">
      <h1>{page.title}</h1>
      <div className="prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(page.body, lp) }} />
      <p>{t("page.questions", "Questions?")} <a href={`mailto:${SITE.email}`}>{SITE.email}</a></p>
      <a href={lp("/")} data-route>← {t("page.back", "Back to home")}</a>
    </section>
  );
}

export function NotFound() {
  const { t } = usePrefs();
  useHead({ title: t("nf.h", "Page not found"), path: "/404" });
  return (
    <section className="page legal">
      <h1>{t("nf.h", "Page not found")}</h1>
      <p>{t("nf.p", "The page you are looking for does not exist.")}</p>
      <a href={lp("/")} data-route>← {t("page.back", "Back to home")}</a>
    </section>
  );
}

export function Faq({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="faq">
      {items.map(({ q, a }, i) => (
        <div key={q + i} className={open === i ? "faq-item open" : "faq-item"}>
          <h3>
            <button type="button" aria-expanded={open === i} aria-controls={`faq-${i}`} onClick={() => setOpen(open === i ? null : i)}>
              {q}<span aria-hidden="true">+</span>
            </button>
          </h3>
          <div id={`faq-${i}`} role="region" hidden={open !== i}><p>{a}</p></div>
        </div>
      ))}
    </div>
  );
}

export function ServicePage({ slug }: { slug: string }) {
  const { t } = usePrefs();
  const s = services.find((x) => x.slug === slug)!;
  const path = `/services/${s.slug}`;
  useHead({
    title: s.title, description: s.intro, path,
    jsonLd: [
      { "@context": "https://schema.org", "@type": "Service", name: s.title, description: s.intro, provider: { "@type": "Organization", name: SITE.name, url: SITE.url }, url: SITE.url + path },
      { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: s.faqs.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
    ],
  });
  const others = services.filter((x) => x.slug !== slug);
  return (
    <article className="page service">
      <nav className="crumbs" aria-label={t("crumb.label", "Breadcrumb")}><a href={lp("/")} data-route>{t("nav.home", "Home")}</a> / <a href={lp("/#services-list")} data-route>{t("foot.services", "Services")}</a> / {s.title}</nav>
      <header>
        <p className="eyebrow">{t("svc.eyebrow", "Service")}</p>
        <h1>{s.title}</h1>
        <p className="lede">{s.tagline}</p>
        <p>{s.intro}</p>
        <button type="button" className="btn-light magnetic" onClick={() => { prefillContact(t("svc.discuss", "I would like to discuss {title}.", { title: s.title })); navigate("/#contact"); }}>
          {t("svc.talk", "Talk to us about {title}", { title: s.title })}
        </button>
        <p className="mail-note">{t("svc.orEmail", "Or email")} <a href={`mailto:${SITE.email}`}>{SITE.email}</a></p>
      </header>
      <section>
        <h2>{t("svc.covers", "What it covers")}</h2>
        <ul className="ticks">{s.covers.map((c, i) => <li key={c + i}>{c}</li>)}</ul>
      </section>
      <section>
        <h2>{t("svc.how", "How it works")}</h2>
        <ol className="steps">
          {s.steps.map((st, i) => <li key={st.title + i} className="reveal"><b>{i + 1}</b><div><h3>{st.title}</h3><p>{st.text}</p></div></li>)}
        </ol>
      </section>
      <section>
        <h2>{t("svc.faq", "Frequently asked questions")}</h2>
        <Faq items={s.faqs} />
      </section>
      <section>
        <h2>{t("svc.other", "Other services")}</h2>
        <ul className="related">
          {others.map((o) => <li key={o.slug}><a href={lp(`/services/${o.slug}`)} data-route><b>{o.title}</b><span>{o.tagline}</span></a></li>)}
        </ul>
      </section>
    </article>
  );
}

export function InsightsPage() {
  const { t } = usePrefs();
  useHead({
    title: t("hdr.insights", "Insights"), path: "/insights",
    description: t("ins.desc", "Practical articles on cloud security, threat detection and compliance from the DuRuVaSa CloudSec team."),
  });
  return (
    <section className="page insights">
      <p className="eyebrow">{t("hdr.insights", "Insights")}</p>
      <h1>{t("ins.h1", "Cloud security, in plain language")}</h1>
      <div className="post-list">
        {posts.map((p) => (
          <a key={p.slug} className="post-card reveal tilt" href={lp(`/insights/${p.slug}`)} data-route>
            <time dateTime={p.date} suppressHydrationWarning>{fmtDate(p.date)} · {t("ins.min", "{n} min read", { n: p.readMins })}</time>
            <h2>{p.title}</h2>
            <p>{p.excerpt}</p>
            <span className="more">{t("ins.read", "Read article")}<span className="sr">: {p.title}</span> →</span>
          </a>
        ))}
      </div>
    </section>
  );
}

export function PostPage({ slug }: { slug: string }) {
  const { t } = usePrefs();
  const p = posts.find((x) => x.slug === slug)!;
  const path = `/insights/${p.slug}`;
  useHead({
    title: p.title, description: p.excerpt, path, type: "article",
    jsonLd: { "@context": "https://schema.org", "@type": "BlogPosting", headline: p.title, description: p.excerpt, datePublished: p.date, author: { "@type": "Organization", name: SITE.name }, url: SITE.url + path },
  });
  return (
    <article className="page post">
      <nav className="crumbs" aria-label={t("crumb.label", "Breadcrumb")}><a href={lp("/")} data-route>{t("nav.home", "Home")}</a> / <a href={lp("/insights")} data-route>{t("hdr.insights", "Insights")}</a></nav>
      <h1>{p.title}</h1>
      <time dateTime={p.date} suppressHydrationWarning>{fmtDate(p.date)} · {t("ins.min", "{n} min read", { n: p.readMins })}</time>
      <div className="prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(p.body, lp) }} />
      <a className="btn-light magnetic" href={lp("/#contact")} data-route>{t("about.cta1", "Talk to our team")}</a>
    </article>
  );
}
