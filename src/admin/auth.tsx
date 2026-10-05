import { createContext, useContext, useState, type FormEvent } from "react";
import { api, ApiError, setCsrf } from "./api";
import { href, type Loc } from "./router";

export interface User { id: number; email: string; name: string; role: "admin" | "editor"; totpEnabled: boolean }
interface AuthState { user: User; refresh: () => Promise<void>; signOut: () => Promise<void> }

export const AuthCtx = createContext<AuthState | null>(null);
export const useAuth = () => {
  const v = useContext(AuthCtx);
  if (!v) throw new Error("useAuth outside provider");
  return v;
};

// ------------------------------------------------------------------ password strength (mirrors the server policy)
export function passwordChecks(pw: string, email = "") {
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  const local = email.split("@")[0]?.toLowerCase();
  return [
    { ok: pw.length >= 12, text: "At least 12 characters" },
    { ok: classes >= 3, text: "Three of: lowercase, UPPERCASE, number, symbol" },
    { ok: !local || local.length < 4 || !pw.toLowerCase().includes(local), text: "Does not contain your email name" },
  ];
}

export function PasswordMeter({ value, email }: { value: string; email?: string }) {
  const checks = passwordChecks(value, email);
  const score = value ? checks.filter((c) => c.ok).length + (value.length >= 16 ? 1 : 0) : 0;
  return (
    <div className="meter" aria-live="polite">
      <div className="meter-bar"><i style={{ width: `${(score / 4) * 100}%` }} className={`s${score}`} /></div>
      <ul>{checks.map((c) => <li key={c.text} className={c.ok ? "ok" : ""}>{c.ok ? "✓" : "○"} {c.text}</li>)}</ul>
    </div>
  );
}

function Shell({ children, title, sub }: { children: React.ReactNode; title: string; sub?: string }) {
  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand"><span className="shield" aria-hidden="true">🛡</span><div><b>DuRuVaSa</b><small>Admin</small></div></div>
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
        {children}
      </div>
      <p className="auth-foot">Secured area. Activity is logged.</p>
    </main>
  );
}

export function Login({ onSignedIn, notice }: { onSignedIn: (u: User, csrf: string) => void; notice?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needs2fa, setNeeds2fa] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const r = await api<{ needs2fa?: boolean; user?: User; csrf?: string }>("POST", "/auth/login", { email, password, code }, { silent401: true });
      if (r.needs2fa) { setNeeds2fa(true); return; }
      if (r.user && r.csrf) onSignedIn(r.user, r.csrf);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
      if (needs2fa) setCode("");
    } finally { setBusy(false); }
  };

  if (forgot) return <Forgot initialEmail={email} onBack={() => setForgot(false)} />;

  return (
    <Shell title="Sign in" sub="Manage your website content and enquiries.">
      {notice && <div className="banner info">{notice}</div>}
      <form onSubmit={submit} className="auth-form">
        {!needs2fa ? (
          <>
            <label>Email<input type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          </>
        ) : (
          <label>Authentication code
            <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} required autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="123 456" />
            <span className="help">Open your authenticator app and enter the 6-digit code.</span>
          </label>
        )}
        {error && <div className="banner error" role="alert">{error}</div>}
        <button className="btn primary block" disabled={busy}>{busy ? "Signing in…" : needs2fa ? "Verify and sign in" : "Sign in"}</button>
        {needs2fa && <button type="button" className="link" onClick={() => { setNeeds2fa(false); setCode(""); }}>← Back</button>}
      </form>
      {!needs2fa && <button type="button" className="link forgot-link" onClick={() => setForgot(true)}>Forgot or want to change your password?</button>}
    </Shell>
  );
}

function Forgot({ initialEmail, onBack }: { initialEmail: string; onBack: () => void }) {
  const [email, setEmail] = useState(initialEmail);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [code, setCode] = useState("");
  const [needs2fa, setNeeds2fa] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const ready = !!email && !!current && passwordChecks(next, email).every((c) => c.ok) && next === again;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true); setError("");
    try {
      const r = await api<{ ok?: boolean; needs2fa?: boolean }>("POST", "/auth/change-password", { email, current, next, code }, { silent401: true });
      if (r.needs2fa) setNeeds2fa(true); else setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
      if (needs2fa) setCode("");
    } finally { setBusy(false); }
  };

  if (done) {
    return (
      <Shell title="Password changed">
        <div className="auth-form">
          <div className="banner info" role="status">Your password has been updated and any other sessions were signed out. Sign in with your new password.</div>
          <button className="btn primary block" onClick={onBack}>Go to sign in</button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title="Change your password" sub="Enter your current password and choose a new one.">
      <form onSubmit={submit} className="auth-form">
        <label>Email<input type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Current (old) password<input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} /></label>
        <label>New password<input type="password" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} /></label>
        <PasswordMeter value={next} email={email} />
        <label>Repeat new password<input type="password" autoComplete="new-password" required value={again} onChange={(e) => setAgain(e.target.value)} />
          {again && next !== again && <span className="error-text">Passwords do not match.</span>}
        </label>
        {needs2fa && (
          <label>Authentication code
            <input inputMode="numeric" autoComplete="one-time-code" maxLength={7} required autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="123 456" />
            <span className="help">Two-factor authentication is on for this account.</span>
          </label>
        )}
        {error && <div className="banner error" role="alert">{error}</div>}
        <button className="btn primary block" disabled={!ready || busy}>{busy ? "Saving…" : needs2fa ? "Verify and change password" : "Change password"}</button>
        <button type="button" className="link" onClick={onBack}>← Back to sign in</button>
      </form>
      <p className="auth-help">Forgot the current password too? Ask another administrator to reset it from <b>Team access</b>, or run <code>npm run admin:link</code> on the server.</p>
    </Shell>
  );
}

export function Setup({ loc, onSignedIn }: { loc: Loc; onSignedIn: (u: User, csrf: string) => void }) {
  const email = loc.query.get("email") ?? "";
  const token = loc.query.get("token") ?? "";
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const ok = passwordChecks(password, email).every((c) => c.ok) && password === again;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ok) return;
    setBusy(true); setError("");
    try {
      const r = await api<{ user: User; csrf: string }>("POST", "/auth/setup", { email, token, password, name }, { silent401: true });
      history.replaceState(null, "", "/admin/");
      onSignedIn(r.user, r.csrf);
    } catch (err) { setError(err instanceof ApiError ? err.message : "Something went wrong."); } finally { setBusy(false); }
  };

  if (!email || !token) {
    return <Shell title="Setup link needed"><div className="banner error">This page needs a valid setup link. <a href={href("/")}>Back to sign in</a></div></Shell>;
  }
  return (
    <Shell title="Choose your password" sub={`Setting up ${email}`}>
      <form onSubmit={submit} className="auth-form">
        <label>Your name<input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" /></label>
        <label>New password<input type="password" autoComplete="new-password" required autoFocus value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <PasswordMeter value={password} email={email} />
        <label>Repeat password<input type="password" autoComplete="new-password" required value={again} onChange={(e) => setAgain(e.target.value)} />
          {again && password !== again && <span className="error-text">Passwords do not match.</span>}
        </label>
        {error && <div className="banner error" role="alert">{error}</div>}
        <button className="btn primary block" disabled={!ok || busy}>{busy ? "Saving…" : "Set password and sign in"}</button>
      </form>
      <p className="auth-help">Tip: a passphrase of four or more random words is strong and easy to remember. You can turn on two-factor authentication after signing in.</p>
    </Shell>
  );
}

export { setCsrf };
