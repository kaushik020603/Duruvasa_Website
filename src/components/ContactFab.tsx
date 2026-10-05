import { prettyPhone, siteInfo } from "../data/content";

const digits = (p: string) => p.replace(/[^\d]/g, "");

const Phone = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
    <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" />
  </svg>
);
const WhatsApp = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
    <path d="M12.04 2a9.9 9.9 0 0 0-8.5 14.96L2 22l5.2-1.5A9.93 9.93 0 1 0 12.04 2zm0 18.1a8.16 8.16 0 0 1-4.16-1.14l-.3-.18-3.08.9.92-3-.2-.31a8.2 8.2 0 1 1 6.82 3.73zm4.5-6.14c-.25-.12-1.47-.72-1.7-.8-.23-.09-.4-.12-.56.12-.17.25-.64.8-.78.97-.15.17-.29.19-.54.06a6.7 6.7 0 0 1-3.34-2.92c-.25-.43.25-.4.72-1.33.08-.17.04-.31-.02-.43-.06-.12-.56-1.35-.77-1.85-.2-.48-.41-.42-.56-.43h-.48a.92.92 0 0 0-.67.31c-.23.25-.88.86-.88 2.1s.9 2.44 1.03 2.6c.12.17 1.77 2.7 4.3 3.79.6.26 1.07.42 1.44.53.6.19 1.15.17 1.58.1.48-.07 1.47-.6 1.68-1.18.2-.58.2-1.08.14-1.18-.06-.1-.23-.17-.48-.29z" />
  </svg>
);

/** Mobile: sticky Call + WhatsApp bar. Desktop: a single WhatsApp bubble. Numbers come from Site settings in the CMS. */
export default function ContactFab() {
  const { phone, phoneLabel, whatsapp, whatsappMessage } = siteInfo;
  if (!phone && !whatsapp) return null;
  const wa = whatsapp ? `https://wa.me/${digits(whatsapp)}?text=${encodeURIComponent(whatsappMessage || "")}` : "";

  return (
    <div className="fab" role="group" aria-label="Contact us quickly">
      {phone && (
        <a className="fab-call" href={`tel:${phone}`} aria-label={`Call now: ${phoneLabel ? `${phoneLabel}, ` : ""}${prettyPhone(phone)}`}>
          <Phone /><span>Call now</span>
        </a>
      )}
      {wa && (
        <a className="fab-wa" href={wa} target="_blank" rel="noopener noreferrer" aria-label="Chat with us on WhatsApp (opens in a new tab)">
          <WhatsApp /><span>WhatsApp</span>
        </a>
      )}
    </div>
  );
}
