import { useEffect, useMemo, useRef, useState } from "react";
import { blankDoc, entityMap, validateFields, type Entity, type Errors, type Field } from "../../../shared/schema";
import { api, ApiError, fmtDate, fmtSize } from "../api";
import { Form, FormCard } from "../form";
import { go, href } from "../router";
import { Empty, Loading, PageHead, Pill, Switch, useConfirm, useToast, useUnsavedWarning } from "../ui";

/** Fill any missing keys (new fields, empty lists) so the form always has a complete shape. */
function fill(fields: Field[], data: Record<string, any> | undefined): Record<string, any> {
  const base = blankDoc(fields);
  const out: Record<string, any> = { ...base, ...(data ?? {}) };
  for (const f of fields) {
    if (f.type === "object") out[f.key] = fill(f.fields ?? [], out[f.key]);
    if ((f.type === "list" || f.type === "tags") && !Array.isArray(out[f.key])) out[f.key] = [];
  }
  return out;
}

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

const SITE_PATH: Record<string, (slug: string) => string> = {
  services: (s) => `/services/${s}`, posts: (s) => `/insights/${s}`, legal: (s) => `/${s}`,
};

export function ContentPage({ parts }: { parts: string[] }) {
  const entity = entityMap[parts[0]];
  if (!entity) return <Empty icon="?" title="Unknown section">That content type does not exist. Pick one from the menu.</Empty>;
  if (entity.kind === "singleton") return <SingletonEditor key={entity.key} entity={entity} />;
  if (!parts[1]) return <CollectionList key={entity.key} entity={entity} />;
  return <ItemEditor key={`${entity.key}-${parts[1]}`} entity={entity} id={parts[1]} />;
}

// ------------------------------------------------------------------ singleton
function SingletonEditor({ entity }: { entity: Entity }) {
  const toast = useToast();
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [saved, setSaved] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState<{ updatedAt: number | null; updatedBy: string | null }>({ updatedAt: null, updatedBy: null });

  useEffect(() => {
    api<{ data: Record<string, any>; updatedAt: number | null; updatedBy: string | null }>("GET", `/content/${entity.key}`)
      .then((r) => { const d = fill(entity.fields, r.data); setData(d); setSaved(JSON.stringify(d)); setMeta(r); })
      .catch((e) => toast(e.message, "error"));
  }, [entity, toast]);

  const dirty = data !== null && JSON.stringify(data) !== saved;
  useUnsavedWarning(dirty);
  if (!data) return <Loading />;

  const save = async () => {
    const errs: Errors = {};
    const clean = validateFields(entity.fields, data, "", errs);
    setErrors(errs);
    if (Object.keys(errs).length) { toast("Please fix the highlighted fields.", "error"); return; }
    setBusy(true);
    try {
      const r = await api<{ data: Record<string, any> }>("PUT", `/content/${entity.key}`, { data: clean });
      const d = fill(entity.fields, r.data);
      setData(d); setSaved(JSON.stringify(d)); setMeta({ updatedAt: Date.now(), updatedBy: "you" });
      toast("Saved. The website is updated.");
    } catch (e) {
      if (e instanceof ApiError && e.errors) setErrors(e.errors);
      toast((e as Error).message, "error");
    } finally { setBusy(false); }
  };

  return (
    <>
      <PageHead title={entity.label} sub={entity.description} actions={<a className="btn" href="/" target="_blank" rel="noopener">View site ↗</a>} />
      <FormCard>
        <Form fields={entity.fields} value={data} errors={errors} onChange={(v) => { setData(v); }} />
      </FormCard>
      <SaveBar dirty={dirty} busy={busy} onSave={save} onDiscard={() => setData(JSON.parse(saved))} note={meta.updatedAt ? `Last saved ${fmtDate(meta.updatedAt)}${meta.updatedBy ? ` by ${meta.updatedBy}` : ""}` : ""} />
    </>
  );
}

