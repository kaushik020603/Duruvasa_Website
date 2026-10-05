import { useCallback, useEffect, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { api, ApiError, fmtDate, fmtSize, timeAgo } from "../api";
import { PasswordMeter, passwordChecks, useAuth } from "../auth";
import { href } from "../router";
import { copy, Empty, Loading, Modal, PageHead, Pill, useConfirm, useDebounced, useToast } from "../ui";

// ------------------------------------------------------------------ dashboard
interface Stats {
  enquiries: { total: number; new: number; inProgress: number; consultations: number; thisWeek: number };
  subscribers: { active: number; thisWeek: number };
  content: { items: number; drafts: number; media: number };
  recent: { id: number; type: string; name: string; email: string; status: string; createdAt: number }[];
}

export function Dashboard() {
  const { user } = useAuth();
  const toast = useToast();
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => { api<Stats>("GET", "/stats").then(setS).catch((e) => toast(e.message, "error")); }, [toast]);
  const first = (user.name || user.email).split(/[ @]/)[0];

  return (
    <>
      <PageHead title={`Welcome back, ${first}`} sub="Here is what is happening on the website." />
      {!user.totpEnabled && (
        <div className="banner warn">🔐 Protect this account with two-factor authentication. <a href={href("/security")}>Turn it on</a></div>
      )}
      {!s ? <Loading /> : (
        <>
          <div className="stat-grid">
            <a className="stat" href={href("/enquiries")}><span>New enquiries</span><b className={s.enquiries.new ? "hot" : ""}>{s.enquiries.new}</b><small>{s.enquiries.thisWeek} in the last 7 days</small></a>
            <a className="stat" href={href("/enquiries")}><span>Open consultations</span><b>{s.enquiries.consultations}</b><small>new or in progress</small></a>
            <a className="stat" href={href("/subscribers")}><span>Subscribers</span><b>{s.subscribers.active}</b><small>{s.subscribers.thisWeek} new this week</small></a>
            <a className="stat" href={href("/content/posts")}><span>Content items</span><b>{s.content.items}</b><small>{s.content.drafts} draft{s.content.drafts === 1 ? "" : "s"}</small></a>
          </div>
          <div className="dash-grid">
            <section className="card">
              <header className="card-head"><h3>Latest enquiries</h3><a href={href("/enquiries")}>View all →</a></header>
              {s.recent.length === 0 ? <Empty icon="✉" title="Nothing yet">New messages will show up here.</Empty> : (
                <ul className="recent">
                  {s.recent.map((r) => (
                    <li key={r.id}><a href={href(`/enquiries/${r.id}`)}>
                      <span><b>{r.name}</b><small>{r.email}</small></span>
                      <span>{r.type === "consultation" ? <Pill tone="purple">Consultation</Pill> : <Pill>Message</Pill>}{r.status === "new" && <Pill tone="blue">New</Pill>}<small>{timeAgo(r.createdAt)}</small></span>
                    </a></li>
                  ))}
                </ul>
              )}
            </section>
            <section className="card">
              <header className="card-head"><h3>Quick actions</h3></header>
              <div className="quick">
                <a href={href("/content/hero")}><span>★</span>Edit the home banner</a>
                <a href={href("/content/posts/new")}><span>✎</span>Write an article</a>
                <a href={href("/content/partners/new")}><span>🤝</span>Add a partner</a>
                <a href={href("/content/team")}><span>👤</span>Update the team</a>
                <a href={href("/media")}><span>🖼</span>Upload an image</a>
                <a href="/" target="_blank" rel="noopener"><span>↗</span>Open the website</a>
              </div>
            </section>
          </div>
        </>
      )}
    </>
  );
}

// ------------------------------------------------------------------ users
interface U { id: number; email: string; name: string; role: "admin" | "editor"; active: boolean; totpEnabled: boolean; hasPassword: boolean; pendingSetup: boolean; createdAt: number; lastLogin: number | null }

