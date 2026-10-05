import { useCallback, useEffect, useState } from "react";
import { api, fmtDate, timeAgo } from "../api";
import { useAuth } from "../auth";
import { go, href, type Loc } from "../router";
import { Drawer, Empty, Loading, PageHead, Pager, Pill, useConfirm, useDebounced, useToast } from "../ui";

interface Enq { id: number; type: "message" | "consultation"; first: string; last: string; email: string; phone: string; message: string; preferredTime: string; status: Status; notes: string; source: string; createdAt: number; updatedAt: number }
type Status = "new" | "in_progress" | "done" | "spam";

const STATUS: Record<Status, { label: string; tone: "blue" | "amber" | "green" | "gray" }> = {
  new: { label: "New", tone: "blue" }, in_progress: { label: "In progress", tone: "amber" }, done: { label: "Done", tone: "green" }, spam: { label: "Spam", tone: "gray" },
};
const TABS: { key: string; label: string }[] = [
  { key: "", label: "All" }, { key: "new", label: "New" }, { key: "in_progress", label: "In progress" }, { key: "done", label: "Done" }, { key: "spam", label: "Spam" },
];

export function EnquiriesPage({ loc }: { loc: Loc }) {
  const toast = useToast();
  const openId = loc.parts[1] ? Number(loc.parts[1]) : null;
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const [data, setData] = useState<{ items: Enq[]; total: number; size: number; counts: Record<string, number> } | null>(null);

  const load = useCallback(() => {
    const p = new URLSearchParams({ page: String(page), size: "15" });
    if (status) p.set("status", status);
    if (type) p.set("type", type);
    if (dq) p.set("q", dq);
    api("GET", `/enquiries?${p}`).then(setData).catch((e) => toast(e.message, "error"));
  }, [page, status, type, dq, toast]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [status, type, dq]);

  const exportHref = `/api/admin/enquiries/export.csv?${new URLSearchParams({ ...(status && { status }), ...(type && { type }), ...(dq && { q: dq }) })}`;
  const total = data ? Object.values(data.counts).reduce((a, b) => a + b, 0) : 0;

  return (
    <>
      <PageHead title="Enquiries" sub="Messages and consultation requests from the website."
        actions={<a className="btn" href={exportHref}>⬇ Export CSV</a>} />
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={status === t.key ? "on" : ""} onClick={() => setStatus(t.key)}>
            {t.label}<span className="count">{t.key ? data?.counts[t.key] ?? 0 : total}</span>
          </button>
        ))}
      </div>
      <section className="card">
        <div className="toolbar">
          <input className="search" type="search" placeholder="Search name, email or message…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search enquiries" />
          <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by type">
            <option value="">All types</option><option value="message">Messages</option><option value="consultation">Consultations</option>
          </select>
        </div>
        {!data ? <Loading /> : data.items.length === 0 ? (
          <Empty icon="✉" title="No enquiries here">{status || type || dq ? "Try clearing the filters." : "New messages and consultation requests will appear here."}</Empty>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table clickable">
                <thead><tr><th>Received</th><th>From</th><th>Type</th><th className="hide-sm">Message</th><th>Status</th></tr></thead>
                <tbody>
                  {data.items.map((e) => (
                    <tr key={e.id} className={e.status === "new" ? "unread" : ""} onClick={() => go(`/enquiries/${e.id}`)} tabIndex={0} onKeyDown={(k) => { if (k.key === "Enter") go(`/enquiries/${e.id}`); }}>
                      <td className="nowrap muted" title={fmtDate(e.createdAt)}>{timeAgo(e.createdAt)}</td>
                      <td><b>{e.first} {e.last}</b><div className="muted small">{e.email}</div></td>
                      <td>{e.type === "consultation" ? <Pill tone="purple">Consultation</Pill> : <Pill>Message</Pill>}</td>
                      <td className="hide-sm muted">{e.message.length > 80 ? e.message.slice(0, 80) + "…" : e.message}</td>
                      <td><Pill tone={STATUS[e.status].tone}>{STATUS[e.status].label}</Pill></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={page} size={data.size} total={data.total} onPage={setPage} />
          </>
        )}
      </section>
      {openId && <EnquiryDrawer id={openId} onClose={() => go("/enquiries")} onChanged={load} />}
    </>
  );
}

function EnquiryDrawer({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [e, setE] = useState<Enq | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ item: Enq }>("GET", `/enquiries/${id}`).then((r) => { setE(r.item); setNotes(r.item.notes); })
      .catch((err) => { toast(err.message, "error"); onClose(); });
  }, [id, onClose, toast]);

  const patch = async (body: Partial<Pick<Enq, "status" | "notes">>, msg: string) => {
    setBusy(true);
    try { const r = await api<{ item: Enq }>("PATCH", `/enquiries/${id}`, body); setE(r.item); setNotes(r.item.notes); toast(msg); onChanged(); } catch (err) { toast((err as Error).message, "error"); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!(await confirm({ title: "Delete this enquiry?", body: "It will be permanently removed.", confirm: "Delete", danger: true }))) return;
    try { await api("DELETE", `/enquiries/${id}`); toast("Deleted"); onChanged(); onClose(); } catch (err) { toast((err as Error).message, "error"); }
  };

  return (
    <Drawer title={e ? `${e.first} ${e.last}` : "Enquiry"} onClose={onClose}>
      {!e ? <Loading /> : (
        <div className="enq">
          <div className="enq-top">
            {e.type === "consultation" ? <Pill tone="purple">Consultation request</Pill> : <Pill>Message</Pill>}
            <Pill tone={STATUS[e.status].tone}>{STATUS[e.status].label}</Pill>
            <span className="muted small">Received {fmtDate(e.createdAt)}</span>
          </div>
          {e.preferredTime && <div className="callout">📅 Preferred time: <b>{e.preferredTime}</b></div>}
          <dl className="kv">
            <dt>Email</dt><dd><a href={`mailto:${e.email}?subject=${encodeURIComponent("Re: your enquiry to DuRuVaSa CloudSec")}`}>{e.email}</a></dd>
            {e.phone && <><dt>Phone</dt><dd><a href={`tel:${e.phone}`}>{e.phone}</a></dd></>}
            {e.source && <><dt>Source</dt><dd>{e.source}</dd></>}
          </dl>
          <h4>Message</h4>
          <p className="message">{e.message}</p>
          <div className="enq-actions">
            <a className="btn primary" href={`mailto:${e.email}?subject=${encodeURIComponent("Re: your enquiry to DuRuVaSa CloudSec")}`}>✉ Reply by email</a>
            {e.phone && <a className="btn" href={`tel:${e.phone}`}>📞 Call</a>}
          </div>
          <h4>Status</h4>
          <div className="seg">
            {(Object.keys(STATUS) as Status[]).map((s) => (
              <button key={s} disabled={busy} className={e.status === s ? "on" : ""} onClick={() => e.status !== s && patch({ status: s }, `Marked ${STATUS[s].label.toLowerCase()}`)}>{STATUS[s].label}</button>
            ))}
          </div>
          <h4>Internal notes</h4>
          <textarea rows={4} value={notes} maxLength={4000} onChange={(ev) => setNotes(ev.target.value)} placeholder="Only visible to admins, e.g. call outcome, next step…" />
          <div className="enq-actions">
            <button className="btn" disabled={busy || notes === e.notes} onClick={() => patch({ notes }, "Notes saved")}>Save notes</button>
            {user.role === "admin" && <button className="btn danger-outline" onClick={remove}>Delete</button>}
          </div>
        </div>
      )}
    </Drawer>
  );
}

