import { useState } from "react";
import { img, nav } from "../data/content";
import { useActiveSection } from "../hooks";
import { lp } from "../lib/i18n";
import { LANGS } from "../../shared/langs";
import { usePrefs } from "../lib/prefs";

const ids = nav.map((n) => n.id);

export default function Header({ onHome, section }: { onHome: boolean; section?: "insights" | null }) {
  const [open, setOpen] = useState(false);
  const active = useActiveSection(ids);
  const { theme, toggleTheme, lang, setLang, t } = usePrefs();
  const link = (id: string) => (onHome ? { href: `#${id}` } : { href: lp(`/#${id}`), "data-route": "" });
  const close = () => setOpen(false);

  return (
    <header className="site-header">
      <a className="logo" {...(onHome ? { href: "#home" } : { href: lp("/"), "data-route": "" })} aria-label={t("hdr.home", "DuRuVaSa CloudSec home")}>
        <img src={img.logo} alt="DuRuVaSa CloudSec" width={195} height={146} />
      </a>
      <button className="burger" aria-label={t("hdr.menu", "Toggle menu")} aria-expanded={open} aria-controls="primary-nav" onClick={() => setOpen((o) => !o)}>
        <span /><span /><span />
      </button>
      <nav id="primary-nav" className={open ? "open" : ""} aria-label={t("hdr.primary", "Primary")}>
        {nav.map((n) => (
          <a key={n.id} {...link(n.id)} className={onHome && active === n.id ? "active" : ""} onClick={close}>
            {t(`nav.${n.id}`, n.label)}
          </a>
        ))}
        <a href={lp("/insights")} data-route className={section === "insights" ? "active" : ""} onClick={close}>{t("hdr.insights", "Insights")}</a>
        <a className="nav-cta" {...link("contact")} onClick={close}>{t("hdr.cta", "Get in touch")}</a>
        <span className="tools">
          <label className="lang">
            <span className="sr">{t("hdr.language", "Language")}</span>
            <select value={lang} onChange={(e) => setLang(e.target.value as typeof lang)}>
              {LANGS.map((l) => <option key={l.code} value={l.code} lang={l.code}>{l.native}</option>)}
            </select>
          </label>
          <button type="button" className="theme-btn" onClick={toggleTheme} aria-label={theme === "dark" ? t("hdr.toLight", "Switch to light theme") : t("hdr.toDark", "Switch to dark theme")}>
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </span>
      </nav>
    </header>
  );
}
