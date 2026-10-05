import { badges, testimonials } from "../data/content";

/** Both lists are edited in src/content/site.json. Nothing renders until real entries are added. */
export default function Trust() {
  if (!testimonials.length && !badges.length) return null;
  return (
    <section className="trust" aria-label="Trust and credentials">
      {testimonials.length > 0 && (
        <>
          <h2>What clients say</h2>
          <div className="quotes">
            {testimonials.map((t) => (
              <figure key={t.name + t.quote} className="reveal">
                <blockquote>“{t.quote}”</blockquote>
                <figcaption><b>{t.name}</b>, {t.role}{t.company ? `, ${t.company}` : ""}</figcaption>
              </figure>
            ))}
          </div>
        </>
      )}
      {badges.length > 0 && (
        <ul className="badges" aria-label="Certifications and standards">
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
