import type { CSSProperties } from "react";
import { oemLogo, sections, team, type Member } from "../data/content";
import { usePrefs } from "../lib/prefs";
import { translate } from "../lib/i18n";

const LinkedIn = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
    <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9.75h4V21H3zM9.5 9.75h3.8v1.6h.06c.53-1 1.82-2.05 3.75-2.05 4 0 4.74 2.63 4.74 6.05V21h-4v-4.9c0-1.17-.02-2.67-1.63-2.67s-1.88 1.27-1.88 2.58V21h-4z" />
  </svg>
);

const paras = (s?: string) => (s ?? "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

function Photo({ m, cls = "" }: { m: Member; cls?: string }) {
  return (
    <div className={`avatar ${cls}`}>
      <img src={m.photo} alt={m.name} loading="lazy" />
    </div>
  );
}

function Certs({ m }: { m: Member }) {
  if (!m.certs?.length) return null;
  return (
    <ul className="certs" aria-label={translate("team.certs", "Certifications")}>
      {m.certs.map((c) => {
        const logo = oemLogo(c.vendor, c.logo);
        return (
          <li key={c.vendor} style={{ ["--c" as string]: c.color } as CSSProperties}>
            {logo ? <img className="oem" src={logo} alt="" width={26} height={26} loading="lazy" /> : <i aria-hidden="true">{c.vendor[0]}</i>}
            <span><b>{c.vendor}</b><small>{translate("team.certified", "Certified")}</small></span>
          </li>
        );
      })}
    </ul>
  );
}

function Partner({ m }: { m: Member }) {
  return (
    <article className="partner-card reveal tilt">
      <Photo m={m} cls="avatar-lg" />
      <h3>{m.linkedin ? <a href={m.linkedin} target="_blank" rel="noopener noreferrer">{m.name}</a> : m.name}</h3>
      <p className="role-badge">{m.role}</p>
      <Certs m={m} />
      {paras(m.bio).map((p, i) => <p key={i} className="partner-bio-text">{p}</p>)}
      {!!m.skills?.length && <ul className="chips skills">{m.skills.map((s) => <li key={s}>{s}</li>)}</ul>}
      {m.linkedin && (
        <a className="in-btn" href={m.linkedin} target="_blank" rel="noopener noreferrer">
          <LinkedIn /> {translate("team.connect", "Connect on LinkedIn")}
        </a>
      )}
    </article>
  );
}

function Founder({ m }: { m: Member }) {
  return (
    <article className="founder reveal">
      <Photo m={m} cls="avatar-xl" />
      <div className="founder-body">
        <p className="role-badge">{m.role}</p>
        <h3>{m.linkedin ? <a href={m.linkedin} target="_blank" rel="noopener noreferrer">{m.name}</a> : m.name}</h3>
        <Certs m={m} />
        {paras(m.bio).map((p, i) => <p key={i} className="bio">{p}</p>)}
        {!!m.skills?.length && <ul className="chips skills left">{m.skills.map((s) => <li key={s}>{s}</li>)}</ul>}
        <div className="founder-actions">
          {m.linkedin && (
            <a className="in-btn" href={m.linkedin} target="_blank" rel="noopener noreferrer"><LinkedIn /> LinkedIn</a>
          )}
          {m.linkUrl && (
            <a className="in-btn ghost" href={m.linkUrl} target="_blank" rel="noopener noreferrer">▶ {m.linkLabel || translate("off.more", "Learn more")}</a>
          )}
        </div>
      </div>
    </article>
  );
}

export default function Team() {
  const { t } = usePrefs();
  const s = sections.team;
  const featured = team.filter((m) => m.featured);
  const others = team.filter((m) => !m.featured);
  return (
    <section id="team" className="team">
      <h2>{t("team.h", s.heading)}</h2>
      {featured.map((m) => <Founder key={m.name} m={m} />)}
      {others.length > 0 && (
        <>
          <h4 className="sub-h reveal">{t("team.partners", s.partnersHeading)}</h4>
          <div className="partner-grid">
            {others.map((m) => <Partner key={m.name} m={m} />)}
          </div>
        </>
      )}
    </section>
  );
}