// ------------------------------------------------------------------ subscribers
interface Sub { id: number; email: string; name: string; source: string; status: "active" | "unsubscribed"; consentAt: number; createdAt: number }

export function SubscribersPage() {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const [data, setData] = useState<{ items: Sub[]; total: number; size: number } | null>(null);

  const load = useCallback(() => {
    const p = new URLSearchParams({ page: String(page), size: "25" });
    if (status) p.set("status", status);
    if (dq) p.set("q", dq);
    api("GET", `/subscribers?${p}`).then(setData).catch((e) => toast(e.message, "error"));
  }, [page, status, dq, toast]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [status, dq]);

  const setSubStatus = async (s: Sub, next: Sub["status"]) => {
    try { await api("PATCH", `/subscribers/${s.id}`, { status: next }); toast(next === "active" ? "Resubscribed" : "Marked unsubscribed"); load(); } catch (e) { toast((e as Error).message, "error"); }
  };
  const remove = async (s: Sub) => {
    if (!(await confirm({ title: "Delete subscriber?", body: <>{s.email} will be permanently removed.</>, confirm: "Delete", danger: true }))) return;
    try { await api("DELETE", `/subscribers/${s.id}`); toast("Deleted"); load(); } catch (e) { toast((e as Error).message, "error"); }
  };

  return (
    <>
      <PageHead title="Subscribers" sub="People who requested a download and agreed to hear from you."
        actions={<a className="btn" href="/api/admin/subscribers/export.csv">⬇ Export active (CSV)</a>} />
      <section className="card">
        <div className="toolbar">
          <input className="search" type="search" placeholder="Search email or name…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search subscribers" />
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
            <option value="">All</option><option value="active">Active</option><option value="unsubscribed">Unsubscribed</option>
          </select>
        </div>
        {!data ? <Loading /> : data.items.length === 0 ? <Empty icon="✉" title="No subscribers yet">Visitors who download the checklist appear here.</Empty> : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Email</th><th className="hide-sm">Name</th><th className="hide-sm">Source</th><th>Joined</th><th>Status</th><th className="right">Actions</th></tr></thead>
                <tbody>
                  {data.items.map((s) => (
                    <tr key={s.id}>
                      <td><a href={`mailto:${s.email}`}>{s.email}</a></td>
                      <td className="hide-sm">{s.name || <span className="muted">—</span>}</td>
                      <td className="hide-sm muted">{s.source || "—"}</td>
                      <td className="nowrap muted">{fmtDate(s.createdAt)}</td>
                      <td>{s.status === "active" ? <Pill tone="green">Active</Pill> : <Pill>Unsubscribed</Pill>}</td>
                      <td className="right nowrap">
                        <button className="btn sm" onClick={() => setSubStatus(s, s.status === "active" ? "unsubscribed" : "active")}>{s.status === "active" ? "Unsubscribe" : "Resubscribe"}</button>
                        {user.role === "admin" && <button className="icon-btn danger" aria-label="Delete" onClick={() => remove(s)}>🗑</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={page} size={data.size} total={data.total} onPage={setPage} />
          </>
        )}
      </section>
      <p className="muted small">Only email people who have consented. Honour unsubscribe requests by marking them here.</p>
    </>
  );
}

export { href };
