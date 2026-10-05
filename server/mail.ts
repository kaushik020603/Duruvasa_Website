import { config } from "./config.js";

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);

interface Mail { to: string[]; subject: string; html: string; replyTo?: string }

/** Sends through Resend when RESEND_API_KEY is set; otherwise logs and carries on. Never throws into a request. */
export async function sendMail(m: Mail): Promise<void> {
  if (!config.resendKey) { console.log(`mail: skipped (no RESEND_API_KEY) -> ${m.to.join(", ")}: ${m.subject}`); return; }
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: config.mailFrom, to: m.to, subject: m.subject, html: m.html, reply_to: m.replyTo }),
    });
    if (!r.ok) console.warn(`mail: Resend responded ${r.status}`);
  } catch (e) {
    console.warn("mail: send failed", (e as Error).message);
  }
}
