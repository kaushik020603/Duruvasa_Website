import crypto from "node:crypto";

// ------------------------------------------------------------------ tokens & hashing
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");
export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// ------------------------------------------------------------------ passwords (scrypt)
const N = 1 << 15, R = 8, P = 1, KEYLEN = 64;

function scrypt(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    crypto.scrypt(password.normalize("NFKC"), salt, KEYLEN, { N: n, r, p, maxmem: 128 * 1024 * 1024 }, (e, k) => (e ? reject(e) : resolve(k)))
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  // Always do the work, even for unknown users, so response time does not reveal whether an account exists.
  const parts = (stored ?? "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") {
    await scrypt(password, Buffer.alloc(16), N, R, P);
    return false;
  }
  const [, n, r, p, salt, hash] = parts;
  const key = await scrypt(password, Buffer.from(salt, "base64"), Number(n), Number(r), Number(p));
  const expected = Buffer.from(hash, "base64");
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

const COMMON = new Set(["password1234", "123456789012", "qwertyuiop12", "administrator", "welcome12345", "changeme1234", "letmein12345"]);

/** Returns an error message, or null when the password is acceptable. */
export function passwordProblem(pw: string, email = ""): string | null {
  if (pw.length < 12) return "Use at least 12 characters.";
  if (pw.length > 200) return "That password is too long.";
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (classes < 3) return "Mix at least three of: lowercase, uppercase, numbers and symbols.";
  if (COMMON.has(pw.toLowerCase())) return "That password is too common.";
  const local = email.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && pw.toLowerCase().includes(local)) return "The password must not contain your email name.";
  if (/^(.)\1+$/.test(pw)) return "That password is too repetitive.";
  return null;
}

// ------------------------------------------------------------------ TOTP (RFC 6238)
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function newTotpSecret(): string {
  const bytes = crypto.randomBytes(20);
  let bits = "", out = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function b32decode(s: string): Buffer {
  let bits = "";
  for (const ch of s.replace(/=+$/, "").toUpperCase()) {
    const v = B32.indexOf(ch);
    if (v < 0) throw new Error("bad base32");
    bits += v.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function totpAt(secret: string, timeMs: number): string {
  const counter = Math.floor(timeMs / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac("sha1", b32decode(secret)).update(buf).digest();
  const off = h[h.length - 1] & 0xf;
  const code = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(code % 1_000_000).padStart(6, "0");
}

/** Accepts the current code and one step either side to tolerate clock drift. */
export function verifyTotp(secret: string, code: string, timeMs = Date.now()): boolean {
  const c = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return false;
  return [-1, 0, 1].some((d) => safeEqual(totpAt(secret, timeMs + d * 30_000), c));
}

export const totpUri = (secret: string, email: string, issuer = "DuRuVaSa CloudSec") =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

// ------------------------------------------------------------------ in-memory sliding-window rate limiter
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private max: number, private windowMs: number) {
    setInterval(() => this.sweep(), 60_000).unref();
  }
  /** Records a hit and returns true when the caller is over the limit. */
  hit(key: string): boolean {
    const t = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((x) => t - x < this.windowMs);
    recent.push(t);
    this.hits.set(key, recent);
    return recent.length > this.max;
  }
  retryAfterSeconds(key: string): number {
    const first = this.hits.get(key)?.[0];
    return first ? Math.max(1, Math.ceil((first + this.windowMs - Date.now()) / 1000)) : 1;
  }
  private sweep() {
    const t = Date.now();
    for (const [k, v] of this.hits) {
      const r = v.filter((x) => t - x < this.windowMs);
      if (r.length) this.hits.set(k, r); else this.hits.delete(k);
    }
  }
}
