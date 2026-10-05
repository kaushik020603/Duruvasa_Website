import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express, { type Router } from "express";
import { config, paths } from "./config.js";
import { all, get, getMeta, now, run, setMeta, tx } from "./db.js";
import { entities, entityMap, validateDoc, ValidationError, type Entity } from "../shared/schema.js";
import { audit, HttpError, int, wrap } from "./util.js";

// ------------------------------------------------------------------ seeding from src/content/*.json
const readJson = (f: string) => JSON.parse(fs.readFileSync(path.join(config.contentSeedDir, f), "utf8"));

function insertDoc(e: Entity, data: Record<string, unknown>, position: number, published = true, by = "seed") {
  const key = e.keyField ? String(data[e.keyField]) : `d${crypto.randomBytes(6).toString("hex")}`;
  run("INSERT OR IGNORE INTO docs (collection, doc_key, data, position, published, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
    e.key, key, JSON.stringify(data), position, published ? 1 : 0, now(), by);
}

function cleanSeed(e: Entity, raw: unknown): Record<string, unknown> {
  try { return validateDoc(e, raw); } catch (err) {
    if (err instanceof ValidationError) console.warn(`seed: ${e.key} has warnings:`, err.errors);
    return raw as Record<string, unknown>;
  }
}

export function seedIfEmpty() {
  if (getMeta("seeded_v1")) return;
  const pages = readJson("pages.json");
  const site = readJson("site.json");
  const services = readJson("services.json").items;
  const posts = readJson("posts.json").items;
  const source: Record<string, unknown> = { ...pages, ...site, services, posts };

  tx(() => {
    for (const e of entities) {
      const raw = source[e.key];
      if (raw === undefined) continue;
      if (e.kind === "singleton") {
        run("INSERT OR REPLACE INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, 'seed')", e.key, JSON.stringify(cleanSeed(e, raw)), now());
      } else {
        (raw as unknown[]).forEach((item, i) => insertDoc(e, cleanSeed(e, item), i));
      }
    }
    setMeta("seeded_v1", String(now()));
  });

  // Ship the default checklist so the download works out of the box.
  const src = path.join(config.assetsDir, "Cloud-Security-Checklist.pdf");
  const dst = path.join(paths.privateResources, "cloud-security-checklist.pdf");
  if (fs.existsSync(src) && !fs.existsSync(dst)) fs.copyFileSync(src, dst);
  console.log("seed: imported default content into the database");
}

// ------------------------------------------------------------------ public bundle (cached)
let bundleCache: { json: string; etag: string } | null = null;
export const invalidateBundle = () => { bundleCache = null; };

export function getBundle() {
  if (bundleCache) return bundleCache;
  const out: Record<string, unknown> = {};
  for (const e of entities) {
    if (e.kind === "singleton") {
      const row = get<{ value: string }>("SELECT value FROM settings WHERE key = ?", e.key);
      if (row) out[e.key] = JSON.parse(row.value);
    } else {
      out[e.key] = all<{ data: string }>("SELECT data FROM docs WHERE collection = ? AND published = 1 ORDER BY position, id", e.key).map((r) => JSON.parse(r.data));
    }
  }
  const json = JSON.stringify(out);
  bundleCache = { json, etag: `"${crypto.createHash("sha1").update(json).digest("hex")}"` };
  return bundleCache;
}

// ------------------------------------------------------------------ admin API
interface DocRow { id: number; doc_key: string; data: string; position: number; published: number; updated_at: number; updated_by: string | null }
const shape = (r: DocRow) => ({ id: r.id, key: r.doc_key, data: JSON.parse(r.data), position: r.position, published: !!r.published, updatedAt: r.updated_at, updatedBy: r.updated_by });

function entityOr404(key: string): Entity {
  const e = entityMap[key];
  if (!e) throw new HttpError(404, "Unknown content type.");
  return e;
}

function titleOf(e: Entity, data: Record<string, unknown>) {
  return String(data[e.titleField ?? e.fields[0]?.key ?? ""] ?? "").slice(0, 80);
}

function validate(e: Entity, body: unknown) {
  try { return validateDoc(e, body); } catch (err) {
    if (err instanceof ValidationError) throw new HttpError(422, "Please fix the highlighted fields.", { errors: err.errors });
    throw err;
  }
}

