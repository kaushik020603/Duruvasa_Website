import fs from "node:fs";
import path from "node:path";
import express, { type Router } from "express";
import { paths } from "./config.js";
import { config } from "./config.js";
import { all, get, now, run } from "./db.js";
import { esc, sendMail } from "./mail.js";
import { randomToken, RateLimiter, safeEqual, sha256 } from "./security.js";
import { requireAdmin } from "./auth.js";
import { audit, clientIp, HttpError, int, ipHash, toCsv, wrap } from "./util.js";

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const PHONE = /^\+?[0-9 ()-]{6,30}$/;
const enquiryLimiter = new RateLimiter(6, 10 * 60_000);
const subscribeLimiter = new RateLimiter(8, 10 * 60_000);
const oneLine = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, max);
const multiLine = (v: unknown, max: number) => String(v ?? "").replace(/\r\n/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);

interface ResourceDoc { slug: string; title: string; fileName: string }
const findResource = (slug: string): ResourceDoc | null => {
  const row = get<{ data: string }>("SELECT data FROM docs WHERE collection = 'resources' AND doc_key = ? AND published = 1", slug);
  return row ? (JSON.parse(row.data) as ResourceDoc) : null;
};
export const resourceFile = (slug: string) => path.join(paths.privateResources, `${slug.replace(/[^a-z0-9-]/g, "")}.pdf`);

// ------------------------------------------------------------------ public endpoints
export function publicRoutes(): Router {
  const r = express.Router();

  r.post("/enquiries", wrap(async (req, res) => {
    const b = req.body ?? {};
    // Bots fill hidden fields and submit instantly. Pretend success so they learn nothing.
    if (b.website || (typeof b.elapsed === "number" && b.elapsed < 2000)) return res.json({ ok: true });
    if (enquiryLimiter.hit(clientIp(req))) throw new HttpError(429, "Too many messages. Please try again in a few minutes.");

    const first = oneLine(b.first, 80), last = oneLine(b.last, 80), email = oneLine(b.email, 254).toLowerCase();
    const phone = oneLine(b.phone, 30), message = multiLine(b.message, 4000);
    const type = b.type === "consultation" ? "consultation" : "message";
    const when = oneLine(b.preferredTime, 120), source = oneLine(b.source, 80);
    const errors: Record<string, string> = {};
    if (!first) errors.first = "Enter your first name";
    if (!last) errors.last = "Enter your last name";
    if (!EMAIL.test(email)) errors.email = "Enter a valid email";
    if (phone && !PHONE.test(phone)) errors.phone = "Enter a valid phone number";
    if (message.length < 3) errors.message = "Please add a little more detail";
    if (Object.keys(errors).length) throw new HttpError(422, "Please check the form.", { errors });

    const t = now();
    const id = run(
      "INSERT INTO enquiries (type, first_name, last_name, email, phone, message, preferred_time, source, ip_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      type, first, last, email, phone, message, when, source, ipHash(req), t, t
    ).id;

    const label = type === "consultation" ? "Consultation request" : "Website enquiry";
    void sendMail({
      to: config.notifyTo, replyTo: email, subject: `${label} from ${first} ${last}`,
      html: `<p><b>${esc(first)} ${esc(last)}</b> &lt;${esc(email)}&gt;${phone ? ` · ${esc(phone)}` : ""}</p>${when ? `<p>Preferred time: ${esc(when)}</p>` : ""}<p>${esc(message).replace(/\n/g, "<br>")}</p><p><a href="${config.publicUrl}/admin/#/enquiries/${id}">Open in admin</a></p>`,
    });
    void sendMail({
      to: [email], subject: "We received your message",
      html: `<p>Hi ${esc(first)},</p><p>Thanks for contacting DuRuVaSa CloudSec. We have received your ${label.toLowerCase()} and will reply shortly.</p>`,
    });
    res.status(201).json({ ok: true });
  }));

  r.post("/subscribe", wrap(async (req, res) => {
    const b = req.body ?? {};
    if (b.website) return res.json({ ok: true, downloadUrl: "/" });
    if (subscribeLimiter.hit(clientIp(req))) throw new HttpError(429, "Too many requests. Please try again in a few minutes.");
    const email = oneLine(b.email, 254).toLowerCase(), name = oneLine(b.name, 80), slug = oneLine(b.resource, 80);
    const errors: Record<string, string> = {};
    if (!EMAIL.test(email)) errors.email = "Enter a valid email";
    if (b.consent !== true) errors.consent = "Please tick the box to continue";
    if (Object.keys(errors).length) throw new HttpError(422, "Please check the form.", { errors });
    const resource = findResource(slug);
    if (!resource || !fs.existsSync(resourceFile(slug))) throw new HttpError(404, "That download is not available.");

    const t = now();
    run(`INSERT INTO subscribers (email, name, source, consent_at, created_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(email) DO UPDATE SET status = 'active', consent_at = excluded.consent_at, name = CASE WHEN excluded.name != '' THEN excluded.name ELSE subscribers.name END`,
      email, name, slug, t, t);
    const sub = get<{ id: number }>("SELECT id FROM subscribers WHERE email = ?", email)!;
    const token = randomToken(32);
    run("INSERT INTO downloads (token_hash, subscriber_id, resource, expires_at, created_at) VALUES (?, ?, ?, ?, ?)", sha256(token), sub.id, slug, t + 7 * 86_400_000, t);
    const downloadUrl = `/api/resources/${slug}/download?token=${token}`;
    void sendMail({
      to: [email], subject: `Your download: ${resource.title}`,
      html: `<p>Hi${name ? ` ${esc(name)}` : ""},</p><p>Thanks for your interest. Here is your copy of <b>${esc(resource.title)}</b>:</p><p><a href="${config.publicUrl}${downloadUrl}">Download the PDF</a> (link valid for 7 days)</p><p>If you would like help acting on it, just reply to this email.</p>`,
    });
    res.status(201).json({ ok: true, downloadUrl, fileName: resource.fileName });
  }));

  r.get("/resources/:slug/download", wrap(async (req, res) => {
    const slug = String(req.params.slug);
    const token = String(req.query.token ?? "");
    const row = get<{ token_hash: string; resource: string; expires_at: number; uses: number }>("SELECT * FROM downloads WHERE token_hash = ?", sha256(token));
    if (!row || !safeEqual(row.token_hash, sha256(token)) || row.resource !== slug || row.expires_at < now() || row.uses >= 10) {
      throw new HttpError(403, "This download link is invalid or has expired. Request a new one from the website.");
    }
    const file = resourceFile(slug);
    if (!fs.existsSync(file)) throw new HttpError(404, "File not found.");
    run("UPDATE downloads SET uses = uses + 1 WHERE token_hash = ?", row.token_hash);
    const name = (findResource(slug)?.fileName || `${slug}.pdf`).replace(/[^A-Za-z0-9._-]/g, "_");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    res.setHeader("Cache-Control", "no-store");
    fs.createReadStream(file).pipe(res);
  }));

  return r;
}

