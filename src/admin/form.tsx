import { useEffect, useRef, useState, type ReactNode } from "react";
import { blankDoc, type Errors, type Field } from "../../shared/schema";
import { renderMarkdown } from "../lib/markdown";
import { api, fmtSize, upload } from "./api";
import { Loading, Modal, Switch, useToast } from "./ui";

const join = (p: string, k: string) => (p ? `${p}.${k}` : k);

interface FormProps { fields: Field[]; value: Record<string, any>; onChange: (v: Record<string, any>) => void; errors: Errors; path?: string }

export function Form({ fields, value, onChange, errors, path = "" }: FormProps) {
  return (
    <div className="form">
      {fields.map((f) => (
        <FieldRow key={f.key} field={f} value={value?.[f.key]} errors={errors} path={join(path, f.key)}
          onChange={(v) => onChange({ ...value, [f.key]: v })} />
      ))}
    </div>
  );
}

interface RowProps { field: Field; value: any; onChange: (v: any) => void; errors: Errors; path: string }

function FieldRow({ field, value, onChange, errors, path }: RowProps) {
  const err = errors[path];
  const id = `f-${path.replace(/\./g, "-")}`;
  const nested = field.type === "object";
  return (
    <div className={`field${err ? " has-error" : ""}${nested ? " nested" : ""}`}>
      {field.type !== "boolean" && (
        <label htmlFor={id}>{field.label}{field.required && <b className="req" title="Required"> *</b>}</label>
      )}
      <Control field={field} value={value} onChange={onChange} errors={errors} path={path} id={id} />
      {field.help && !err && <p className="help">{field.help}</p>}
      {err && <p className="error-text" role="alert">{err}</p>}
    </div>
  );
}

function Control({ field, value, onChange, errors, path, id }: RowProps & { id: string }) {
  const common = { id, "aria-invalid": !!errors[path] || undefined } as const;
  switch (field.type) {
    case "textarea":
      return <textarea {...common} rows={Math.min(10, Math.max(3, Math.ceil(String(value ?? "").length / 90)))} value={value ?? ""} maxLength={field.max} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />;
    case "markdown": return <MarkdownField {...common} value={value ?? ""} onChange={onChange} max={field.max} />;
    case "boolean":
      return (
        <div className="bool-row">
          <Switch checked={!!value} onChange={onChange} label={field.label} />
          <label htmlFor={id} onClick={() => onChange(!value)}>{field.label}</label>
        </div>
      );
    case "number": return <input {...common} type="number" value={value ?? ""} min={field.min} max={field.max} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} />;
    case "date": return <input {...common} type="date" value={value ?? ""} onChange={(e) => onChange(e.target.value)} />;
    case "color":
      return (
        <div className="color-row">
          <input type="color" aria-label={`${field.label} picker`} value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#2f9ec7"} onChange={(e) => onChange(e.target.value)} />
          <input {...common} value={value ?? ""} maxLength={7} onChange={(e) => onChange(e.target.value)} placeholder="#2f9ec7" />
        </div>
      );
    case "select":
      return <select {...common} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>{field.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
    case "image": return <ImageField {...common} value={value ?? ""} onChange={onChange} />;
    case "tags": return <TagsField {...common} value={Array.isArray(value) ? value : []} onChange={onChange} />;
    case "list": return <ListField field={field} value={Array.isArray(value) ? value : []} onChange={onChange} errors={errors} path={path} />;
    case "object": return <div className="object-box"><Form fields={field.fields ?? []} value={value ?? {}} onChange={onChange} errors={errors} path={path} /></div>;
    default: {
      const type = field.type === "email" ? "email" : field.type === "url" ? "url" : field.type === "phone" ? "tel" : "text";
      return <input {...common} type={type === "url" ? "text" : type} inputMode={type === "url" ? "url" : undefined} value={value ?? ""} maxLength={field.max} placeholder={field.placeholder} autoComplete="off" onChange={(e) => onChange(e.target.value)} />;
    }
  }
}

// ------------------------------------------------------------------ markdown
function MarkdownField({ id, value, onChange, max }: { id: string; value: string; onChange: (v: string) => void; max?: number }) {
  const [tab, setTab] = useState<"write" | "preview">("write");
  return (
    <div className="md">
      <div className="md-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "write"} className={tab === "write" ? "on" : ""} onClick={() => setTab("write")}>Write</button>
        <button type="button" role="tab" aria-selected={tab === "preview"} className={tab === "preview" ? "on" : ""} onClick={() => setTab("preview")}>Preview</button>
        <span className="md-hint">## Heading · - bullet · **bold** · [link](https://…)</span>
      </div>
      {tab === "write"
        ? <textarea id={id} rows={Math.min(24, Math.max(8, value.split("\n").length + 2))} value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} />
        : <div className="md-preview prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(value) || "<p><em>Nothing to preview yet.</em></p>" }} />}
    </div>
  );
}

