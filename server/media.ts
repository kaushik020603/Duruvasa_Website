import fs from "node:fs";
import path from "node:path";
import express, { type Router } from "express";
import { config, paths } from "./config.js";
import { all, get, now, run } from "./db.js";
import { randomToken } from "./security.js";
import { requireAdmin } from "./auth.js";
import { audit, HttpError, int } from "./util.js";
import { resourceFile } from "./inbox.js";

const MAX_IMAGE = 5 * 1024 * 1024;
const MAX_PDF = 12 * 1024 * 1024;

/** Detects the real type from the file's first bytes, ignoring whatever the client claims. SVG is deliberately excluded (script risk). */
function sniffImage(b: Buffer): { ext: string; mime: string } | null {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: "png", mime: "image/png" };
  if (b.length > 12 && b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP") return { ext: "webp", mime: "image/webp" };
  if (b.length > 6 && (b.subarray(0, 6).toString() === "GIF87a" || b.subarray(0, 6).toString() === "GIF89a")) return { ext: "gif", mime: "image/gif" };
  return null;
}

function listBuiltIn(): { path: string; name: string; builtIn: true }[] {
  const out: { path: string; name: string; builtIn: true }[] = [];
  for (const dir of ["img", "team"]) {
    const base = path.join(config.publicDir, dir);
    if (!fs.existsSync(base)) continue;
    for (const f of fs.readdirSync(base)) if (/\.(webp|png|jpe?g|gif)$/i.test(f)) out.push({ path: `/${dir}/${f}`, name: f, builtIn: true });
  }
  return out;
}

export function mediaRoutes(): Router {
  const r = express.Router();
  const rawImage = express.raw({ type: () => true, limit: MAX_IMAGE + 1024 });
  const rawPdf = express.raw({ type: () => true, limit: MAX_PDF + 1024 });

  r.get("/media", (_req, res) => {
    const uploaded = all<{ id: number; filename: string; original: string; mime: string; size: number; alt: string; created_at: number; uploaded_by: string | null }>(
      "SELECT * FROM media ORDER BY created_at DESC"
    ).map((m) => ({ id: m.id, path: `/uploads/${m.filename}`, name: m.original, mime: m.mime, size: m.size, alt: m.alt, createdAt: m.created_at, uploadedBy: m.uploaded_by, builtIn: false }));
    res.json({ items: uploaded, builtIn: listBuiltIn() });
  });

  r.post("/media", rawImage, (req, res) => {
    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || !body.length) throw new HttpError(400, "No file received.");
    if (body.length > MAX_IMAGE) throw new HttpError(413, "Images must be 5 MB or smaller.");
    const kind = sniffImage(body);
    if (!kind) throw new HttpError(415, "Upload a JPG, PNG, WebP or GIF image.");
    const original = String(req.query.name ?? "image").replace(/[^\w.\- ]/g, "").slice(0, 80) || "image";
    const filename = `${randomToken(9)}.${kind.ext}`;
    fs.writeFileSync(path.join(paths.uploads, filename), body, { flag: "wx" });
    const id = run("INSERT INTO media (filename, original, mime, size, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?)", filename, original, kind.mime, body.length, req.user!.email, now()).id;
    audit(req.user!.email, "media.upload", "media", `${original} (${Math.round(body.length / 1024)} KB)`, req);
    res.status(201).json({ item: { id, path: `/uploads/${filename}`, name: original, mime: kind.mime, size: body.length, alt: "", createdAt: now(), builtIn: false } });
  });

  r.patch("/media/:id", (req, res) => {
    const id = int(req.params.id, -1);
    const alt = String(req.body?.alt ?? "").slice(0, 200);
    if (!run("UPDATE media SET alt = ? WHERE id = ?", alt, id).changes) throw new HttpError(404, "Not found.");
    res.json({ ok: true });
  });

  r.delete("/media/:id", requireAdmin, (req, res) => {
    const id = int(req.params.id, -1);
    const m = get<{ filename: string; original: string }>("SELECT filename, original FROM media WHERE id = ?", id);
    if (!m) throw new HttpError(404, "Not found.");
    const needle = `%/uploads/${m.filename}%`;
    const used = (get<{ n: number }>("SELECT COUNT(*) n FROM docs WHERE data LIKE ?", needle)?.n ?? 0) + (get<{ n: number }>("SELECT COUNT(*) n FROM settings WHERE value LIKE ?", needle)?.n ?? 0);
    if (used && req.query.force !== "1") throw new HttpError(409, `This image is used in ${used} place${used === 1 ? "" : "s"}. Remove it from there first, or delete anyway.`, { used });
    fs.rmSync(path.join(paths.uploads, m.filename), { force: true });
    run("DELETE FROM media WHERE id = ?", id);
    audit(req.user!.email, "media.delete", "media", m.original, req);
    res.json({ ok: true });
  });

  // Replace the PDF behind a gated download (e.g. an updated checklist).
  r.post("/resources/:slug/file", rawPdf, (req, res) => {
    const slug = String(req.params.slug);
    if (!get("SELECT 1 FROM docs WHERE collection = 'resources' AND doc_key = ?", slug)) throw new HttpError(404, "Unknown download.");
    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length < 8) throw new HttpError(400, "No file received.");
    if (body.length > MAX_PDF) throw new HttpError(413, "PDFs must be 12 MB or smaller.");
    if (body.subarray(0, 5).toString() !== "%PDF-") throw new HttpError(415, "That file is not a PDF.");
    fs.writeFileSync(resourceFile(slug), body);
    audit(req.user!.email, "resource.file", "resources", `${slug} (${Math.round(body.length / 1024)} KB)`, req);
    res.json({ ok: true, size: body.length });
  });

  r.get("/resources/:slug/file", (req, res) => {
    const f = resourceFile(String(req.params.slug));
    if (!fs.existsSync(f)) return res.json({ exists: false });
    const st = fs.statSync(f);
    res.json({ exists: true, size: st.size, updatedAt: st.mtimeMs });
  });

  return r;
}
