import type { Request, Response, NextFunction, Router } from "express";
import express from "express";
import { config } from "./config.js";
import { get, now, run } from "./db.js";
import {
  hashPassword, newTotpSecret, passwordProblem, randomToken, RateLimiter, safeEqual, sha256, totpUri, verifyPassword, verifyTotp,
} from "./security.js";
import { audit, clientIp, HttpError, wrap } from "./util.js";

export interface AuthedUser { id: number; email: string; name: string; role: "admin" | "editor"; totpEnabled: boolean }

declare module "express-serve-static-core" {
  interface Request { user?: AuthedUser; csrf?: string; sessionHash?: string }
}

const COOKIE = "sid";
const LOCK_AFTER = 5;
const LOCK_MS = 15 * 60_000;
const loginLimiter = new RateLimiter(20, 15 * 60_000);

// ------------------------------------------------------------------ cookies
function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

const isHttps = (req: Request) => req.secure || config.production;

function setSessionCookie(req: Request, res: Response, value: string, maxAgeMs: number) {
  res.cookie(COOKIE, value, { httpOnly: true, sameSite: "strict", secure: isHttps(req), path: "/", maxAge: maxAgeMs });
}

// ------------------------------------------------------------------ sessions
interface SessionRow {
  id_hash: string; user_id: number; csrf: string; last_seen: number; expires_at: number;
  email: string; name: string; role: "admin" | "editor"; active: number; totp_enabled: number;
}

function createSession(req: Request, res: Response, userId: number): string {
  const id = randomToken(32);
  const csrf = randomToken(24);
  const t = now();
  const maxMs = config.sessionMaxHours * 3600_000;
  run(
    "INSERT INTO sessions (id_hash, user_id, csrf, created_at, last_seen, expires_at, ip, ua) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    sha256(id), userId, csrf, t, t, t + maxMs, clientIp(req), String(req.headers["user-agent"] ?? "").slice(0, 200)
  );
  setSessionCookie(req, res, id, maxMs);
  return csrf;
}

export function destroyOtherSessions(userId: number, keepHash?: string) {
  run("DELETE FROM sessions WHERE user_id = ? AND id_hash != ?", userId, keepHash ?? "");
}

// ------------------------------------------------------------------ middleware
/** Loads the session (if any) onto req.user. Does not reject. */
export function attachUser(req: Request, _res: Response, next: NextFunction) {
  const sid = parseCookies(req.headers.cookie)[COOKIE];
  if (!sid) return next();
  const h = sha256(sid);
  const row = get<SessionRow>(
    `SELECT s.id_hash, s.user_id, s.csrf, s.last_seen, s.expires_at, u.email, u.name, u.role, u.active, u.totp_enabled
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ?`, h
  );
  const t = now();
  if (!row || !row.active || row.expires_at < t || row.last_seen + config.sessionIdleMinutes * 60_000 < t) {
    if (row) run("DELETE FROM sessions WHERE id_hash = ?", h);
    return next();
  }
  if (t - row.last_seen > 30_000) run("UPDATE sessions SET last_seen = ? WHERE id_hash = ?", t, h);
  req.user = { id: row.user_id, email: row.email, name: row.name, role: row.role, totpEnabled: !!row.totp_enabled };
  req.csrf = row.csrf;
  req.sessionHash = h;
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, "Please sign in."));
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, "Please sign in."));
  if (req.user.role !== "admin") return next(new HttpError(403, "Administrator access is required."));
  next();
}

/** For state-changing requests: SameSite=Strict cookie PLUS a per-session token header PLUS an Origin check. */
export function csrfGuard(req: Request, _res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (origin) {
    let host = "";
    try { host = new URL(origin).host; } catch { /* invalid origin */ }
    if (host !== req.headers.host) return next(new HttpError(403, "Cross-site request blocked."));
  }
  const token = String(req.headers["x-csrf-token"] ?? "");
  if (!req.csrf || !token || !safeEqual(token, req.csrf)) return next(new HttpError(403, "Your session expired. Refresh the page and try again."));
  next();
}

