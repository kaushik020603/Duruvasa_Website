import { img, legal, prettyPhone, services, SITE, siteInfo } from "../data/content";
import { lp } from "../lib/i18n";
import { LANGS } from "../../shared/langs";
import { switchLangUrl } from "../lib/router";
import { usePrefs } from "../lib/prefs";

const Icon = ({ d, size = 18 }: { d: string; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true"><path d={d} /></svg>
);
const MAIL = "M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm9 7.2L4.5 7v1.9l7.5 5.2 7.5-5.2V7z";
const PHONE = "M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z";
const WA = "M12.04 2a9.9 9.9 0 0 0-8.5 14.96L2 22l5.2-1.5A9.93 9.93 0 1 0 12.04 2zm0 18.1a8.16 8.16 0 0 1-4.16-1.14l-.3-.18-3.08.9.92-3-.2-.31a8.2 8.2 0 1 1 6.82 3.73zm4.5-6.14c-.25-.12-1.47-.72-1.7-.8-.23-.09-.4-.12-.56.12-.17.25-.64.8-.78.97-.15.17-.29.19-.54.06a6.7 6.7 0 0 1-3.34-2.92c-.25-.43.25-.4.72-1.33.08-.17.04-.31-.02-.43-.06-.12-.56-1.35-.77-1.85-.2-.48-.41-.42-.56-.43h-.48a.92.92 0 0 0-.67.31c-.23.25-.88.86-.88 2.1s.9 2.44 1.03 2.6c.12.17 1.77 2.7 4.3 3.79.6.26 1.07.42 1.44.53.6.19 1.15.17 1.58.1.48-.07 1.47-.6 1.68-1.18.2-.58.2-1.08.14-1.18-.06-.1-.23-.17-.48-.29z";
const IN = "M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9.75h4V21H3zM9.5 9.75h3.8v1.6h.06c.53-1 1.82-2.05 3.75-2.05 4 0 4.74 2.63 4.74 6.05V21h-4v-4.9c0-1.17-.02-2.67-1.63-2.67s-1.88 1.27-1.88 2.58V21h-4z";

const digits = (p: string) => p.replace(/[^\d]/g, "");

export default function Footer() {
  const { t, lang } = usePrefs();
  const wa = siteInfo.whatsapp ? `https://wa.me/${digits(siteInfo.whatsapp)}?text=${encodeURIComponent(siteInfo.whatsappMessage || "")}` : "";
  return (
    <footer className="site-footer" style={{ ["--foot-bg" as string]: `url(${img.footerBg})` }}>
      <div className="foot-cta">
        <div>
          <h2>{t("foot.ctaH", "Ready to secure your cloud?")}</h2>
          <p>{t("foot.ctaP", "Talk to our team about threat detection, compliance and 24/7 monitoring.")}</p>
        </div>
        <div className="foot-cta-actions">
          <a className="foot-btn primary" href={lp("/#contact")} data-route>{t("foot.book", "Book a consultation")}</a>
          {wa && <a className="foot-btn" href={wa} target="_blank" rel="noopener noreferrer"><Icon d={WA} /> {t("foot.waUs", "WhatsApp us")}</a>}
        </div>
      </div>

      <div className="foot-grid">
        <section className="foot-brand" aria-label={t("foot.aboutLabel", "About")}>
          <a className="foot-logo" href={lp("/")} data-route aria-label={t("hdr.home", "DuRuVaSa CloudSec home")}><img src={img.logo} alt={SITE.name} width={150} height={112} loading="lazy" /></a>
          <p>{siteInfo.footerNote}</p>
          {siteInfo.linkedin && (
            <a className="foot-social" href={siteInfo.linkedin} target="_blank" rel="noopener noreferrer" aria-label={t("foot.linkedin", "LinkedIn (opens in a new tab)")}><Icon d={IN} size={20} /></a>
          )}
        </section>

        <nav aria-label={t("foot.services", "Services")}>
          <h3>{t("foot.services", "Services")}</h3>
          <ul>
            {services.map((s) => <li key={s.slug}><a href={lp(`/services/${s.slug}`)} data-route>{s.title}</a></li>)}
          </ul>
        </nav>

        <nav aria-label={t("foot.company", "Company")}>
          <h3>{t("foot.company", "Company")}</h3>
          <ul>
            <li><a href={lp("/#about")} data-route>{t("foot.about", "About us")}</a></li>
            <li><a href={lp("/#team")} data-route>{t("foot.team", "Team")}</a></li>
            <li><a href={lp("/#partners")} data-route>{t("foot.partners", "Partners")}</a></li>
            <li><a href={lp("/insights")} data-route>{t("hdr.insights", "Insights")}</a></li>
            <li><a href={lp("/#resources")} data-route>{t("foot.checklist", "Free security checklist")}</a></li>
            <li><a href={lp("/#quiz")} data-route>{t("foot.quiz", "Cloud security check")}</a></li>
          </ul>
        </nav>

        <section aria-label={t("foot.contact", "Contact")}>
          <h3>{t("foot.contact", "Contact")}</h3>
          <ul className="foot-contact">
            <li><Icon d={MAIL} /><a href={`mailto:${SITE.email}`}>{SITE.email}</a></li>
            {siteInfo.phone && <li><Icon d={PHONE} /><a href={`tel:${siteInfo.phone}`}>{prettyPhone(siteInfo.phone)}{siteInfo.phoneLabel ? <small>{siteInfo.phoneLabel}</small> : null}</a></li>}
            {wa && <li><Icon d={WA} /><a href={wa} target="_blank" rel="noopener noreferrer">{t("foot.waNum", "WhatsApp")} {prettyPhone(siteInfo.whatsapp)}</a></li>}
            <li><a className="foot-link-btn" href={lp("/#contact")} data-route>{t("foot.send", "Send us a message")} →</a></li>
          </ul>
        </section>
      </div>

      <div className="foot-bottom">
        <p suppressHydrationWarning>© {new Date().getFullYear()} {SITE.name}. {t("foot.rights", "All rights reserved.")}</p>
        <ul aria-label={t("foot.legal", "Legal")}>
          {legal.map((l) => <li key={l.slug}><a href={lp(`/${l.slug}`)} data-route>{l.title}</a></li>)}
        </ul>
        <ul className="foot-langs" aria-label={t("hdr.language", "Language")}>
          {LANGS.map((l) => (
            <li key={l.code}>
              <a href={switchLangUrl(l.code)} hrefLang={l.code} lang={l.code} aria-current={l.code === lang ? "true" : undefined}>{l.native}</a>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
