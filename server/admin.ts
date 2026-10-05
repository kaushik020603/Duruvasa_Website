import fs from "node:fs";
import path from "node:path";
import express, { type Router } from "express";
import { config, paths } from "./config.js";
import { all, db, get, now, run } from "./db.js";
import { destroyOtherSessions, issueSetupToken, requireAdmin, setupLink } from "./auth.js";
import { audit, HttpError, int } from "./util.js";

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

interface UserRow {
  id: number; email: string; name: string; role: "admin" | "editor"; password_hash: string | null; totp_enabled: number;
  active: number; setup_expires: number | null; setup_token_hash: string | null; created_at: number; last_login: number | null;
}
const shape = (u: UserRow) => ({
  id: u.id, email: u.email, name: u.name, role: u.role, active: !!u.active, totpEnabled: !!u.totp_enabled,
  hasPassword: !!u.password_hash, pendingSetup: !!u.setup_token_hash && (u.setup_expires ?? 0) > now(),
  createdAt: u.created_at, lastLogin: u.last_login,
});
const adminCount = () => get<{ n: number }>("SELECT COUNT(*) n FROM users WHERE role = 'admin' AND active = 1")!.n;

// ------------------------------------------------------------------ backups
const BACKUP_RE = /^site-\d{8}-\d{6}\.db$/;

export function createBackup(): { file: string; size: number } {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const file = `site-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.db`;
  const target = path.join(paths.backups, file);
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  const files = fs.readdirSync(paths.backups).filter((f) => BACKUP_RE.test(f)).sort().reverse();
  for (const old of files.slice(config.backupKeep)) fs.rmSync(path.join(paths.backups, old), { force: true });
  return { file, size: fs.statSync(target).size };
}

export function scheduleBackups() {
  const latest = fs.readdirSync(paths.backups).filter((f) => BACKUP_RE.test(f)).sort().pop();
  const age = latest ? now() - fs.statSync(path.join(paths.backups, latest)).mtimeMs : Infinity;
  if (age > 24 * 3600_000) { try { createBackup(); console.log("backup: created"); } catch (e) { console.warn("backup failed", e); } }
  setInterval(() => { try { createBackup(); } catch (e) { console.warn("backup failed", e); } }, 24 * 3600_000).unref();
}

