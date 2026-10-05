import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { img, prettyPhone, sections, SITE, siteInfo } from "../data/content";
import { buildIcs, nextWeekdays, SLOTS, validate, type Errors, type Values } from "../lib/validate";
import { onPrefill, takePrefill } from "../lib/bus";
import { usePrefs } from "../lib/prefs";

type Status = "idle" | "sending" | "sent" | "error";
type Mode = "message" | "book";
type FormValues = Values & { phone: string };

const empty: FormValues = { first: "", last: "", email: "", message: "", phone: "" };

/** Enquiries are stored in the CMS database (admin > Enquiries). VITE_CONTACT_ENDPOINT can point elsewhere (e.g. Formspree). */
const ENDPOINT = (import.meta.env.VITE_CONTACT_ENDPOINT as string | undefined) || "/api/enquiries";
const FALLBACK_TO = (import.meta.env.VITE_CONTACT_EMAIL as string | undefined) || SITE.email;
const PHONE = /^\+?[0-9 ()-]{6,30}$/;

const dayLabel = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

export default function Contact() {
  const { t } = usePrefs();
  const [mode, setMode] = useState<Mode>("message");
  const [v, setV] = useState<FormValues>(empty);
  const [errors, setErrors] = useState<Errors & { phone?: string }>({});
  const [status, setStatus] = useState<Status>("idle");
  const [serverMsg, setServerMsg] = useState("");
  const [day, setDay] = useState(0);
  const [slot, setSlot] = useState<string | null>(null);
  const [slotErr, setSlotErr] = useState(false);
  const [ics, setIcs] = useState<string | null>(null);
  const [trap, setTrap] = useState("");
  const opened = useRef(Date.now());
  const days = useMemo(() => nextWeekdays(new Date(), 7), []);

  useEffect(() => {
    const p = takePrefill();
    if (p) setV((x) => ({ ...x, message: p }));
    return onPrefill((m) => { setMode("message"); setV((x) => ({ ...x, message: m })); });
  }, []);

  const set = (k: keyof FormValues) => (e: { target: { value: string } }) => setV((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Errors & { phone?: string } = validate(mode === "book" && !v.message.trim() ? { ...v, message: "Consultation request" } : v);
    if (mode === "book") delete errs.message;
    if (v.phone.trim() && !PHONE.test(v.phone.trim())) errs.phone = "Enter a valid phone number";
    setErrors(errs);
    const noSlot = mode === "book" && !slot;
    setSlotErr(noSlot);
    if (Object.keys(errs).length || noSlot) return;

    const when = mode === "book" ? `${dayLabel(days[day])} at ${slot} (visitor local time)` : null;
    const payload = {
      type: mode === "book" ? "consultation" : "message",
      first: v.first.trim(), last: v.last.trim(), email: v.email.trim(), phone: v.phone.trim(),
      message: v.message.trim() || "Consultation request", preferredTime: when ?? "",
      source: "website", website: trap, elapsed: Date.now() - opened.current,
    };
    setStatus("sending"); setServerMsg("");
    try {
      const r = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        if (data.errors) setErrors(data.errors);
        throw new Error(data.error || String(r.status));
      }
      if (mode === "book" && slot) setIcs(buildIcs(days[day], slot, `${payload.first} ${payload.last}`));
      setStatus("sent");
      setV(empty); setSlot(null); opened.current = Date.now();
    } catch (err) {
      setServerMsg(err instanceof Error && !/^\d+$/.test(err.message) ? err.message : "");
      setStatus("error");
    }
  }

  const downloadIcs = () => {
    if (!ics) return;
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const a = document.createElement("a");
    a.href = url; a.download = "consultation.ics"; a.click();
    URL.revokeObjectURL(url);
  };

  const field = (k: keyof FormValues) => ({
    value: v[k], onChange: set(k),
    "aria-invalid": !!errors[k], "aria-describedby": errors[k] ? `err-${k}` : undefined,
  });
  const err = (k: keyof FormValues) => errors[k] ? <span id={`err-${k}`} className="err" role="alert">{errors[k]}</span> : null;

  return (
    <section id="contact" className="contact" style={{ backgroundImage: `url(${img.contactBg})` }}>
      <form onSubmit={submit} noValidate>
        <h2>{t("contact.h", sections.contact.heading)}</h2>
        <div className="tabs" role="tablist" aria-label="Contact method">
          {(["message", "book"] as const).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? "on" : ""}
              onClick={() => { setMode(m); setStatus("idle"); setIcs(null); }}>
              {m === "message" ? "Send a message" : "Book a consultation"}
            </button>
          ))}
        </div>

        {mode === "book" && (
          <div className="book">
            <p className="hint">Pick a preferred day and time. We will confirm by email (30 min).</p>
            <div className="chips-row" role="radiogroup" aria-label="Day">
              {days.map((d, i) => (
                <button key={i} type="button" role="radio" aria-checked={day === i} className={day === i ? "chip on" : "chip"} onClick={() => setDay(i)}>{dayLabel(d)}</button>
              ))}
            </div>
            <div className="chips-row" role="radiogroup" aria-label="Time">
              {SLOTS.map((s) => (
                <button key={s} type="button" role="radio" aria-checked={slot === s} className={slot === s ? "chip on" : "chip"} onClick={() => { setSlot(s); setSlotErr(false); }}>{s}</button>
              ))}
            </div>
            {slotErr && <span className="err" role="alert">Choose a time slot</span>}
          </div>
        )}

        <div className="row">
          <label>
            <span className="sr">First name</span>
            <input placeholder={t("contact.first", "Enter your first name")} autoComplete="given-name" {...field("first")} />
            {err("first")}
          </label>
          <label>
            <span className="sr">Last name</span>
            <input placeholder={t("contact.last", "Enter your last name")} autoComplete="family-name" {...field("last")} />
            {err("last")}
          </label>
        </div>
        <label>
          <span className="sr">Email</span>
          <input type="email" placeholder={t("contact.email", "Enter your email")} autoComplete="email" {...field("email")} />
          {err("email")}
        </label>
        <label>
          <span className="sr">Phone (optional)</span>
          <input type="tel" placeholder="Phone (optional)" autoComplete="tel" {...field("phone")} />
          {err("phone")}
        </label>
        <label>
          <span className="sr">Message</span>
          <textarea rows={mode === "book" ? 3 : 5} placeholder={mode === "book" ? "Anything we should know? (optional)" : t("contact.message", "Give a detailed example")} {...field("message")} />
          {mode === "message" && err("message")}
        </label>
        <label className="hp" aria-hidden="true">
          Website<input tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
        </label>
        <button type="submit" className="btn-light magnetic" disabled={status === "sending"}>
          {status === "sending" ? t("contact.sending", "Sending…") : mode === "book" ? "Request consultation" : t("contact.submit", "Submit")}
        </button>
        <p className="form-status" role="status">
          {status === "sent" && t("contact.sent", "Thanks! We will get back to you shortly.")}
          {status === "error" && <>{serverMsg || t("contact.error", "Something went wrong. Please try again.")} <a className="link-btn" href={`mailto:${FALLBACK_TO}`}>{FALLBACK_TO}</a></>}
          {status === "sent" && ics && <> <button type="button" className="link-btn" onClick={downloadIcs}>Add to calendar</button></>}
        </p>
      </form>
      <p className="contact-mail">
        {sections.contact.emailNote} <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
        {siteInfo.phone && <> · <a href={`tel:${siteInfo.phone}`}>{prettyPhone(siteInfo.phone)}</a></>}
      </p>
    </section>
  );
}
