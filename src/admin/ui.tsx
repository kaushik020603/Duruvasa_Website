import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

// ------------------------------------------------------------------ toasts
type ToastKind = "ok" | "error" | "info";
interface Toast { id: number; kind: ToastKind; text: string }
const ToastCtx = createContext<(text: string, kind?: ToastKind) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);
  const push = useCallback((text: string, kind: ToastKind = "ok") => {
    const id = ++seq.current;
    setItems((x) => [...x, { id, kind, text }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === "error" ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

// ------------------------------------------------------------------ confirm dialog
interface ConfirmOpts { title: string; body?: ReactNode; confirm?: string; danger?: boolean }
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(() => Promise.resolve(false));
export const useConfirm = () => useContext(ConfirmCtx);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const ask = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const close = (v: boolean) => { state?.resolve(v); setState(null); };
  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      {state && (
        <Modal title={state.title} onClose={() => close(false)} small>
          {state.body && <div className="modal-body-text">{state.body}</div>}
          <div className="modal-actions">
            <button className="btn" onClick={() => close(false)}>Cancel</button>
            <button className={`btn ${state.danger ? "danger" : "primary"}`} autoFocus onClick={() => close(true)}>{state.confirm ?? "Confirm"}</button>
          </div>
        </Modal>
      )}
    </ConfirmCtx.Provider>
  );
}

// ------------------------------------------------------------------ modal & drawer
export function Modal({ title, onClose, children, small, wide }: { title: string; onClose: () => void; children: ReactNode; small?: boolean; wide?: boolean }) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", on);
    return () => document.removeEventListener("keydown", on);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal${small ? " small" : ""}${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <header><h3>{title}</h3><button className="icon-btn" aria-label="Close" onClick={onClose}>×</button></header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", on);
    return () => document.removeEventListener("keydown", on);
  }, [onClose]);
  return (
    <div className="overlay drawer-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <header><h3>{title}</h3><button className="icon-btn" aria-label="Close" onClick={onClose}>×</button></header>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>
  );
}

// ------------------------------------------------------------------ small pieces
export const Spinner = () => <div className="spinner" role="status" aria-label="Loading" />;

export function Loading({ label = "Loading…" }: { label?: string }) {
  return <div className="loading"><Spinner /><span>{label}</span></div>;
}

export function Empty({ icon = "∅", title, children }: { icon?: string; title: string; children?: ReactNode }) {
  return <div className="empty"><div className="empty-icon" aria-hidden="true">{icon}</div><h3>{title}</h3>{children && <p>{children}</p>}</div>;
}

export function PageHead({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1>{sub && <p className="sub">{sub}</p>}</div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Pill({ tone = "gray", children }: { tone?: "gray" | "green" | "blue" | "amber" | "red" | "purple"; children: ReactNode }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`switch${checked ? " on" : ""}`} onClick={() => onChange(!checked)}><i /></button>
  );
}

export function Pager({ page, size, total, onPage }: { page: number; size: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return <div className="pager"><span>{total} item{total === 1 ? "" : "s"}</span></div>;
  return (
    <div className="pager">
      <span>{(page - 1) * size + 1}–{Math.min(total, page * size)} of {total}</span>
      <button className="btn sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>← Prev</button>
      <span>Page {page} / {pages}</span>
      <button className="btn sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next →</button>
    </div>
  );
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/** Warn before closing the tab when there are unsaved edits. */
export function useUnsavedWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const on = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", on);
    return () => window.removeEventListener("beforeunload", on);
  }, [dirty]);
}

export async function copy(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