// ------------------------------------------------------------------ routes
export function adminRoutes(): Router {
  const r = express.Router();

  r.get("/stats", (_req, res) => {
    const week = now() - 7 * 86_400_000;
    const q = (sql: string, ...p: unknown[]) => get<{ n: number }>(sql, ...p)!.n;
    res.json({
      enquiries: {
        total: q("SELECT COUNT(*) n FROM enquiries"),
        new: q("SELECT COUNT(*) n FROM enquiries WHERE status = 'new'"),
        inProgress: q("SELECT COUNT(*) n FROM enquiries WHERE status = 'in_progress'"),
        consultations: q("SELECT COUNT(*) n FROM enquiries WHERE type = 'consultation' AND status IN ('new','in_progress')"),
        thisWeek: q("SELECT COUNT(*) n FROM enquiries WHERE created_at > ?", week),
      },
      subscribers: { active: q("SELECT COUNT(*) n FROM subscribers WHERE status = 'active'"), thisWeek: q("SELECT COUNT(*) n FROM subscribers WHERE created_at > ?", week) },
      content: { items: q("SELECT COUNT(*) n FROM docs"), drafts: q("SELECT COUNT(*) n FROM docs WHERE published = 0"), media: q("SELECT COUNT(*) n FROM media") },
      recent: all("SELECT id, type, first_name, last_name, email, status, created_at FROM enquiries ORDER BY created_at DESC LIMIT 6")
        .map((e) => ({ id: e.id, type: e.type, name: `${e.first_name} ${e.last_name}`, email: e.email, status: e.status, createdAt: e.created_at })),
    });
  });

  r.get("/audit", (req, res) => {
    const limit = int(req.query.limit, 100, 10, 500);
    const text = String(req.query.q ?? "").trim();
    const rows = text
      ? all("SELECT * FROM audit WHERE actor LIKE ? ESCAPE '\\' OR action LIKE ? ESCAPE '\\' OR detail LIKE ? ESCAPE '\\' ORDER BY at DESC LIMIT ?", ...Array(3).fill(`%${text.replace(/[\\%_]/g, "\\$&")}%`), limit)
      : all("SELECT * FROM audit ORDER BY at DESC LIMIT ?", limit);
    res.json({ items: rows.map((a) => ({ id: a.id, at: a.at, actor: a.actor, action: a.action, entity: a.entity, detail: a.detail, ip: a.ip })) });
  });

  // ---- users (administrators only)
  r.get("/users", requireAdmin, (_req, res) => {
    res.json({ items: all<UserRow>("SELECT * FROM users ORDER BY created_at").map(shape) });
  });

  r.post("/users", requireAdmin, (req, res) => {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const name = String(req.body?.name ?? "").trim().slice(0, 80);
    const role = req.body?.role === "admin" ? "admin" : "editor";
    if (!EMAIL.test(email)) throw new HttpError(422, "Enter a valid email.", { errors: { email: "Enter a valid email" } });
    if (get("SELECT 1 FROM users WHERE email = ?", email)) throw new HttpError(422, "That email already has an account.", { errors: { email: "Already has an account" } });
    const id = run("INSERT INTO users (email, name, role, created_at) VALUES (?, ?, ?, ?)", email, name, role, now()).id;
    const link = setupLink(email, issueSetupToken(id, 72));
    audit(req.user!.email, "user.create", "users", `${email} (${role})`, req);
    res.status(201).json({ item: shape(get<UserRow>("SELECT * FROM users WHERE id = ?", id)!), setupLink: link });
  });

  r.patch("/users/:id", requireAdmin, (req, res) => {
    const id = int(req.params.id, -1);
    const u = get<UserRow>("SELECT * FROM users WHERE id = ?", id);
    if (!u) throw new HttpError(404, "Not found.");
    const role = req.body?.role === undefined ? u.role : req.body.role === "admin" ? "admin" : "editor";
    const active = req.body?.active === undefined ? !!u.active : !!req.body.active;
    const name = req.body?.name === undefined ? u.name : String(req.body.name).trim().slice(0, 80);
    if (id === req.user!.id && (!active || role !== "admin")) throw new HttpError(400, "You cannot remove your own administrator access.");
    if (u.role === "admin" && (role !== "admin" || !active) && adminCount() <= 1) throw new HttpError(400, "There must be at least one active administrator.");
    run("UPDATE users SET role = ?, active = ?, name = ? WHERE id = ?", role, active ? 1 : 0, name, id);
    if (!active) run("DELETE FROM sessions WHERE user_id = ?", id);
    audit(req.user!.email, "user.update", "users", `${u.email}: role=${role}, active=${active}`, req);
    res.json({ item: shape(get<UserRow>("SELECT * FROM users WHERE id = ?", id)!) });
  });

  r.post("/users/:id/reset-link", requireAdmin, (req, res) => {
    const id = int(req.params.id, -1);
    const u = get<UserRow>("SELECT * FROM users WHERE id = ?", id);
    if (!u) throw new HttpError(404, "Not found.");
    const link = setupLink(u.email, issueSetupToken(id, 24));
    destroyOtherSessions(id);
    audit(req.user!.email, "user.reset-link", "users", u.email, req);
    res.json({ setupLink: link });
  });

  r.post("/users/:id/reset-2fa", requireAdmin, (req, res) => {
    const id = int(req.params.id, -1);
    const u = get<UserRow>("SELECT * FROM users WHERE id = ?", id);
    if (!u) throw new HttpError(404, "Not found.");
    run("UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?", id);
    audit(req.user!.email, "user.reset-2fa", "users", u.email, req);
    res.json({ ok: true });
  });

  r.delete("/users/:id", requireAdmin, (req, res) => {
    const id = int(req.params.id, -1);
    const u = get<UserRow>("SELECT * FROM users WHERE id = ?", id);
    if (!u) throw new HttpError(404, "Not found.");
    if (id === req.user!.id) throw new HttpError(400, "You cannot delete your own account.");
    if (u.role === "admin" && u.active && adminCount() <= 1) throw new HttpError(400, "There must be at least one active administrator.");
    run("DELETE FROM users WHERE id = ?", id);
    audit(req.user!.email, "user.delete", "users", u.email, req);
    res.json({ ok: true });
  });

  // ---- backups (administrators only)
  r.get("/backups", requireAdmin, (_req, res) => {
    const items = fs.readdirSync(paths.backups).filter((f) => BACKUP_RE.test(f)).sort().reverse()
      .map((f) => { const s = fs.statSync(path.join(paths.backups, f)); return { file: f, size: s.size, createdAt: s.mtimeMs }; });
    res.json({ items });
  });

  r.post("/backups", requireAdmin, (req, res) => {
    const b = createBackup();
    audit(req.user!.email, "backup.create", "backups", b.file, req);
    res.status(201).json(b);
  });

  r.get("/backups/:file", requireAdmin, (req, res) => {
    const f = String(req.params.file);
    if (!BACKUP_RE.test(f) || !fs.existsSync(path.join(paths.backups, f))) throw new HttpError(404, "Not found.");
    audit(req.user!.email, "backup.download", "backups", f, req);
    res.download(path.join(paths.backups, f), f);
  });

  return r;
}