export function contentRoutes(): Router {
  const r = express.Router();

  r.get("/", (_req, res) => {
    const counts = Object.fromEntries(all<{ collection: string; n: number }>("SELECT collection, COUNT(*) n FROM docs GROUP BY collection").map((c) => [c.collection, c.n]));
    res.json({ entities, counts });
  });

  r.get("/:entity", (req, res) => {
    const e = entityOr404(req.params.entity);
    if (e.kind === "singleton") {
      const row = get<{ value: string; updated_at: number; updated_by: string | null }>("SELECT * FROM settings WHERE key = ?", e.key);
      return res.json({ data: row ? JSON.parse(row.value) : {}, updatedAt: row?.updated_at ?? null, updatedBy: row?.updated_by ?? null });
    }
    res.json({ items: all<DocRow>("SELECT * FROM docs WHERE collection = ? ORDER BY position, id", e.key).map(shape) });
  });

  r.put("/:entity", (req, res) => {
    const e = entityOr404(req.params.entity);
    if (e.kind !== "singleton") throw new HttpError(400, "Use an item address for collections.");
    const data = validate(e, req.body?.data);
    run("INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
      e.key, JSON.stringify(data), now(), req.user!.email);
    invalidateBundle();
    audit(req.user!.email, "content.update", e.key, e.label, req);
    res.json({ data });
  });

  r.post("/:entity/reorder", (req, res) => {
    const e = entityOr404(req.params.entity);
    const ids: unknown[] = Array.isArray(req.body?.ids) ? req.body.ids : [];
    tx(() => ids.forEach((id, i) => run("UPDATE docs SET position = ? WHERE id = ? AND collection = ?", i, int(id, -1), e.key)));
    invalidateBundle();
    audit(req.user!.email, "content.reorder", e.key, `${ids.length} items`, req);
    res.json({ ok: true });
  });

  r.post("/:entity", wrap(async (req, res) => {
    const e = entityOr404(req.params.entity);
    if (e.kind !== "collection") throw new HttpError(400, "This content has a single record. Edit it instead.");
    const data = validate(e, req.body?.data);
    const key = e.keyField ? String(data[e.keyField]) : `d${crypto.randomBytes(6).toString("hex")}`;
    if (get("SELECT 1 FROM docs WHERE collection = ? AND doc_key = ?", e.key, key)) {
      throw new HttpError(422, "That address is already used.", { errors: { [e.keyField ?? "key"]: "Already used. Choose a different one." } });
    }
    const pos = (get<{ m: number | null }>("SELECT MAX(position) m FROM docs WHERE collection = ?", e.key)?.m ?? -1) + 1;
    const r2 = run("INSERT INTO docs (collection, doc_key, data, position, published, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
      e.key, key, JSON.stringify(data), pos, req.body?.published === false ? 0 : 1, now(), req.user!.email);
    invalidateBundle();
    audit(req.user!.email, "content.create", e.key, titleOf(e, data), req);
    res.status(201).json({ item: shape(get<DocRow>("SELECT * FROM docs WHERE id = ?", r2.id)!) });
  }));

  r.put("/:entity/:id", (req, res) => {
    const e = entityOr404(req.params.entity);
    const id = int(req.params.id, -1);
    const row = get<DocRow>("SELECT * FROM docs WHERE id = ? AND collection = ?", id, e.key);
    if (!row) throw new HttpError(404, "Not found.");
    const data = validate(e, req.body?.data);
    const key = e.keyField ? String(data[e.keyField]) : row.doc_key;
    if (key !== row.doc_key && get("SELECT 1 FROM docs WHERE collection = ? AND doc_key = ? AND id != ?", e.key, key, id)) {
      throw new HttpError(422, "That address is already used.", { errors: { [e.keyField ?? "key"]: "Already used. Choose a different one." } });
    }
    const published = req.body?.published === undefined ? row.published : req.body.published ? 1 : 0;
    run("UPDATE docs SET doc_key = ?, data = ?, published = ?, updated_at = ?, updated_by = ? WHERE id = ?", key, JSON.stringify(data), published, now(), req.user!.email, id);
    invalidateBundle();
    audit(req.user!.email, "content.update", e.key, titleOf(e, data), req);
    res.json({ item: shape(get<DocRow>("SELECT * FROM docs WHERE id = ?", id)!) });
  });

  r.post("/:entity/:id/duplicate", (req, res) => {
    const e = entityOr404(req.params.entity);
    const row = get<DocRow>("SELECT * FROM docs WHERE id = ? AND collection = ?", int(req.params.id, -1), e.key);
    if (!row) throw new HttpError(404, "Not found.");
    const data = JSON.parse(row.data) as Record<string, unknown>;
    let key = row.doc_key;
    if (e.keyField) {
      let n = 2;
      while (get("SELECT 1 FROM docs WHERE collection = ? AND doc_key = ?", e.key, `${row.doc_key}-copy${n > 2 ? `-${n}` : ""}`)) n++;
      key = `${row.doc_key}-copy${n > 2 ? `-${n}` : ""}`;
      data[e.keyField] = key;
    } else key = `d${crypto.randomBytes(6).toString("hex")}`;
    const tf = e.titleField;
    if (tf && typeof data[tf] === "string") data[tf] = `${data[tf]} (copy)`;
    const pos = (get<{ m: number | null }>("SELECT MAX(position) m FROM docs WHERE collection = ?", e.key)?.m ?? -1) + 1;
    const r2 = run("INSERT INTO docs (collection, doc_key, data, position, published, updated_at, updated_by) VALUES (?, ?, ?, ?, 0, ?, ?)", e.key, key, JSON.stringify(data), pos, now(), req.user!.email);
    invalidateBundle();
    audit(req.user!.email, "content.duplicate", e.key, titleOf(e, data), req);
    res.status(201).json({ item: shape(get<DocRow>("SELECT * FROM docs WHERE id = ?", r2.id)!) });
  });

  r.delete("/:entity/:id", (req, res) => {
    const e = entityOr404(req.params.entity);
    const row = get<DocRow>("SELECT * FROM docs WHERE id = ? AND collection = ?", int(req.params.id, -1), e.key);
    if (!row) throw new HttpError(404, "Not found.");
    run("DELETE FROM docs WHERE id = ?", row.id);
    invalidateBundle();
    audit(req.user!.email, "content.delete", e.key, titleOf(e, JSON.parse(row.data)), req);
    res.json({ ok: true });
  });

  return r;
}
