/**
 * Global pointer effects, wired once via event delegation:
 *  - .tilt      : 3D tilt + moving glow (sets --rx/--ry/--mx/--my)
 *  - .magnetic  : button drifts toward the cursor
 *  - .btn-*     : click ripple
 *  - header     : gets .scrolled after 20px
 */
export function initFx(): () => void {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cleanups: Array<() => void> = [];
  const on = <K extends keyof DocumentEventMap>(t: K, f: (e: DocumentEventMap[K]) => void) => {
    document.addEventListener(t, f as EventListener);
    cleanups.push(() => document.removeEventListener(t, f as EventListener));
  };

  if (!reduce) {
    on("pointermove", (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>(".tilt");
      if (t) {
        const r = t.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        t.style.setProperty("--rx", `${(0.5 - y) * 8}deg`);
        t.style.setProperty("--ry", `${(x - 0.5) * 10}deg`);
        t.style.setProperty("--mx", `${x * 100}%`);
        t.style.setProperty("--my", `${y * 100}%`);
      }
      const m = (e.target as HTMLElement).closest<HTMLElement>(".magnetic");
      if (m) {
        const r = m.getBoundingClientRect();
        m.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.25}px,${(e.clientY - r.top - r.height / 2) * 0.35}px)`;
      }
    });
    on("pointerout", (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>(".tilt, .magnetic");
      if (!t || t.contains(e.relatedTarget as Node)) return;
      t.style.removeProperty("--rx"); t.style.removeProperty("--ry");
      if (t.classList.contains("magnetic")) t.style.transform = "";
    });
  }

  on("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>(".btn-dark, .btn-light");
    if (!b || reduce) return;
    const r = b.getBoundingClientRect(), s = Math.max(r.width, r.height);
    const d = document.createElement("span");
    d.className = "ripple";
    d.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
    b.appendChild(d);
    setTimeout(() => d.remove(), 650);
  });

  const hdr = () => document.querySelector(".site-header")?.classList.toggle("scrolled", window.scrollY > 20);
  window.addEventListener("scroll", hdr, { passive: true });
  hdr();
  cleanups.push(() => window.removeEventListener("scroll", hdr));

  return () => cleanups.forEach((c) => c());
}
