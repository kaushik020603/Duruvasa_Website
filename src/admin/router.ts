import { useEffect, useState } from "react";

export interface Loc { parts: string[]; query: URLSearchParams; raw: string }

function read(): Loc {
  const h = window.location.hash.replace(/^#\/?/, "");
  const [p, q = ""] = h.split("?");
  return { parts: p.split("/").filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(q), raw: h };
}

export function useLoc(): Loc {
  const [loc, setLoc] = useState<Loc>(read);
  useEffect(() => {
    const on = () => setLoc(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return loc;
}

export const go = (path: string) => { window.location.hash = path.startsWith("/") ? path : `/${path}`; };
export const href = (path: string) => `#${path.startsWith("/") ? path : `/${path}`}`;
