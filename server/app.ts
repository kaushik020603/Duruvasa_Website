import fs from "node:fs";
import path from "node:path";
import express, { type ErrorRequestHandler, type Request, type Response, type NextFunction } from "express";
import { config, paths } from "./config.js";
import { attachUser, authRoutes, csrfGuard, requireAuth } from "./auth.js";
import { adminRoutes } from "./admin.js";
import { contentRoutes, getBundle } from "./content.js";
import { inboxRoutes, publicRoutes } from "./inbox.js";
import { mediaRoutes } from "./media.js";
import { get } from "./db.js";
import { HttpError } from "./util.js";

const CSP = [
  "default-src 'self'",
  "script-src 'self' https://plausible.io",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://plausible.io",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

function securityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader("Content-Security-Policy", CSP);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  if (req.secure || config.production) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
}

const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof HttpError) return void res.status(err.status).json({ error: err.message, ...(err.extra ?? {}) });
  const e = err as { type?: string; status?: number; message?: string };
  if (e.type === "entity.too.large") return void res.status(413).json({ error: "That request is too large." });
  if (e.type === "entity.parse.failed") return void res.status(400).json({ error: "Invalid request." });
  console.error(`${req.method} ${req.originalUrl}:`, err);
  res.status(500).json({ error: "Something went wrong on our side. Please try again." });
};

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  if (config.trustProxy) app.set("trust proxy", config.trustProxy);
  app.use(securityHeaders);

  // ---------------- public API
  app.get("/api/health", (_req, res) => {
    get("SELECT 1");
    res.json({ ok: true });
  });
  app.get("/api/content", (req, res) => {
    const b = getBundle();
    if (req.headers["if-none-match"] === b.etag) return void res.status(304).end();
    res.set({ ETag: b.etag, "Cache-Control": "no-cache", "Content-Type": "application/json; charset=utf-8" }).send(b.json);
  });
  app.use("/api", express.json({ limit: "100kb" }), publicRoutes());

  // ---------------- admin API
  app.use("/api/admin", (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
  app.use("/api/admin/auth", express.json({ limit: "20kb" }), authRoutes());
  const admin = express.Router();
  admin.use(express.json({ limit: "2mb" }), attachUser, requireAuth, csrfGuard);
  admin.use("/content", contentRoutes());
  admin.use(inboxRoutes());
  admin.use(mediaRoutes());
  admin.use(adminRoutes());
  app.use("/api/admin", admin);
  app.use("/api", (_req, res) => void res.status(404).json({ error: "Not found." }));

  // ---------------- files
  app.use("/uploads", express.static(paths.uploads, {
    index: false, dotfiles: "deny", maxAge: "30d", immutable: true,
    setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff"),
  }));

  const dist = config.distDir;
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, {
      index: false, dotfiles: "ignore",
      setHeaders: (res, file) => {
        if (/[\\/]assets[\\/]/.test(file)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        else if (/\.html$/.test(file)) res.setHeader("Cache-Control", "no-cache");
        else res.setHeader("Cache-Control", "public, max-age=86400");
      },
    }));
    const sendHtml = (file: string) => (_req: Request, res: Response) => {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(file);
    };
    // The admin shell must never be cached by browsers or proxies.
    app.get(["/admin", "/admin/"], (_req, res) => { res.setHeader("Cache-Control", "no-store"); res.sendFile(path.join(dist, "admin", "index.html")); });
    app.get(/^\/(?!api\/|uploads\/)[^.]*$/, sendHtml(path.join(dist, "index.html")));
  }

  app.use((_req, res) => void res.status(404).type("text").send("Not found"));
  app.use(errorHandler);
  return app;
}
