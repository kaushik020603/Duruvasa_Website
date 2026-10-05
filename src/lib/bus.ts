/** Tiny pub/sub so other sections (quiz, service pages) can prefill the contact form. */
type Listener = (msg: string) => void;
let pending: string | null = null;
const listeners = new Set<Listener>();

export function prefillContact(message: string) {
  pending = message;
  listeners.forEach((l) => l(message));
}
export function takePrefill(): string | null {
  const p = pending;
  pending = null;
  return p;
}
export function onPrefill(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
