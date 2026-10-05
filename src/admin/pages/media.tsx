import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, fmtDate, fmtSize, upload } from "../api";
import { useAuth } from "../auth";
import { copy, Empty, Loading, PageHead, useConfirm, useToast } from "../ui";

interface M { id: number; path: string; name: string; mime: string; size: number; alt: string; createdAt: number; uploadedBy: string | null }
interface B { path: string; name: string }

export function MediaPage() {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const input = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<{ items: M[]; builtIn: B[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [sel, setSel] = useState<M | null>(null);
  const [alt, setAlt] = useState("");

  const load = useCallback(() => api("GET", "/media").then(setData).catch((e) => toast(e.message, "error")), [toast]);
  useEffect(() => { load(); }, [load]);

  const send = async (files: FileList | File[] | null) => {
    if (!files?.length) return;
    setBusy(true);
    for (const f of Array.from(files)) {
      try { await upload(`/media?name=${encodeURIComponent(f.name)}`, f); toast(`Uploaded ${f.name}`); } catch (e) { toast(`${f.name}: ${(e as Error).message}`, "error"); }
    }
    setBusy(false);
    load();
  };

  const saveAlt = async () => {
    if (!sel) return;
    try { await api("PATCH", `/media/${sel.id}`, { alt }); toast("Saved"); load(); setSel({ ...sel, alt }); } catch (e) { toast((e as Error).message, "error"); }
  };

  const remove = async (m: M) => {
    const del = async (force: boolean) => api("DELETE", `/media/${m.id}${force ? "?force=1" : ""}`);
    if (!(await confirm({ title: "Delete image?", body: `${m.name} will be removed from the library.`, confirm: "Delete", danger: true }))) return;
    try { await del(false); }
    catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        if (!(await confirm({ title: "Image is in use", body: e.message, confirm: "Delete anyway", danger: true }))) return;
        try { await del(true); } catch (e2) { toast((e2 as Error).message, "error"); return; }
      } else { toast((e as Error).message, "error"); return; }
    }
    toast("Deleted"); setSel(null); load();
  };

  return (
    <>
      <PageHead title="Media library" sub="Upload images once and reuse them anywhere on the site."
        actions={<button className="btn primary" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Uploading…" : "⬆ Upload images"}</button>} />
      <input ref={input} type="file" hidden multiple accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => { send(e.target.files); e.target.value = ""; }} />
      <div className={`dropzone${drag ? " over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); send(e.dataTransfer.files); }}>
        Drag and drop images here, or use the button. JPG, PNG, WebP or GIF up to 5 MB.
      </div>

      {!data ? <Loading /> : (
        <>
          <section className="card">
            <header className="card-head"><h3>Your uploads</h3><span className="muted">{data.items.length}</span></header>
            {data.items.length === 0 ? <Empty icon="🖼" title="No uploads yet">Upload a logo, photo or banner to get started.</Empty> : (
              <div className="media-grid">
                {data.items.map((m) => (
                  <button key={m.id} type="button" className={`media-tile${sel?.id === m.id ? " on" : ""}`} onClick={() => { setSel(m); setAlt(m.alt); }}>
                    <img src={m.path} alt={m.alt} loading="lazy" /><span>{m.name}</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {sel && (
            <section className="card media-detail">
              <img src={sel.path} alt={sel.alt} />
              <div>
                <h3>{sel.name}</h3>
                <p className="muted">{fmtSize(sel.size)} · {sel.mime} · uploaded {fmtDate(sel.createdAt)}{sel.uploadedBy ? ` by ${sel.uploadedBy}` : ""}</p>
                <label className="field"><span className="lbl">Address</span>
                  <div className="color-row"><input readOnly value={sel.path} onFocus={(e) => e.currentTarget.select()} /><button className="btn sm" onClick={async () => toast((await copy(sel.path)) ? "Copied" : "Copy failed", "info")}>Copy</button></div>
                </label>
                <label className="field"><span className="lbl">Description (alt text)</span>
                  <input value={alt} maxLength={200} onChange={(e) => setAlt(e.target.value)} placeholder="Describe the image for people using screen readers" />
                </label>
                <div className="enq-actions">
                  <button className="btn primary" disabled={alt === sel.alt} onClick={saveAlt}>Save description</button>
                  {user.role === "admin" && <button className="btn danger-outline" onClick={() => remove(sel)}>Delete</button>}
                  <button className="btn" onClick={() => setSel(null)}>Close</button>
                </div>
              </div>
            </section>
          )}

          <section className="card">
            <header className="card-head"><h3>Site images</h3><span className="muted">Built in, read only</span></header>
            <div className="media-grid small">
              {data.builtIn.map((b) => (<div key={b.path} className="media-tile static"><img src={b.path} alt="" loading="lazy" /><span>{b.path}</span></div>))}
            </div>
          </section>
        </>
      )}
    </>
  );
}
