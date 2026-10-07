import type { CSSProperties } from "react";
import { partners, sections } from "../data/content";
import { usePrefs } from "../lib/prefs";

/** Revolving carousel of identical-size, colour-coded partner cards. Pauses on hover/focus. */
export default function Partners() {
  const { t } = usePrefs();
  if (!partners.length) return null;
  // Repeat enough times that one half of the track always overflows the widest screens.
  const reps = Math.max(2, Math.ceil(12 / partners.length));
  const half = Array.from({ length: reps }, () => partners).flat();
  const track = [...half, ...half];

  return (
    <section id="partners" className="partners" aria-labelledby="partners-h">
      <div className="blob b1" aria-hidden="true" />
      <div className="blob b2" aria-hidden="true" />
      <p className="eyebrow dark">{sections.partners.eyebrow}</p>
      <h2 id="partners-h">{t("partners.h", sections.partners.heading)}</h2>
      <p className="partners-sub">{sections.partners.sub}</p>
      <div className="carousel">
        <div className="carousel-track">
          {track.map((p, i) => {
            const copy = i >= partners.length; // only the first set is exposed to assistive tech
            return (
              <a
                key={`${p.name}-${i}`}
                className="partner-card-link"
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ ["--c" as string]: p.color } as CSSProperties}
                aria-hidden={copy ? true : undefined}
                tabIndex={copy ? -1 : 0}
              >
                <span className="logo-box"><img src={p.src} alt={copy ? "" : `${p.name} logo`} loading="lazy" /></span>
                <b>{p.name}</b>
                <small>{p.tagline}</small>
                <span className="visit">Visit website <i aria-hidden="true">↗</i><span className="sr"> of {p.name} (opens in a new tab)</span></span>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