// ------------------------------------------------------------------ setup links
export function issueSetupToken(userId: number, hours = 24): string {
  const token = randomToken(32);
  run("UPDATE users SET setup_token_hash = ?, setup_expires = ? WHERE id = ?", sha256(token), now() + hours * 3600_000, userId);
  return token;
}
export const setupLink = (email: string, token: string) =>
  `${config.publicUrl}/admin/#/setup?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;

/** Creates the first admin on a fresh database and prints a one-time setup link to the console. */
export function bootstrapAdmin() {
  let u = get<{ id: number; password_hash: string | null }>("SELECT id, password_hash FROM users WHERE email = ?", config.adminEmail);
  if (!u) {
    const r = run("INSERT INTO users (email, name, role, created_at) VALUES (?, ?, 'admin', ?)", config.adminEmail, "Rajeshkumar Chemalli", now());
    u = { id: r.id, password_hash: null };
    audit("system", "admin.created", "users", config.adminEmail);
  }
  if (!u.password_hash) {
    const token = issueSetupToken(u.id, 24);
    console.log("\n  First-run setup: open this link within 24 hours to choose the admin password:\n");
    console.log(`    ${setupLink(config.adminEmail, token)}\n`);
  }
}

// ------------------------------------------------------------------ routes
const publicUser = (u: AuthedUser) => ({ id: u.id, email: u.email, name: u.name, role: u.role, totpEnabled: u.totpEnabled });

export function authRoutes(): Router {
  const r = express.Router();

  r.get("/me", (req, res) => {
    if (!req.user) throw new HttpError(401, "Not signed in.");
    res.json({ user: publicUser(req.user), csrf: req.csrf });
  });

  r.post("/login", wrap(async (req, res) => {
    const ip = clientIp(req);
    if (loginLimiter.hit(`ip:${ip}`)) {
      res.setHeader("Retry-After", String(loginLimiter.retryAfterSeconds(`ip:${ip}`)));
      throw new HttpError(429, "Too many sign-in attempts. Please wait a few minutes.");
    }
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");
    const code = String(req.body?.code ?? "");
    const u = get<{ id: number; email: string; name: string; role: "admin" | "editor"; password_hash: string | null; active: number; totp_secret: string | null; totp_enabled: number; failed_count: number; locked_until: number }>(
      "SELECT * FROM users WHERE email = ?", email
    );

    if (u && u.locked_until > now()) {
      const mins = Math.ceil((u.locked_until - now()) / 60_000);
      throw new HttpError(429, `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`);
    }

    const passwordOk = await verifyPassword(password, u?.password_hash);
    const generic = new HttpError(401, "Incorrect email, password or code.");
    if (!u || !u.active || !passwordOk) {
      if (u) failAttempt(u.id, u.failed_count);
      audit(email || "unknown", "login.failed", "auth", "bad credentials", req);
      throw generic;
    }

    if (u.totp_enabled && u.totp_secret) {
      if (!code) return res.json({ needs2fa: true });
      if (!verifyTotp(u.totp_secret, code)) {
        failAttempt(u.id, u.failed_count);
        audit(u.email, "login.failed", "auth", "bad 2fa code", req);
        throw generic;
      }
    }

    run("UPDATE users SET failed_count = 0, locked_until = 0, last_login = ? WHERE id = ?", now(), u.id);
    const csrf = createSession(req, res, u.id);
    audit(u.email, "login", "auth", "", req);
    res.json({ user: { id: u.id, email: u.email, name: u.name, role: u.role, totpEnabled: !!u.totp_enabled }, csrf });
  }));

  /**
   * Change password from the sign-in page using the CURRENT password (no email needed).
   * Same protections as login: IP rate limit, per-account lockout, and the 2FA code when enabled.
   * Every existing session for the account is ended, so the person must sign in again with the new password.
   */
  r.post("/change-password", wrap(async (req, res) => {
    const ip = clientIp(req);
    if (loginLimiter.hit(`pw:${ip}`)) {
      res.setHeader("Retry-After", String(loginLimiter.retryAfterSeconds(`pw:${ip}`)));
      throw new HttpError(429, "Too many attempts. Please wait a few minutes.");
    }
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const current = String(req.body?.current ?? "");
    const next = String(req.body?.next ?? "");
    const code = String(req.body?.code ?? "");
    const u = get<{ id: number; password_hash: string | null; active: number; totp_secret: string | null; totp_enabled: number; failed_count: number; locked_until: number }>(
      "SELECT * FROM users WHERE email = ?", email
    );
    if (u && u.locked_until > now()) {
      const mins = Math.ceil((u.locked_until - now()) / 60_000);
      throw new HttpError(429, `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`);
    }
    const generic = new HttpError(401, "Incorrect email, password or code.");
    const ok = await verifyPassword(current, u?.password_hash);
    if (!u || !u.active || !ok) {
      if (u) failAttempt(u.id, u.failed_count);
      audit(email || "unknown", "password.change.failed", "auth", "bad current password", req);
      throw generic;
    }
    if (u.totp_enabled && u.totp_secret) {
      if (!code) return res.json({ needs2fa: true });
      if (!verifyTotp(u.totp_secret, code)) { failAttempt(u.id, u.failed_count); audit(email, "password.change.failed", "auth", "bad 2fa code", req); throw generic; }
    }
    // The person is now authenticated: report policy problems clearly.
    const problem = passwordProblem(next, email);
    if (problem) throw new HttpError(400, problem);
    if (next === current) throw new HttpError(400, "Choose a password different from the current one.");
    run("UPDATE users SET password_hash = ?, failed_count = 0, locked_until = 0 WHERE id = ?", await hashPassword(next), u.id);
    run("DELETE FROM sessions WHERE user_id = ?", u.id);
    audit(email, "password.changed", "users", "via sign-in page (current password)", req);
    res.json({ ok: true });
  }));

  r.post("/setup", wrap(async (req, res) => {
    if (loginLimiter.hit(`setup:${clientIp(req)}`)) throw new HttpError(429, "Too many attempts. Please wait a few minutes.");
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const token = String(req.body?.token ?? "");
    const password = String(req.body?.password ?? "");
    const name = String(req.body?.name ?? "").trim().slice(0, 80);
    const u = get<{ id: number; email: string; name: string; role: "admin" | "editor"; setup_token_hash: string | null; setup_expires: number | null; totp_enabled: number }>(
      "SELECT * FROM users WHERE email = ?", email
    );
    const valid = !!u?.setup_token_hash && (u.setup_expires ?? 0) > now() && safeEqual(sha256(token), u.setup_token_hash);
    if (!u || !valid) throw new HttpError(400, "This setup link is invalid or has expired. Ask an administrator for a new one.");
    const problem = passwordProblem(password, email);
    if (problem) throw new HttpError(400, problem);
    const hash = await hashPassword(password);
    run("UPDATE users SET password_hash = ?, setup_token_hash = NULL, setup_expires = NULL, active = 1, failed_count = 0, locked_until = 0, name = CASE WHEN ? != '' THEN ? ELSE name END, last_login = ? WHERE id = ?", hash, name, name, now(), u.id);
    destroyOtherSessions(u.id);
    const csrf = createSession(req, res, u.id);
    audit(u.email, "password.set", "users", "via setup link", req);
    res.json({ user: { id: u.id, email: u.email, name: name || u.name, role: u.role, totpEnabled: !!u.totp_enabled }, csrf });
  }));

  r.post("/logout", attachUser, csrfGuard, (req, res) => {
    if (req.sessionHash) run("DELETE FROM sessions WHERE id_hash = ?", req.sessionHash);
    if (req.user) audit(req.user.email, "logout", "auth", "", req);
    res.clearCookie(COOKIE, { path: "/" });
    res.json({ ok: true });
  });

  // ---- below here: signed-in only
  r.use(attachUser, requireAuth, csrfGuard);

  r.post("/password", wrap(async (req, res) => {
    const u = req.user!;
    const row = get<{ password_hash: string | null }>("SELECT password_hash FROM users WHERE id = ?", u.id);
    if (!(await verifyPassword(String(req.body?.current ?? ""), row?.password_hash))) throw new HttpError(400, "Your current password is incorrect.");
    const next = String(req.body?.next ?? "");
    const problem = passwordProblem(next, u.email);
    if (problem) throw new HttpError(400, problem);
    run("UPDATE users SET password_hash = ? WHERE id = ?", await hashPassword(next), u.id);
    destroyOtherSessions(u.id, req.sessionHash);
    audit(u.email, "password.changed", "users", "", req);
    res.json({ ok: true });
  }));

  r.post("/2fa/begin", (req, res) => {
    const u = req.user!;
    if (u.totpEnabled) throw new HttpError(400, "Two-factor authentication is already on.");
    const secret = newTotpSecret();
    run("UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?", secret, u.id);
    res.json({ secret, uri: totpUri(secret, u.email) });
  });

  r.post("/2fa/enable", (req, res) => {
    const u = req.user!;
    const row = get<{ totp_secret: string | null }>("SELECT totp_secret FROM users WHERE id = ?", u.id);
    if (!row?.totp_secret || !verifyTotp(row.totp_secret, String(req.body?.code ?? ""))) throw new HttpError(400, "That code is not correct. Check your authenticator app and try again.");
    run("UPDATE users SET totp_enabled = 1 WHERE id = ?", u.id);
    audit(u.email, "2fa.enabled", "users", "", req);
    res.json({ ok: true });
  });

  r.post("/2fa/disable", wrap(async (req, res) => {
    const u = req.user!;
    const row = get<{ password_hash: string | null }>("SELECT password_hash FROM users WHERE id = ?", u.id);
    if (!(await verifyPassword(String(req.body?.password ?? ""), row?.password_hash))) throw new HttpError(400, "Incorrect password.");
    run("UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?", u.id);
    audit(u.email, "2fa.disabled", "users", "", req);
    res.json({ ok: true });
  }));

  return r;
}

function failAttempt(userId: number, current: number) {
  const n = current + 1;
  if (n >= LOCK_AFTER) run("UPDATE users SET failed_count = 0, locked_until = ? WHERE id = ?", now() + LOCK_MS, userId);
  else run("UPDATE users SET failed_count = ? WHERE id = ?", n, userId);
}

