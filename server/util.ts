import type { Request, Response, NextFunction, RequestHandler } from "express";
import { run, now } from "./db.js";
import { sha256 } from "./security.js";

export class HttpError extends Error {
  constructor(public status: number, message: string, public extra?: Record<string, unknown>) { super(message); }
}

/** Wraps async handlers so thrown errors reach the error middleware. */
export const wrap = (fn: (req: Request, res: Response) => Promise<unknown> | unknown): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => { Promise.resolve(fn(req, res)).catch(next); };

export const clientIp = (req: Request) => req.ip || req.socket.remoteAddress || "unknown";
export const ipHash = (req: Request) => sha256(`duruvasa:${clientIp(req)}`).slice(0, 16);

export function audit(actor: string, action: string, entity = "", detail = "", req?: Request) {
  run("INSERT INTO audit (at, actor, action, entity, detail, ip) VALUES (?, ?, ?, ?, ?, ?)", now(), actor, action, entity, detail.slice(0, 500), req ? clientIp(req) : "");
}

export const csvCell = (v: unknown): string => {
  let s = v == null ? "" : String(v);
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
};
export const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

export const int = (v: unknown, d: number, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : d;
};
