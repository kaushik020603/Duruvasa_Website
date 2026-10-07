import { useState } from "react";
import { legal, posts, SITE, services } from "../data/content";
import { useHead } from "../lib/head";
import { renderMarkdown } from "../lib/markdown";
import { prefillContact } from "../lib/bus";
import { navigate } from "../lib/router";

const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export function Legal({ slug }: { slug: string }) {
  const page = legal.find((l) => l.slug === slug)!;
  useHead({ title: page.title, path: `/${slug}`, description: `${page.title} for ${SITE.name}.` });
  return (
    <section className="page legal">
      <h1>{page.title}</h1>
      <div className="prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(page.body) }} />
      <p>Questions? <a href={`mailto:${SITE.email}`}>{SITE.email}</a></p>
      <a href="/" data-route>← Back to home</a>
    </section>
  );
}

export function NotFound() {
  useHead({ title: "Page not found", path: "/404" });
  return (
    <section className="page legal">
      <h1>Page not found</h1>
      <p>The page you are looking for does not exist.</p>
      <a href="/" data-route>← Back to home</a>
    </section>
  );
}

function Faq({ items }: { items: { q: string; a: string }[] }) {
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
      <nav className="crumbs" aria-label="Breadcrumb"><a href="/" data-route>Home</a> / <a href="/#services-list" data-route>Services</a> / {s.title}</nav>
      <header>
        <p className="eyebrow">Service</p>
        <h1>{s.title}</h1>
        <p className="lede">{s.tagline}</p>
        <p>{s.intro}</p>
        <button type="button" className="btn-light magnetic" onClick={() => { prefillContact(`I would like to discuss ${s.title}.`); navigate("/#contact"); }}>
          Talk to us about {s.title}
        </button>
        <p className="mail-note">Or email <a href={`mailto:${SITE.email}`}>{SITE.email}</a></p>
      </header>
      <section>
        <h2>What it covers</h2>
        <ul className="ticks">{s.covers.map((c, i) => <li key={c + i}>{c}</li>)}</ul>
      </section>
      <section>
        <h2>How it works</h2>
        <ol className="steps">
          {s.steps.map((st, i) => <li key={st.title + i} className="reveal"><b>{i + 1}</b><div><h3>{st.title}</h3><p>{st.text}</p></div></li>)}
        </ol>
      </section>
      <section>
        <h2>Frequently asked questions</h2>
        <Faq items={s.faqs} />
      </section>
      <section>
        <h2>Other services</h2>
        <ul className="related">
          {others.map((o) => <li key={o.slug}><a href={`/services/${o.slug}`} data-route><b>{o.title}</b><span>{o.tagline}</span></a></li>)}
        </ul>
      </section>
    </article>
  );
}

export function InsightsPage() {
  useHead({
    title: "Insights", path: "/insights",
    description: "Practical articles on cloud security, threat detection and compliance from the DuRuVaSa CloudSec team.",
  });
  return (
    <section className="page insights">
      <p className="eyebrow">Insights</p>
      <h1>Cloud security, in plain language</h1>
      <div className="post-list">
        {posts.map((p) => (
          <a key={p.slug} className="post-card reveal tilt" href={`/insights/${p.slug}`} data-route>
            <time dateTime={p.date}>{fmtDate(p.date)} · {p.readMins} min read</time>
            <h2>{p.title}</h2>
            <p>{p.excerpt}</p>
            <span className="more">Read article<span className="sr">: {p.title}</span> →</span>
          </a>
        ))}
      </div>
    </section>
  );
}

export function PostPage({ slug }: { slug: string }) {
  const p = posts.find((x) => x.slug === slug)!;
  const path = `/insights/${p.slug}`;
  useHead({
    title: p.title, description: p.excerpt, path, type: "article",
    jsonLd: { "@context": "https://schema.org", "@type": "BlogPosting", headline: p.title, description: p.excerpt, datePublished: p.date, author: { "@type": "Organization", name: SITE.name }, url: SITE.url + path },
  });
  return (
    <article className="page post">
      <nav className="crumbs" aria-label="Breadcrumb"><a href="/" data-route>Home</a> / <a href="/insights" data-route>Insights</a></nav>
      <h1>{p.title}</h1>
      <time dateTime={p.date}>{fmtDate(p.date)} · {p.readMins} min read</time>
      <div className="prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(p.body) }} />
      <a className="btn-light magnetic" href="/#contact" data-route>Talk to our team</a>
    </article>
  );
}
