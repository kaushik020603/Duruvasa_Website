import { useRef, useState, type FormEvent } from "react";
import { resources, sections } from "../data/content";
import { lp } from "../lib/i18n";
import { usePrefs } from "../lib/prefs";

type State = "idle" | "sending" | "done" | "error";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Gated download: the visitor trades an email address (with consent) for a time-limited download link. */
export default function ResourceSection() {
  const { t } = usePrefs();
  const res = resources[0];
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [trap, setTrap] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const opened = useRef(Date.now());
  if (!res) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!EMAIL.test(email.trim())) errs.email = t("val.email", "Enter a valid email");
    if (!consent) errs.consent = t("res.consentErr", "Please tick the box to continue");
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setState("sending"); setMessage("");
    try {
      const r = await fetch("/api/subscribe", {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email: email.trim(), name: name.trim(), resource: res.slug, consent: true, website: trap, elapsed: Date.now() - opened.current }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (data.errors) setErrors(data.errors);
        throw new Error(data.error || t("res.error", "Something went wrong."));
      }
      setLink(data.downloadUrl);
      setState("done");
      // Start the download straight away; the button below is the fallback.
      const a = document.createElement("a");
      a.href = data.downloadUrl; a.download = res.fileName || ""; document.body.appendChild(a); a.click(); a.remove();
    } catch (err) {
      setState("error");
      setMessage((err as Error).message);
    }
  }

  return (
    <section id="resources" className="resource" aria-labelledby="resource-h">
      <div className="resource-inner">
        <div className="resource-copy reveal">
          <p className="eyebrow">{sections.resources.eyebrow}</p>
          <h2 id="resource-h">{sections.resources.heading}</h2>
          <p className="resource-desc">{res.description}</p>
          <ul className="resource-points">{res.bullets.map((b, i) => <li key={b + i}>{b}</li>)}</ul>
        </div>

        <div className="resource-card reveal">
          <div className="pdf-cover" aria-hidden="true">
            <i /><b>Cloud Security<br />Checklist</b><small>DuRuVaSa CloudSec</small><span>{t("res.pdf", "PDF · 3 pages")}</span>
          </div>
          {state === "done" ? (
            <div className="resource-done" role="status">
              <h3>{t("res.doneH", "Your checklist is on its way")}</h3>
              <p>{t("res.doneP", "The download should start automatically. If it does not, use the button. We have also emailed you the link.")}</p>
              <a className="btn-light" href={link} download={res.fileName || undefined}>⬇ {t("res.download", "Download the PDF")}</a>
            </div>
          ) : (
            <form onSubmit={submit} noValidate>
              <label>
                <span className="sr">{t("res.nameL", "Your name")}</span>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("res.name", "Your name (optional)")} autoComplete="name" maxLength={80} />
              </label>
              <label>
                <span className="sr">{t("res.emailL", "Work email")}</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("res.email", "Your email address")} autoComplete="email" aria-invalid={!!errors.email} />
                {errors.email && <span className="err" role="alert">{errors.email}</span>}
              </label>
              <label className="hp" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} /></label>
              <label className="consent">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} aria-invalid={!!errors.consent} />
                <span>{t("res.consent", "I agree to receive this checklist and occasional security tips from DuRuVaSa CloudSec. I can unsubscribe at any time. See our")} <a href={lp("/privacy-policy")} data-route>{t("res.privacy", "privacy policy")}</a>.</span>
              </label>
              {errors.consent && <span className="err" role="alert">{errors.consent}</span>}
              <button type="submit" className="btn-light magnetic" disabled={state === "sending"}>{state === "sending" ? t("res.sending", "Preparing…") : t("res.send", "Send me the checklist")}</button>
              {state === "error" && <p className="form-status err" role="alert">{message}</p>}
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