export function SaveBar({ dirty, busy, onSave, onDiscard, note, extra }: { dirty: boolean; busy: boolean; onSave: () => void; onDiscard: () => void; note?: string; extra?: React.ReactNode }) {
  return (
    <div className={`savebar${dirty ? " dirty" : ""}`}>
      <span className="savebar-note">{dirty ? "● You have unsaved changes" : note || "All changes saved"}</span>
      <span className="savebar-actions">
        {extra}
        <button className="btn" disabled={!dirty || busy} onClick={onDiscard}>Discard</button>
        <button className="btn primary" disabled={!dirty || busy} onClick={onSave}>{busy ? "Saving…" : "Save changes"}</button>
      </span>
    </div>
  );
}

// ------------------------------------------------------------------ collection list
interface Item { id: number; key: string; data: Record<string, any>; published: boolean; position: number; updatedAt: number; updatedBy: string | null }

function subtitle(e: Entity, d: Record<string, any>): string {
  const f = e.fields.find((x) => x.key !== e.titleField && ["text", "url", "date", "slug", "textarea"].includes(x.type) && d[x.key]);
  const v = f ? String(d[f.key]) : "";
  return v.length > 90 ? v.slice(0, 90) + "…" : v;
}

function CollectionList({ entity }: { entity: Entity }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<Item[] | null>(null);
  const [q, setQ] = useState("");
  const load = () => api<{ items: Item[] }>("GET", `/content/${entity.key}`).then((r) => setItems(r.items)).catch((e) => toast(e.message, "error"));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [entity.key]);

  const shown = useMemo(() => {
    if (!items) return [];
    const t = q.trim().toLowerCase();
    return t ? items.filter((i) => JSON.stringify(i.data).toLowerCase().includes(t)) : items;
  }, [items, q]);

  const togglePublished = async (it: Item, published: boolean) => {
    try { await api("PUT", `/content/${entity.key}/${it.id}`, { data: it.data, published }); toast(published ? "Published" : "Moved to drafts"); load(); } catch (e) { toast((e as Error).message, "error"); }
  };
  const move = async (idx: number, d: number) => {
    if (!items) return;
    const j = idx + d;
    if (j < 0 || j >= items.length) return;
    const next = items.slice();
    [next[idx], next[j]] = [next[j], next[idx]];
    setItems(next);
    try { await api("POST", `/content/${entity.key}/reorder`, { ids: next.map((i) => i.id) }); } catch (e) { toast((e as Error).message, "error"); load(); }
  };
  const duplicate = async (it: Item) => {
    try { const r = await api<{ item: Item }>("POST", `/content/${entity.key}/${it.id}/duplicate`); toast("Duplicated as a draft"); go(`/content/${entity.key}/${r.item.id}`); } catch (e) { toast((e as Error).message, "error"); }
  };
  const remove = async (it: Item) => {
    const name = String(it.data[entity.titleField ?? ""] ?? "this item");
    if (!(await confirm({ title: `Delete ${entity.singular ?? "item"}?`, body: <>“{name}” will be removed from the website. This cannot be undone.</>, confirm: "Delete", danger: true }))) return;
    try { await api("DELETE", `/content/${entity.key}/${it.id}`); toast("Deleted"); load(); } catch (e) { toast((e as Error).message, "error"); }
  };

  return (
    <>
      <PageHead title={entity.label} sub={entity.description}
        actions={<a className="btn primary" href={href(`/content/${entity.key}/new`)}>＋ Add {entity.singular ?? "item"}</a>} />
      {!items ? <Loading /> : items.length === 0 ? (
        <Empty icon="＋" title={`No ${entity.label.toLowerCase()} yet`}>
          <a className="btn primary" href={href(`/content/${entity.key}/new`)}>Add the first {entity.singular ?? "item"}</a>
        </Empty>
      ) : (
        <FormCard>
          <div className="toolbar">
            <input className="search" type="search" placeholder={`Search ${entity.label.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
            <span className="muted">{shown.length} of {items.length}</span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Title</th><th className="hide-sm">Details</th><th>Live</th><th className="hide-sm">Updated</th><th className="right">Actions</th></tr></thead>
              <tbody>
                {shown.map((it) => {
                  const idx = items.indexOf(it);
                  return (
                    <tr key={it.id} className={it.published ? "" : "draft"}>
                      <td><a className="row-link" href={href(`/content/${entity.key}/${it.id}`)}>{String(it.data[entity.titleField ?? ""] ?? "(untitled)")}</a>{!it.published && <Pill tone="amber">Draft</Pill>}</td>
                      <td className="hide-sm muted">{subtitle(entity, it.data)}</td>
                      <td><Switch checked={it.published} label={`Publish ${String(it.data[entity.titleField ?? ""])}`} onChange={(v) => togglePublished(it, v)} /></td>
                      <td className="hide-sm muted nowrap">{fmtDate(it.updatedAt)}</td>
                      <td className="right nowrap">
                        <button className="icon-btn" aria-label="Move up" disabled={!!q || idx === 0} onClick={() => move(idx, -1)}>↑</button>
                        <button className="icon-btn" aria-label="Move down" disabled={!!q || idx === items.length - 1} onClick={() => move(idx, 1)}>↓</button>
                        <button className="icon-btn" aria-label="Duplicate" title="Duplicate" onClick={() => duplicate(it)}>⧉</button>
                        <a className="btn sm" href={href(`/content/${entity.key}/${it.id}`)}>Edit</a>
                        <button className="icon-btn danger" aria-label="Delete" title="Delete" onClick={() => remove(it)}>🗑</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!q && <p className="muted foot-note">Order here is the order shown on the website. Use ↑ ↓ to change it.</p>}
        </FormCard>
      )}
    </>
  );
}

// ------------------------------------------------------------------ item editor
function ItemEditor({ entity, id }: { entity: Entity; id: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const isNew = id === "new";
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [saved, setSaved] = useState("");
  const [published, setPublished] = useState(true);
  const [savedPub, setSavedPub] = useState(true);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState<{ updatedAt?: number; updatedBy?: string | null }>({});
  const lastAuto = useRef("");

  useEffect(() => {
    if (isNew) { const d = fill(entity.fields, undefined); setData(d); setSaved(JSON.stringify(d)); return; }
    api<{ items: Item[] }>("GET", `/content/${entity.key}`)
      .then((r) => {
        const it = r.items.find((x) => String(x.id) === id);
        if (!it) { toast("That item no longer exists.", "error"); go(`/content/${entity.key}`); return; }
        const d = fill(entity.fields, it.data);
        setData(d); setSaved(JSON.stringify(d)); setPublished(it.published); setSavedPub(it.published); setMeta(it);
      }).catch((e) => toast(e.message, "error"));
  }, [entity, id, isNew, toast]);

  const dirty = data !== null && (JSON.stringify(data) !== saved || published !== savedPub);
  useUnsavedWarning(dirty);
  if (!data) return <Loading />;

  const onChange = (next: Record<string, any>) => {
    // New items: keep the address in step with the title until the user edits it by hand.
    const kf = entity.keyField, tf = entity.titleField;
    if (isNew && kf && tf && next[tf] !== data[tf] && (!data[kf] || data[kf] === lastAuto.current)) {
      lastAuto.current = slugify(String(next[tf] ?? ""));
      next = { ...next, [kf]: lastAuto.current };
    }
    setData(next);
  };

  const save = async () => {
    const errs: Errors = {};
    const clean = validateFields(entity.fields, data, "", errs);
    setErrors(errs);
    if (Object.keys(errs).length) { toast("Please fix the highlighted fields.", "error"); return; }
    setBusy(true);
    try {
      if (isNew) {
        const r = await api<{ item: Item }>("POST", `/content/${entity.key}`, { data: clean, published });
        toast("Created");
        go(`/content/${entity.key}/${r.item.id}`);
      } else {
        const r = await api<{ item: Item }>("PUT", `/content/${entity.key}/${id}`, { data: clean, published });
        const d = fill(entity.fields, r.item.data);
        setData(d); setSaved(JSON.stringify(d)); setSavedPub(r.item.published); setMeta(r.item);
        toast("Saved. The website is updated.");
      }
    } catch (e) {
      if (e instanceof ApiError && e.errors) setErrors(e.errors);
      toast((e as Error).message, "error");
    } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!(await confirm({ title: `Delete ${entity.singular ?? "item"}?`, body: "It will be removed from the website. This cannot be undone.", confirm: "Delete", danger: true }))) return;
    try { await api("DELETE", `/content/${entity.key}/${id}`); toast("Deleted"); go(`/content/${entity.key}`); } catch (e) { toast((e as Error).message, "error"); }
  };

  const title = isNew ? `New ${entity.singular ?? "item"}` : String(data[entity.titleField ?? ""] || `Edit ${entity.singular ?? "item"}`);
  const slug = entity.keyField ? String(data[entity.keyField] ?? "") : "";
  const sitePath = SITE_PATH[entity.key]?.(slug);

  return (
    <>
      <p className="crumb"><a href={href(`/content/${entity.key}`)}>← {entity.label}</a></p>
      <PageHead title={title} sub={entity.description}
        actions={<>{sitePath && !isNew && published && <a className="btn" href={sitePath} target="_blank" rel="noopener">View on site ↗</a>}{!isNew && <button className="btn danger-outline" onClick={remove}>Delete</button>}</>} />
      <div className="editor-grid">
        <FormCard><Form fields={entity.fields} value={data} errors={errors} onChange={onChange} /></FormCard>
        <aside className="side">
          {entity.key === "resources" && !isNew && <ResourceFile slug={String(data.slug ?? "")} />}
          <FormCard title="Visibility">
            <div className="bool-row"><Switch checked={published} onChange={setPublished} label="Published" /><span>{published ? "Published: visible on the website" : "Draft: hidden from the website"}</span></div>
            {!isNew && <p className="muted small">Last saved {fmtDate(meta.updatedAt)}{meta.updatedBy ? ` by ${meta.updatedBy}` : ""}</p>}
          </FormCard>
        </aside>
      </div>
      <SaveBar dirty={dirty} busy={busy} onSave={save} onDiscard={() => { setData(JSON.parse(saved)); setPublished(savedPub); setErrors({}); }} />
    </>
  );
}

// ------------------------------------------------------------------ gated download file (PDF)
function ResourceFile({ slug }: { slug: string }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [info, setInfo] = useState<{ exists: boolean; size?: number; updatedAt?: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => api<{ exists: boolean; size?: number; updatedAt?: number }>("GET", `/resources/${encodeURIComponent(slug)}/file`).then(setInfo).catch(() => setInfo({ exists: false }));
  useEffect(() => { if (slug) load(); /* eslint-disable-next-line */ }, [slug]);

  const send = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try { await api("POST", `/resources/${encodeURIComponent(slug)}/file`, file as Blob); toast("PDF replaced. New downloads use this file."); load(); }
    catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  };

  return (
    <FormCard title="Download file (PDF)">
      {!info ? <Loading /> : info.exists ? (
        <p className="muted small">Current file: <b>{fmtSize(info.size ?? 0)}</b>, updated {fmtDate(info.updatedAt)}.</p>
      ) : <p className="error-text">No file uploaded yet. Visitors cannot download this until you add one.</p>}
      <input ref={input} type="file" hidden accept="application/pdf" onChange={(e) => { send(e.target.files?.[0]); e.target.value = ""; }} />
      <button className="btn" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Uploading…" : info?.exists ? "Replace PDF" : "Upload PDF"}</button>
      <p className="muted small" style={{ marginTop: 10 }}>PDFs up to 12 MB. The file is kept private; visitors receive a time-limited link after giving their email.</p>
    </FormCard>
  );
}
