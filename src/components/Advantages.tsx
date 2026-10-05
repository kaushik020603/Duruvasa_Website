import { advantages, sections } from "../data/content";
import { usePrefs } from "../lib/prefs";

export default function Advantages() {
  const { t } = usePrefs();
  return (
    <section id="features" className="advantages">
      <h2>{t("adv.h", sections.advantages.heading)}</h2>
      <div className="adv-grid">
        {advantages.map(({ title, text }, i) => (
          <article key={title + i} className="adv-card reveal tilt" style={{ transitionDelay: `${(i % 3) * 90}ms` }}>
            <h3>{t(`adv.${i}.t`, title)}</h3>
            <p>{t(`adv.${i}.d`, text)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
