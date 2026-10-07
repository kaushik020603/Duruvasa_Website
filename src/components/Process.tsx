import { useEffect, useRef, useState } from "react";
import { sections, services } from "../data/content";
import { lp } from "../lib/i18n";
import { usePrefs } from "../lib/prefs";

const ORDER = ["threat-detection", "continuous-monitoring", "compliance-management", "tailored-solutions"];
const VERB: Record<string, string> = {
  "threat-detection": "Detect",
  "continuous-monitoring": "Monitor",
  "compliance-management": "Comply",
  "tailored-solutions": "Tailor",
};

/** Scroll-driven timeline: the line fills and each step lights up as you reach it. */
export default function Process() {
  const { t } = usePrefs();
  const root = useRef<HTMLOListElement>(null);
  const [fill, setFill] = useState(0);
  const [active, setActive] = useState(-1);

  useEffect(() => {
    const on = () => {
      const el = root.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const mid = window.innerHeight * 0.6;
      const p = Math.min(1, Math.max(0, (mid - r.top) / r.height));
      setFill(p);
      const items = Array.from(el.children) as HTMLElement[];
      let a = -1;
      items.forEach((it, i) => { if (it.getBoundingClientRect().top < mid) a = i; });
      setActive(a);
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => { window.removeEventListener("scroll", on); window.removeEventListener("resize", on); };
  }, []);

  const steps = ORDER.map((slug) => services.find((s) => s.slug === slug)).filter((s): s is NonNullable<typeof s> => !!s);

  return (
    <section id="process" className="process" aria-labelledby="process-h">
      <p className="eyebrow">{sections.process.eyebrow}</p>
      <h2 id="process-h">{sections.process.heading}</h2>
      <ol ref={root} style={{ ["--fill" as string]: fill }}>
        {steps.map((s, i) => (
          <li key={s.slug} className={i <= active ? "on" : ""}>
            <span className="node" aria-hidden="true">{i + 1}</span>
            <div className="step-card reveal">
              <h3>{t(`process.${s.slug}`, VERB[s.slug] ?? s.title)}</h3>
              <p className="tag">{s.title}</p>
              <p>{s.intro}</p>
              <a href={lp(`/services/${s.slug}`)} data-route>{t("process.explore", "Explore {title}", { title: s.title })} →</a>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
