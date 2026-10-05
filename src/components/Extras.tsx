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
  const [show, setShow] = useState(false);
  useEffect(() => {
    const on = () => setShow(window.scrollY > 700);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <button className={`to-top${show ? " show" : ""}`} aria-label="Back to top" tabIndex={show ? 0 : -1}
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>↑</button>
  );
}

export function SkipLink() {
  return <a className="skip" href="#main">Skip to content</a>;
}

const RAIL = [
  ["home", "Home"], ["about", "About"], ["team", "Team"], ["features", "Advantages"], ["services-list", "Services"],
  ["process", "Process"], ["quiz", "Security check"], ["resources", "Free checklist"], ["contact", "Contact"],
] as const;
const RAIL_IDS = RAIL.map((r) => r[0]);

export function SectionRail() {
  const active = useActiveSection(RAIL_IDS);
  return (
    <nav className="rail" aria-label="Page sections">
      {RAIL.map(([id, label]) => (
        <a key={id} href={`#${id}`} className={active === id ? "on" : ""} aria-label={label} title={label}><i /></a>
      ))}
    </nav>
  );
}

/** First-visit intro. Skippable by click or key; shown once per session. */
export function Loader() {
  const [show, setShow] = useState(() => {
    try {
      if (sessionStorage.getItem("intro")) return false;
      sessionStorage.setItem("intro", "1");
    } catch { /* storage blocked: still show once */ }
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  const [leaving, setLeaving] = useState(false);
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
    <div className={`loader${leaving ? " leaving" : ""}`} role="status" aria-label="Loading">
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
  const { consent, setConsent } = usePrefs();
  const configured = !!import.meta.env.VITE_PLAUSIBLE_DOMAIN;
  if (consent || !configured) return null;
  return (
    <div className="cookie" role="dialog" aria-label="Analytics consent">
      <p>We would like to use privacy-friendly analytics (no cookies, no cross-site tracking) to understand how the site is used.</p>
      <div>
        <button type="button" className="btn-light" onClick={() => setConsent("granted")}>Accept</button>
        <button type="button" className="btn-light ghost" onClick={() => setConsent("denied")}>Decline</button>
      </div>
    </div>
  );
}
