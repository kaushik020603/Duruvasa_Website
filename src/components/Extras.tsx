import { useEffect, useState } from "react";
import { img } from "../data/content";
import { useActiveSection } from "../hooks";
import { usePrefs } from "../lib/prefs";

export function ScrollProgress() {
  const [p, setP] = useState(0);
  useEffect(() => {
    const on = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      setP(h > 0 ? window.scrollY / h : 0);
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return <div className="progress" style={{ transform: `scaleX(${p})` }} aria-hidden="true" />;
}

export function BackToTop() {
  const { t } = usePrefs();
  const [show, setShow] = useState(false);
  useEffect(() => {
    const on = () => setShow(window.scrollY > 700);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <button className={`to-top${show ? " show" : ""}`} aria-label={t("totop", "Back to top")} tabIndex={show ? 0 : -1}
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>↑</button>
  );
}

export function SkipLink() {
  const { t } = usePrefs();
  return <a className="skip" href="#main">{t("skip", "Skip to content")}</a>;
}

const RAIL = [
  ["home", "Home"], ["about", "About"], ["team", "Team"], ["features", "Advantages"], ["services-list", "Services"],
  ["process", "Process"], ["quiz", "Security check"], ["resources", "Free checklist"], ["contact", "Contact"],
] as const;
const RAIL_IDS = RAIL.map((r) => r[0]);

export function SectionRail() {
  const active = useActiveSection(RAIL_IDS);
  const { t } = usePrefs();
  return (
    <nav className="rail" aria-label={t("rail.label", "Page sections")}>
      {RAIL.map(([id, label]) => (
        <a key={id} href={`#${id}`} className={active === id ? "on" : ""} aria-label={t(`rail.${id}`, label)} title={t(`rail.${id}`, label)}><i /></a>
      ))}
    </nav>
  );
}

/** First-visit intro. Skippable by click or key; shown once per session. */
export function Loader() {
  // Rendered into the server HTML so the first paint matches; theme-init.js and CSS hide it for repeat visits and
  // reduced-motion users before anything paints, and this effect then removes it from the page.
  const [show, setShow] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const { t } = usePrefs();
  useEffect(() => {
    let seen = false;
    try {
      seen = !!sessionStorage.getItem("intro");
      sessionStorage.setItem("intro", "1");
    } catch { /* storage blocked: still show once */ }
    if (seen || window.matchMedia("(prefers-reduced-motion: reduce)").matches) setShow(false);
  }, []);
  useEffect(() => {
    if (!show) return;
    const done = () => { setLeaving(true); setTimeout(() => setShow(false), 500); };
    const t = setTimeout(done, 1700);
    window.addEventListener("keydown", done, { once: true });
    window.addEventListener("pointerdown", done, { once: true });
    return () => { clearTimeout(t); window.removeEventListener("keydown", done); window.removeEventListener("pointerdown", done); };
  }, [show]);
  if (!show) return null;
  return (
    <div className={`loader${leaving ? " leaving" : ""}`} role="status" aria-label={t("loading", "Loading")}>
      <div className="loader-in">
        <svg viewBox="0 0 100 120" width="84" height="100" aria-hidden="true">
          <path className="shield" d="M50 6 12 20v30c0 28 16 50 38 62 22-12 38-34 38-62V20z" fill="none" stroke="#7fcb7f" strokeWidth="3" />
          <path className="tick" d="M32 60l14 14 24-28" fill="none" stroke="#fffaf8" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <img src={img.logo} alt="" width={130} height={97} />
        <p>DuRuVaSa CloudSec</p>
      </div>
    </div>
  );
}

export function CookieBanner() {
  const { consent, setConsent, t } = usePrefs();
  const [mounted, setMounted] = useState(false); // stored consent is only known in the browser
  useEffect(() => setMounted(true), []);
  const configured = !!import.meta.env.VITE_PLAUSIBLE_DOMAIN;
  if (!mounted || consent || !configured) return null;
  return (
    <div className="cookie" role="dialog" aria-label={t("cookie.label", "Analytics consent")}>
      <p>{t("cookie.text", "We would like to use privacy-friendly analytics (no cookies, no cross-site tracking) to understand how the site is used.")}</p>
      <div>
        <button type="button" className="btn-light" onClick={() => setConsent("granted")}>{t("cookie.accept", "Accept")}</button>
        <button type="button" className="btn-light ghost" onClick={() => setConsent("denied")}>{t("cookie.decline", "Decline")}</button>
      </div>
    </div>
  );
}
