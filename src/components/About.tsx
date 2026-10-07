import { useEffect, useRef } from "react";
import { about, img, services, SITE } from "../data/content";
import { usePrefs } from "../lib/prefs";
import { lp } from "../lib/i18n";

function Count({ to, suffix = "" }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  // The server renders the real number. After hydration the browser resets it to 0 and counts up when it scrolls into view
  // (written straight to the DOM so React's hydrated markup is not disturbed).
  useEffect(() => {
    const el = ref.current!;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.textContent = `0${suffix}`;
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const step = (t: number) => {
        const p = Math.min((t - t0) / 1400, 1);
        el.textContent = `${Math.round(to * (1 - Math.pow(1 - p, 3)))}${suffix}`;
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, { threshold: 0.6 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to, suffix]);
  return <span ref={ref}>{to}{suffix}</span>;
}

export default function About() {
  const { t } = usePrefs();
  return (
    <>
      <div className="intro-strip" style={{ backgroundImage: `url(${img.intro})` }} aria-hidden="true" />
      <section id="about" className="about about2" style={{ ["--about-bg" as string]: `url(${img.aboutBg})` }}>
        <div className="about-inner">
          <p className="eyebrow">{t("about.title", about.eyebrow)}</p>
          <h2 className="about-lead reveal">{about.lead}</h2>

          <div className="about-split">
            <div className="about-copy reveal">
              <p className="big">
                {t("about.text", about.intro)}
              </p>
              {about.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
              <div className="about-cta">
                <a className="btn-light magnetic" href="#contact">{t("about.cta1", "Talk to our team")}</a>
                <a className="btn-light ghost magnetic" href="#quiz">{t("about.cta2", "Take the security check")}</a>
                <a className="mail-link" href={`mailto:${SITE.email}`}>{SITE.email}</a>
              </div>
            </div>

            <dl className="glance reveal">
              {about.stats.map((st, i) => (
                <div key={st.label + i}><dd><Count to={st.value} suffix={st.suffix} /></dd><dt>{t(`stat.${i}`, st.label)}</dt></div>
              ))}
            </dl>
          </div>

          <div className="pillars">
            {about.pillars.map((p, i) => (
              <article key={p.title} className="pillar reveal tilt" style={{ transitionDelay: `${i * 100}ms` }}>
                <span className="pillar-icon" aria-hidden="true">{p.icon}</span>
                <h3>{p.title}</h3>
                <p>{p.text}</p>
              </article>
            ))}
          </div>

          <h3 className="about-sub reveal">{t("about.whatWeDo", "What we do")}</h3>
          <ul className="what-we-do">
            {services.map((s, i) => (
              <li key={s.slug} className="reveal" style={{ transitionDelay: `${i * 80}ms` }}>
                <a href={lp(`/services/${s.slug}`)} data-route>
                  <b>{s.title}</b>
                  <span>{s.tagline}</span>
                  <i aria-hidden="true">→</i>
                </a>
              </li>
            ))}
          </ul>

          <h3 className="about-sub reveal">{t("about.stand", "What we stand for")}</h3>
          <ul className="values">
            {about.values.map((v, i) => (
              <li key={v.title + i} className="reveal" style={{ transitionDelay: `${i * 80}ms` }}>
                <b>{v.title}</b><span>{v.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