// ------------------------------------------------------------------ tags
function TagsField({ id, value, onChange }: { id: string; value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const parts = draft.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) onChange([...value, ...parts.filter((p) => !value.includes(p))]);
    setDraft("");
  };
  return (
    <div className="tags-box">
      {value.map((t, i) => (
        <span key={t + i} className="tag">{t}<button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>×</button></span>
      ))}
      <input id={id} value={draft} placeholder={value.length ? "Add another…" : "Type and press Enter"}
        onChange={(e) => setDraft(e.target.value)} onBlur={add}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); }
          else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
        }} />
    </div>
  );
}

// ------------------------------------------------------------------ lists
function ListField({ field, value, onChange, errors, path }: { field: Field; value: any[]; onChange: (v: any[]) => void; errors: Errors; path: string }) {
  const objects = !!field.fields;
  const label = field.itemLabel ?? "Item";
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= value.length) return;
    const next = value.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const add = () => onChange([...value, objects ? blankDoc(field.fields!) : ""]);
  const preview = (item: any) => {
    const first = field.fields?.find((f) => f.type === "text" || f.type === "textarea");
    return first ? String(item?.[first.key] ?? "").slice(0, 60) : "";
  };

  return (
    <div className="list">
      {value.length === 0 && <p className="list-empty">No {label.toLowerCase()}s yet.</p>}
      {value.map((item, i) => (
        <div key={i} className={`list-item${objects ? " obj" : ""}`}>
          <div className="list-item-head">
            <span className="list-num">{label} {i + 1}{objects && preview(item) ? <em> · {preview(item)}</em> : null}</span>
            <span className="list-tools">
              <button type="button" className="icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button type="button" className="icon-btn" aria-label="Move down" disabled={i === value.length - 1} onClick={() => move(i, 1)}>↓</button>
              <button type="button" className="icon-btn danger" aria-label={`Remove ${label} ${i + 1}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>✕</button>
            </span>
          </div>
          {objects ? (
            <Form fields={field.fields!} value={item} errors={errors} path={`${path}.${i}`}
              onChange={(v) => onChange(value.map((x, j) => (j === i ? v : x)))} />
          ) : (
            <textarea rows={2} aria-label={`${label} ${i + 1}`} value={item} onChange={(e) => onChange(value.map((x, j) => (j === i ? e.target.value : x)))} />
          )}
        </div>
      ))}
      <button type="button" className="btn sm" onClick={add}>＋ Add {label.toLowerCase()}</button>
    </div>
  );
}

// ------------------------------------------------------------------ images
function ImageField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="image-field">
      <div className="thumb">{value ? <img src={value} alt="" onError={(e) => ((e.currentTarget.style.opacity = "0.2"))} /> : <span>No image</span>}</div>
      <div className="image-ctl">
        <input id={id} value={value} placeholder="/uploads/… or /img/…" onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="btn sm" onClick={() => setOpen(true)}>Choose or upload…</button>
        {value && <button type="button" className="btn sm ghost" onClick={() => onChange("")}>Clear</button>}
      </div>
      {open && <MediaPicker onClose={() => setOpen(false)} onPick={(p) => { onChange(p); setOpen(false); }} />}
    </div>
  );
}

interface MediaItem { id?: number; path: string; name: string; size?: number; builtIn?: boolean }

export function MediaPicker({ onPick, onClose }: { onPick: (path: string) => void; onClose: () => void }) {
  const [data, setData] = useState<{ items: MediaItem[]; builtIn: MediaItem[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const load = () => api<{ items: MediaItem[]; builtIn: MediaItem[] }>("GET", "/media").then(setData).catch((e) => toast(e.message, "error"));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const doUpload = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const r = await upload<{ item: MediaItem }>(`/media?name=${encodeURIComponent(file.name)}`, file);
      toast("Image uploaded");
      onPick(r.item.path);
    } catch (e) { toast((e as Error).message, "error"); setBusy(false); }
  };

  return (
    <Modal title="Choose an image" onClose={onClose} wide>
      <div className="picker-top">
        <button className="btn primary" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Uploading…" : "⬆ Upload new image"}</button>
        <input ref={input} type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => doUpload(e.target.files?.[0])} />
        <span className="muted">JPG, PNG, WebP or GIF, up to 5 MB.</span>
      </div>
      {!data ? <Loading /> : (
        <>
          <Gallery title="Your uploads" items={data.items} onPick={onPick} empty="Nothing uploaded yet." />
          <Gallery title="Site images" items={data.builtIn} onPick={onPick} empty="" />
        </>
      )}
    </Modal>
  );
}

function Gallery({ title, items, onPick, empty }: { title: string; items: MediaItem[]; onPick: (p: string) => void; empty: string }) {
  return (
    <section className="gallery">
      <h4>{title}</h4>
      {items.length === 0 ? (empty && <p className="muted">{empty}</p>) : (
        <div className="grid">
          {items.map((m) => (
            <button type="button" key={m.path} className="tile" onClick={() => onPick(m.path)} title={m.name}>
              <img src={m.path} alt="" loading="lazy" />
              <span>{m.name}{m.size ? ` · ${fmtSize(m.size)}` : ""}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export function FormCard({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return <section className="card">{(title || actions) && <header className="card-head">{title && <h3>{title}</h3>}{actions}</header>}{children}</section>;
}
