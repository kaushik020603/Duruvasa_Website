export class ApiError extends Error {
  constructor(public status: number, message: string, public errors?: Record<string, string>, public extra?: Record<string, unknown>) { super(message); }
}

let csrf = "";
export const setCsrf = (t: string) => { csrf = t; };

async function parse(res: Response) {
  const text = await res.text();
  try { return text ? JSON.parse(text) : {}; } catch { return { error: text.slice(0, 200) }; }
}

export async function api<T = any>(method: string, url: string, body?: unknown, opts: { silent401?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  let payload: BodyInit | undefined;
  if (body instanceof Blob || body instanceof ArrayBuffer) payload = body as BodyInit;
  else if (body !== undefined) { payload = JSON.stringify(body); headers["Content-Type"] = "application/json"; }
  if (method !== "GET" && csrf) headers["X-CSRF-Token"] = csrf;
  let res: Response;
  try {
    res = await fetch("/api/admin" + url, { method, headers, body: payload, credentials: "same-origin" });
  } catch {
    throw new ApiError(0, "Cannot reach the server. Check your connection and try again.");
  }
  const data = await parse(res);
  if (res.ok) return data as T;
  if (res.status === 401 && !opts.silent401) window.dispatchEvent(new Event("admin:unauthorized"));
  const { error, errors, ...extra } = data as { error?: string; errors?: Record<string, string> };
  throw new ApiError(res.status, error || `Request failed (${res.status})`, errors, extra);
}

export const upload = <T = any>(url: string, file: File) =>
  api<T>("POST", url, file as Blob);

export const fmtDate = (ms: number | null | undefined) =>
  ms ? new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export function timeAgo(ms: number): string {
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24); if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  return fmtDate(ms);
}

export const fmtSize = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