// ------------------------------------------------------------------ admin endpoints
interface EnqRow {
  id: number; type: string; first_name: string; last_name: string; email: string; phone: string; message: string;
  preferred_time: string; status: string; notes: string; source: string; created_at: number; updated_at: number;
}
const enq = (r: EnqRow) => ({
  id: r.id, type: r.type, first: r.first_name, last: r.last_name, email: r.email, phone: r.phone, message: r.message,
  preferredTime: r.preferred_time, status: r.status, notes: r.notes, source: r.source, createdAt: r.created_at, updatedAt: r.updated_at,
});
const STATUSES = ["new", "in_progress", "done", "spam"];

function enquiryFilter(q: Record<string, unknown>) {
  const where: string[] = [], params: unknown[] = [];
  const status = String(q.status ?? ""), type = String(q.type ?? ""), text = String(q.q ?? "").trim();
  if (STATUSES.includes(status)) { where.push("status = ?"); params.push(status); }
  if (type === "message" || type === "consultation") { where.push("type = ?"); params.push(type); }
  if (text) {
    where.push("(first_name LIKE ? ESCAPE '\\' OR last_name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR message LIKE ? ESCAPE '\\')");
    const like = `%${text.replace(/[\\%_]/g, "\\$&")}%`;
    params.push(like, like, like, like);
  }
  return { sql: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

export function inboxRoutes(): Router {
  const r = express.Router();

  r.get("/enquiries", (req, res) => {
    const { sql, params } = enquiryFilter(req.query);
    const page = int(req.query.page, 1, 1), size = int(req.query.size, 20, 5, 100);
    const total = get<{ n: number }>(`SELECT COUNT(*) n FROM enquiries ${sql}`, ...params)!.n;
    const items = all<EnqRow>(`SELECT * FROM enquiries ${sql} ORDER BY created_at DESC LIMIT ? OFFSET ?`, ...params, size, (page - 1) * size).map(enq);
    const counts = Object.fromEntries(all<{ status: string; n: number }>("SELECT status, COUNT(*) n FROM enquiries GROUP BY status").map((c) => [c.status, c.n]));
    res.json({ items, total, page, size, counts });
  });

  r.get("/enquiries/export.csv", (req, res) => {
    const { sql, params } = enquiryFilter(req.query);
    const rows = all<EnqRow>(`SELECT * FROM enquiries ${sql} ORDER BY created_at DESC LIMIT 20000`, ...params);
    audit(req.user!.email, "enquiries.export", "enquiries", `${rows.length} rows`, req);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="enquiries-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send("﻿" + toCsv([
      ["ID", "Received", "Type", "Status", "First name", "Last name", "Email", "Phone", "Preferred time", "Message", "Notes"],
      ...rows.map((e) => [e.id, new Date(e.created_at).toISOString(), e.type, e.status, e.first_name, e.last_name, e.email, e.phone, e.preferred_time, e.message, e.notes]),
    ]));
  });

  r.get("/enquiries/:id", (req, res) => {
    const row = get<EnqRow>("SELECT * FROM enquiries WHERE id = ?", int(req.params.id, -1));
    if (!row) throw new HttpError(404, "Not found.");
    res.json({ item: enq(row) });
  });

  r.patch("/enquiries/:id", (req, res) => {
    const id = int(req.params.id, -1);
    const row = get<EnqRow>("SELECT * FROM enquiries WHERE id = ?", id);
    if (!row) throw new HttpError(404, "Not found.");
    const status = req.body?.status === undefined ? row.status : String(req.body.status);
    if (!STATUSES.includes(status)) throw new HttpError(422, "Invalid status.");
    const notes = req.body?.notes === undefined ? row.notes : multiLine(req.body.notes, 4000);
    run("UPDATE enquiries SET status = ?, notes = ?, updated_at = ? WHERE id = ?", status, notes, now(), id);
    if (status !== row.status) audit(req.user!.email, "enquiry.status", "enquiries", `#${id}: ${row.status} -> ${status}`, req);
    else if (notes !== row.notes) audit(req.user!.email, "enquiry.notes", "enquiries", `#${id}`, req);
    res.json({ item: enq(get<EnqRow>("SELECT * FROM enquiries WHERE id = ?", id)!) });
  });

  r.delete("/enquiries/:id", requireAdmin, (req, res) => {
    const id = int(req.params.id, -1);
    if (!run("DELETE FROM enquiries WHERE id = ?", id).changes) throw new HttpError(404, "Not found.");
    audit(req.user!.email, "enquiry.delete", "enquiries", `#${id}`, req);
    res.json({ ok: true });
  });

  // ---- subscribers (mailing list)
  interface SubRow { id: number; email: string; name: string; source: string; status: string; consent_at: number; created_at: number }
  const sub = (s: SubRow) => ({ id: s.id, email: s.email, name: s.name, source: s.source, status: s.status, consentAt: s.consent_at, createdAt: s.created_at });

  r.get("/subscribers", (req, res) => {
    const text = String(req.query.q ?? "").trim(), status = String(req.query.status ?? "");
    const where: string[] = [], params: unknown[] = [];
    if (status === "active" || status === "unsubscribed") { where.push("status = ?"); params.push(status); }
    if (text) { where.push("(email LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\')"); const l = `%${text.replace(/[\\%_]/g, "\\$&")}%`; params.push(l, l); }
    const sql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const page = int(req.query.page, 1, 1), size = int(req.query.size, 25, 5, 200);
    const total = get<{ n: number }>(`SELECT COUNT(*) n FROM subscribers ${sql}`, ...params)!.n;
    const items = all<SubRow>(`SELECT * FROM subscribers ${sql} ORDER BY created_at DESC LIMIT ? OFFSET ?`, ...params, size, (page - 1) * size).map(sub);
    res.json({ items, total, page, size });
  });

  r.get("/subscribers/export.csv", (req, res) => {
    const rows = all<SubRow>("SELECT * FROM subscribers WHERE status = 'active' ORDER BY created_at DESC");
    audit(req.user!.email, "subscribers.export", "subscribers", `${rows.length} rows`, req);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="subscribers-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send("﻿" + toCsv([["Email", "Name", "Source", "Consent given", "Joined"], ...rows.map((s) => [s.email, s.name, s.source, new Date(s.consent_at).toISOString(), new Date(s.created_at).toISOString()])]));
  });

  r.patch("/subscribers/:id", (req, res) => {
    const id = int(req.params.id, -1);
    const status = String(req.body?.status ?? "");
    if (status !== "active" && status !== "unsubscribed") throw new HttpError(422, "Invalid status.");
    if (!run("UPDATE subscribers SET status = ? WHERE id = ?", status, id).changes) throw new HttpError(404, "Not found.");
    audit(req.user!.email, "subscriber.status", "subscribers", `#${id} -> ${status}`, req);
    res.json({ item: sub(get<SubRow>("SELECT * FROM subscribers WHERE id = ?", id)!) });
  });

  r.delete("/subscribers/:id", requireAdmin, (req, res) => {
    const id = int(req.params.id, -1);
    if (!run("DELETE FROM subscribers WHERE id = ?", id).changes) throw new HttpError(404, "Not found.");
    audit(req.user!.email, "subscriber.delete", "subscribers", `#${id}`, req);
    res.json({ ok: true });
  });

  return r;
}

