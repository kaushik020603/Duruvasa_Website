import { useEffect, useRef } from "react";

interface Node { x: number; y: number; vx: number; vy: number }

/** Animated network graph that reacts to the cursor. Pauses when off-screen or reduced-motion is set. */
export default function NetworkCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, raf = 0, visible = true;
    const mouse = { x: -999, y: -999 };
    let nodes: Node[] = [];

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width; h = r.height;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round((w * h) / 14000);
      nodes = Array.from({ length: n }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35,
      }));
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const a of nodes) {
        if (!reduce) {
          a.x += a.vx; a.y += a.vy;
          if (a.x < 0 || a.x > w) a.vx *= -1;
          if (a.y < 0 || a.y > h) a.vy *= -1;
          const dx = a.x - mouse.x, dy = a.y - mouse.y, d = Math.hypot(dx, dy);
          if (d < 110) { a.x += (dx / d) * 1.2; a.y += (dy / d) * 1.2; }
        }
      }
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j], d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < 120) {
            ctx.strokeStyle = `rgba(127,203,127,${(1 - d / 120) * 0.5})`;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
        const m = Math.hypot(a.x - mouse.x, a.y - mouse.y);
        if (m < 160) {
          ctx.strokeStyle = `rgba(255,255,255,${(1 - m / 160) * 0.7})`;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke();
        }
        ctx.fillStyle = "rgba(255,255,255,.85)";
        ctx.beginPath(); ctx.arc(a.x, a.y, 1.6, 0, Math.PI * 2); ctx.fill();
      }
    };

    const loop = () => {
      if (visible) draw();
      raf = requestAnimationFrame(loop);
    };

    const onMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
    };
    const onLeave = () => { mouse.x = mouse.y = -999; };
    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; });

    resize();
    io.observe(canvas);
    window.addEventListener("resize", resize);
    canvas.parentElement!.addEventListener("mousemove", onMove);
    canvas.parentElement!.addEventListener("mouseleave", onLeave);
    if (reduce) draw(); else loop();
    return () => {
      cancelAnimationFrame(raf); io.disconnect();
      window.removeEventListener("resize", resize);
      canvas.parentElement?.removeEventListener("mousemove", onMove);
      canvas.parentElement?.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return <canvas ref={ref} className="net-canvas" aria-hidden="true" />;
}
