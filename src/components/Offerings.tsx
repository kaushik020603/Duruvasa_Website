import { img, offerings, sections, type IconName } from "../data/content";
import { usePrefs } from "../lib/prefs";

function Icon({ name }: { name: IconName }) {
  const common = { viewBox: "0 0 24 24", width: 18, height: 18, fill: "#fff", "aria-hidden": true } as const;
  switch (name) {
    case "spark":
      return <svg {...common}><path d="M12 2 14 10 22 12 14 14 12 22 10 14 2 12 10 10z" /></svg>;
    case "dropbox":
      return <svg {...common}><path d="m6 2 6 4-6 4-6-4zm12 0 6 4-6 4-6-4zM0 14l6-4 6 4-6 4zm18-4 6 4-6 4-6-4zm-12 9 6-4 6 4-6 4z" /></svg>;
    case "gear":
      return <svg {...common}><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm9 5v-2l-2.2-.6a7 7 0 0 0-.7-1.7l1.2-2-1.4-1.4-2 1.2a7 7 0 0 0-1.7-.7L13 3h-2l-.6 2.2a7 7 0 0 0-1.7.7l-2-1.2-1.4 1.4 1.2 2a7 7 0 0 0-.7 1.7L3 11v2l2.2.6c.2.6.4 1.2.7 1.7l-1.2 2 1.4 1.4 2-1.2c.5.3 1.1.5 1.7.7L11 21h2l.6-2.2c.6-.2 1.2-.4 1.7-.7l2 1.2 1.4-1.4-1.2-2c.3-.5.5-1.1.7-1.7z" /></svg>;
    case "ring":
      return <svg {...common}><path fillRule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 5a5 5 0 1 1 0 10 5 5 0 0 1 0-10z" /></svg>;
  }
}

export default function Offerings() {
  const { t } = usePrefs();
  return (
    <section id="services-list" className="offerings" style={{ backgroundImage: `url(${img.offeringsBg})` }}>
      <div className="off-head">
        <h2>{t("off.h", sections.offerings.heading)}</h2>
        <div>
          <h2 className="off-sub">{t("off.sub", sections.offerings.sub)}</h2>
          <p>
            {t("off.intro", sections.offerings.intro)}
          </p>
        </div>
      </div>
      <div className="off-stack">
        {offerings.map((o, i) => (
          <div key={o.title + i} className={`off-item reveal pos-${i}`}>
            <span className="off-icon"><Icon name={o.icon} /></span>
            <article>
              <h3>{o.title}</h3>
              <p>{o.text}</p>
              {o.slug && <a className="more" href={`/services/${o.slug}`} data-route>Learn more →</a>}
            </article>
          </div>
        ))}
      </div>
    </section>
  );
}
