import { useEffect, useRef, useState } from "react";
import { hero, img } from "../data/content";
import { usePrefs } from "../lib/prefs";
import NetworkCanvas from "./NetworkCanvas";

function Rotator({ words }: { words: string[] }) {
  const [i, setI] = useState(0);
  const [txt, setTxt] = useState("");
  const key = words.join("|");
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setTxt(words[0]); return; }
    const word = words[i % words.length];
    let n = 0, dir = 1, tm: number;
    const tick = () => {
      n += dir;
      setTxt(word.slice(0, n));
      if (n === word.length) { dir = -1; tm = window.setTimeout(tick, 1400); return; }
      if (n === 0) { setI((x) => (x + 1) % words.length); return; }
      tm = window.setTimeout(tick, dir === 1 ? 70 : 35);
    };
    tm = window.setTimeout(tick, 300);
    return () => clearTimeout(tm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, key]);
  return <p className="rotator" aria-hidden="true"><span>{txt}</span><i className="caret" /></p>;
}

export default function Hero() {
  const bg = useRef<HTMLImageElement>(null);
  const { t } = usePrefs();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const on = () => {
      if (bg.current) bg.current.style.transform = `translate3d(0,${Math.min(window.scrollY, 700) * 0.25}px,0) scale(1.1)`;
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  const a = t("hero.a", hero.lineA);
  const b = t("hero.b", hero.lineB);
  const line = (s: string, d: number) =>
    s.split(" ").map((w, k) => (
      <span key={w + k} className="word" style={{ animationDelay: `${d + k * 0.12}s` }}>{w}&nbsp;</span>
    ));
  const words = hero.words.map((w, i) => t(`hero.w${i}`, w));

  return (
    <section id="home" className="hero">
      <img ref={bg} className="hero-bg" src={img.hero} srcSet={`${img.hero.replace(".webp", "-828.webp")} 828w, ${img.hero} 1500w`} sizes="100vw" alt="" width={1500} height={923} decoding="async" {...{ fetchpriority: "high" }} />
      <div className="hero-shade" />
      <NetworkCanvas />
      <h1 aria-label={`${a} ${b}`}>
        <span aria-hidden="true" key={a + b}>{line(a, 0.1)}<br />{line(b, 0.45)}</span>
      </h1>
      <Rotator words={words} />
      <div className="hero-card">
        <svg className="star" viewBox="0 0 18 18" aria-hidden="true">
          <path fill="#fff" d="M9.946 12.207 18 18l-5.793-8.054L18 9l-5.793-.946L18 0 9.946 5.793 9 0l-.946 5.793L0 0l5.793 8.054L0 9l5.793.946L0 18l8.054-5.793L9 18z" />
        </svg>
        <div className="hero-card-body">
          <p>
            {t("hero.card", hero.card)}
          </p>
          <a className="btn-dark magnetic" href="#services-list">{t("hero.cta", hero.cta)}</a>
        </div>
      </div>
      <a className="scroll-cue" href="#about" aria-label={t("hero.scroll", "Scroll down")}><span /></a>
    </section>
  );
}
