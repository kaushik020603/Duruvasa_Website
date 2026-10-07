import { badges, testimonials } from "../data/content";
import { usePrefs } from "../lib/prefs";

/** Both lists are edited in src/content/site.json. Nothing renders until real entries are added. */
export default function Trust() {
  const { t } = usePrefs();
  if (!testimonials.length && !badges.length) return null;
  return (
    <section className="trust" aria-label={t("trust.label", "Trust and credentials")}>
      {testimonials.length > 0 && (
        <>
          <h2>{t("trust.h", "What clients say")}</h2>
          <div className="quotes">
            {testimonials.map((q) => (
              <figure key={q.name + q.quote} className="reveal">
                <blockquote>“{q.quote}”</blockquote>
                <figcaption><b>{q.name}</b>, {q.role}{q.company ? `, ${q.company}` : ""}</figcaption>
              </figure>
            ))}
          </div>
        </>
      )}
      {badges.length > 0 && (
        <ul className="badges" aria-label={t("trust.badges", "Certifications and standards")}>
          {badges.map((b) => (
            <li key={b.name}>
              {b.href ? <a href={b.href} target="_blank" rel="noopener noreferrer">{b.src ? <img src={b.src} alt={b.name} /> : b.name}</a>
                : b.src ? <img src={b.src} alt={b.name} /> : <span>{b.name}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
