import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// Compiled to server-dist/server/, so the project root is two levels up. Under ts source it is one.
export const ROOT = path.resolve(here, here.includes("server-dist") ? "../.." : "..");

const env = process.env;
const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);

export const config = {
  production: env.NODE_ENV === "production",
  port: num(env.PORT, 4180),
  host: env.HOST ?? "127.0.0.1",
  dataDir: path.resolve(env.DATA_DIR ?? path.join(ROOT, "data")),
  distDir: path.resolve(env.DIST_DIR ?? path.join(ROOT, "dist")),
  contentSeedDir: path.join(ROOT, "src", "content"),
  assetsDir: path.join(ROOT, "server", "assets"),
  publicDir: path.join(ROOT, "public"),
  publicUrl: (env.PUBLIC_URL ?? "http://localhost:5173").replace(/\/$/, ""),
  /** The one address search engines should index: canonical links, sitemap and structured data use it whatever host served the page. */
  siteUrl: (env.SITE_URL ?? "https://www.duruvasa.com").replace(/\/$/, ""),
  adminEmail: (env.ADMIN_EMAIL ?? "rajesh@duruvasa.com").toLowerCase(),
  /** Number of reverse proxies in front (Caddy = 1). Needed for correct client IPs and https detection. */
  trustProxy: num(env.TRUST_PROXY, 0),
  sessionIdleMinutes: num(env.SESSION_IDLE_MINUTES, 30),
  sessionMaxHours: num(env.SESSION_MAX_HOURS, 12),
  resendKey: env.RESEND_API_KEY ?? "",
  mailFrom: env.MAIL_FROM ?? "DuRuVaSa CloudSec <noreply@duruvasa.com>",
  notifyTo: (env.NOTIFY_TO ?? "info@duruvasa.com,rajesh@duruvasa.com").split(",").map((s) => s.trim()).filter(Boolean),
  backupKeep: num(env.BACKUP_KEEP, 14),
};

export const paths = {
  db: path.join(config.dataDir, "site.db"),
  uploads: path.join(config.dataDir, "uploads"),
  backups: path.join(config.dataDir, "backups"),
  privateResources: path.join(config.dataDir, "private", "resources"),
};