export function UsersPage() {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<U[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [link, setLink] = useState<{ email: string; url: string } | null>(null);
  const load = useCallback(() => api<{ items: U[] }>("GET", "/users").then((r) => setItems(r.items)).catch((e) => toast(e.message, "error")), [toast]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast(ok); load(); } catch (e) { toast((e as Error).message, "error"); } };

  const resetLink = async (u: U) => {
    try { const r = await api<{ setupLink: string }>("POST", `/users/${u.id}/reset-link`); setLink({ email: u.email, url: r.setupLink }); load(); } catch (e) { toast((e as Error).message, "error"); }
  };

  return (
    <>
      <PageHead title="Team access" sub="People who can sign in to this admin panel." actions={<button className="btn primary" onClick={() => setAdding(true)}>＋ Add person</button>} />
      <section className="card">
        {!items ? <Loading /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Person</th><th>Role</th><th className="hide-sm">Security</th><th className="hide-sm">Last sign-in</th><th className="right">Actions</th></tr></thead>
              <tbody>
                {items.map((u) => (
                  <tr key={u.id} className={u.active ? "" : "draft"}>
                    <td><b>{u.name || u.email}</b>{u.id === user.id && <Pill tone="green">You</Pill>}<div className="muted small">{u.email}</div></td>
                    <td>
                      <select value={u.role} disabled={u.id === user.id} aria-label={`Role for ${u.email}`} onChange={(e) => act(() => api("PATCH", `/users/${u.id}`, { role: e.target.value }), "Role updated")}>
                        <option value="admin">Administrator</option><option value="editor">Editor</option>
                      </select>
                    </td>
                    <td className="hide-sm">
                      {!u.hasPassword ? <Pill tone="amber">{u.pendingSetup ? "Invite pending" : "Invite expired"}</Pill> : u.totpEnabled ? <Pill tone="green">2FA on</Pill> : <Pill>2FA off</Pill>}
                      {!u.active && <Pill tone="red">Disabled</Pill>}
                    </td>
                    <td className="hide-sm muted">{u.lastLogin ? timeAgo(u.lastLogin) : "Never"}</td>
                    <td className="right nowrap">
                      <button className="btn sm" onClick={() => resetLink(u)}>{u.hasPassword ? "Reset password" : "New invite link"}</button>
                      {u.totpEnabled && u.id !== user.id && <button className="btn sm" onClick={async () => { if (await confirm({ title: "Turn off 2FA?", body: `${u.email} will be able to sign in with just a password until they set it up again.`, confirm: "Turn off", danger: true })) act(() => api("POST", `/users/${u.id}/reset-2fa`), "2FA turned off"); }}>Reset 2FA</button>}
                      {u.id !== user.id && <button className="btn sm" onClick={() => act(() => api("PATCH", `/users/${u.id}`, { active: !u.active }), u.active ? "Access disabled" : "Access restored")}>{u.active ? "Disable" : "Enable"}</button>}
                      {u.id !== user.id && <button className="icon-btn danger" aria-label={`Delete ${u.email}`} onClick={async () => { if (await confirm({ title: "Delete this person?", body: u.email, confirm: "Delete", danger: true })) act(() => api("DELETE", `/users/${u.id}`), "Deleted"); }}>🗑</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <div className="note-box">
        <b>Roles.</b> <em>Administrators</em> can do everything, including managing people, deleting enquiries and downloading backups.
        <em> Editors</em> can edit content, upload media and work through enquiries.
      </div>
      {adding && <AddUser onClose={() => setAdding(false)} onCreated={(email, url) => { setAdding(false); setLink({ email, url }); load(); }} />}
      {link && <LinkModal email={link.email} url={link.url} onClose={() => setLink(null)} />}
    </>
  );
}

function AddUser({ onClose, onCreated }: { onClose: () => void; onCreated: (email: string, url: string) => void }) {
  const [email, setEmail] = useState(""); const [name, setName] = useState(""); const [role, setRole] = useState("editor");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    try { const r = await api<{ setupLink: string }>("POST", "/users", { email, name, role }); onCreated(email, r.setupLink); }
    catch (x) { setErr(x instanceof ApiError ? x.message : "Failed"); } finally { setBusy(false); }
  };
  return (
    <Modal title="Add a person" onClose={onClose} small>
      <form onSubmit={submit} className="auth-form">
        <label>Email<input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" /></label>
        <label>Role<select value={role} onChange={(e) => setRole(e.target.value)}><option value="editor">Editor</option><option value="admin">Administrator</option></select></label>
        {err && <div className="banner error">{err}</div>}
        <button className="btn primary block" disabled={busy}>{busy ? "Creating…" : "Create and get invite link"}</button>
      </form>
    </Modal>
  );
}

function LinkModal({ email, url, onClose }: { email: string; url: string; onClose: () => void }) {
  const toast = useToast();
  return (
    <Modal title="Share this setup link" onClose={onClose}>
      <p>Send this one-time link to <b>{email}</b> so they can choose a password. It works once and expires soon. Anyone with the link can set the password, so share it privately.</p>
      <textarea readOnly rows={4} value={url} onFocus={(e) => e.currentTarget.select()} />
      <div className="modal-actions"><button className="btn primary" onClick={async () => toast((await copy(url)) ? "Link copied" : "Copy failed", "info")}>Copy link</button><button className="btn" onClick={onClose}>Done</button></div>
    </Modal>
  );
}

// ------------------------------------------------------------------ my security
export function SecurityPage() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState(""); const [next, setNext] = useState(""); const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const pwOk = passwordChecks(next, user.email).every((c) => c.ok) && next === again && !!current;

  const change = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { await api("POST", "/auth/password", { current, next }); toast("Password changed. Other devices were signed out."); setCurrent(""); setNext(""); setAgain(""); }
    catch (x) { toast((x as Error).message, "error"); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHead title="My security" sub={`Signed in as ${user.email}`} />
      <div className="two-col">
        <section className="card">
          <header className="card-head"><h3>Change password</h3></header>
          <form onSubmit={change} className="auth-form">
            <label>Current password<input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></label>
            <label>New password<input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></label>
            <PasswordMeter value={next} email={user.email} />
            <label>Repeat new password<input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />{again && next !== again && <span className="error-text">Passwords do not match.</span>}</label>
            <button className="btn primary" disabled={!pwOk || busy}>{busy ? "Saving…" : "Change password"}</button>
          </form>
        </section>
        <TwoFactor enabled={user.totpEnabled} email={user.email} onChanged={refresh} />
      </div>
    </>
  );
}

function TwoFactor({ enabled, email, onChanged }: { enabled: boolean; email: string; onChanged: () => Promise<void> }) {
  const toast = useToast();
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState(""); const [pw, setPw] = useState(""); const [busy, setBusy] = useState(false);

  const begin = async () => {
    try {
      const r = await api<{ secret: string; uri: string }>("POST", "/auth/2fa/begin");
      setSetup({ secret: r.secret, qr: await QRCode.toDataURL(r.uri, { margin: 1, width: 200 }) });
    } catch (e) { toast((e as Error).message, "error"); }
  };
  const enable = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { await api("POST", "/auth/2fa/enable", { code }); toast("Two-factor authentication is on"); setSetup(null); setCode(""); await onChanged(); }
    catch (x) { toast((x as Error).message, "error"); } finally { setBusy(false); }
  };
  const disable = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { await api("POST", "/auth/2fa/disable", { password: pw }); toast("Two-factor authentication is off"); setPw(""); await onChanged(); }
    catch (x) { toast((x as Error).message, "error"); } finally { setBusy(false); }
  };

  return (
    <section className="card">
      <header className="card-head"><h3>Two-factor authentication</h3>{enabled ? <Pill tone="green">On</Pill> : <Pill tone="amber">Off</Pill>}</header>
      {enabled ? (
        <form onSubmit={disable} className="auth-form">
          <p>Your account needs a code from your authenticator app at every sign-in.</p>
          <label>Confirm your password to turn it off<input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
          <button className="btn danger-outline" disabled={!pw || busy}>Turn off 2FA</button>
        </form>
      ) : !setup ? (
        <div className="auth-form">
          <p>Add a second step to sign-in using an app such as Google Authenticator, Microsoft Authenticator or 1Password. Even if your password leaks, nobody can sign in without your phone.</p>
          <button className="btn primary" onClick={begin}>Set up 2FA</button>
        </div>
      ) : (
        <form onSubmit={enable} className="auth-form">
          <ol className="steps-list">
            <li>Scan this code with your authenticator app.</li>
            <li>Enter the 6-digit code it shows to finish.</li>
          </ol>
          <img className="qr" src={setup.qr} alt={`QR code to add ${email} to your authenticator app`} width={200} height={200} />
          <p className="muted small">Cannot scan? Enter this key manually: <code>{setup.secret}</code></p>
          <label>6-digit code<input inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} placeholder="123 456" autoFocus /></label>
          <div className="enq-actions"><button className="btn primary" disabled={code.replace(/\s/g, "").length !== 6 || busy}>Turn on 2FA</button><button type="button" className="btn" onClick={() => setSetup(null)}>Cancel</button></div>
        </form>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ backups
export function BackupsPage() {
  const toast = useToast();
  const [items, setItems] = useState<{ file: string; size: number; createdAt: number }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api<{ items: { file: string; size: number; createdAt: number }[] }>("GET", "/backups").then((r) => setItems(r.items)).catch((e) => toast(e.message, "error")), [toast]);
  useEffect(() => { load(); }, [load]);
  const create = async () => { setBusy(true); try { await api("POST", "/backups"); toast("Backup created"); load(); } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); } };

  return (
    <>
      <PageHead title="Backups" sub="A full copy of the database (content, enquiries, subscribers, people). Created automatically every day; the latest 14 are kept."
        actions={<button className="btn primary" disabled={busy} onClick={create}>{busy ? "Creating…" : "Create backup now"}</button>} />
      <section className="card">
        {!items ? <Loading /> : items.length === 0 ? <Empty icon="💾" title="No backups yet">Create one with the button above.</Empty> : (
          <table className="table"><thead><tr><th>File</th><th>Created</th><th>Size</th><th className="right">Download</th></tr></thead>
            <tbody>{items.map((b) => (
              <tr key={b.file}><td><code>{b.file}</code></td><td className="muted">{fmtDate(b.createdAt)}</td><td className="muted">{fmtSize(b.size)}</td>
                <td className="right"><a className="btn sm" href={`/api/admin/backups/${b.file}`}>⬇ Download</a></td></tr>
            ))}</tbody></table>
        )}
      </section>
      <div className="note-box"><b>Uploaded images and the checklist PDF</b> live in the server's <code>data/uploads</code> and <code>data/private</code> folders. Back those up too (see the deployment guide).</div>
    </>
  );
}

// ------------------------------------------------------------------ audit log
export function AuditPage() {
  const toast = useToast();
  const [q, setQ] = useState(""); const dq = useDebounced(q);
  const [items, setItems] = useState<{ id: number; at: number; actor: string; action: string; entity: string; detail: string; ip: string }[] | null>(null);
  useEffect(() => { api<{ items: typeof items }>("GET", `/audit?limit=200&q=${encodeURIComponent(dq)}`).then((r) => setItems(r.items)).catch((e) => toast(e.message, "error")); }, [dq, toast]);
  const tone = (a: string) => (a.includes("failed") || a.includes("delete") ? "red" : a.startsWith("login") || a.includes("password") || a.includes("2fa") ? "purple" : "gray");

  return (
    <>
      <PageHead title="Activity log" sub="Who did what and when. Useful for security reviews." />
      <section className="card">
        <div className="toolbar"><input className="search" type="search" placeholder="Search by person, action or detail…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search activity" /></div>
        {!items ? <Loading /> : items.length === 0 ? <Empty icon="📜" title="No activity found" /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>When</th><th>Person</th><th>Action</th><th className="hide-sm">Detail</th><th className="hide-sm">IP</th></tr></thead>
            <tbody>{items.map((a) => (
              <tr key={a.id}><td className="nowrap muted">{fmtDate(a.at)}</td><td>{a.actor}</td><td><Pill tone={tone(a.action) as "red" | "purple" | "gray"}>{a.action}</Pill></td><td className="hide-sm muted">{a.entity ? `${a.entity}: ` : ""}{a.detail}</td><td className="hide-sm muted">{a.ip}</td></tr>
            ))}</tbody></table></div>
        )}
      </section>
    </>
  );
}
