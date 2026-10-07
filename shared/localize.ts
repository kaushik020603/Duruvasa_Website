// Applies a language's translation file on top of the English CMS content.
// Matching is by stable identity (slug, member name) or by position when the list length is unchanged, so an
// English list that was edited in the admin (items added or removed) safely falls back to English for that list.
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface Translation {
  ui?: Record<string, string>;
  site?: Record<string, any>;
  hero?: Record<string, any>;
  about?: Record<string, any>;
  sections?: Record<string, any>;
  partners?: Record<string, any>[];
  advantages?: Record<string, any>[];
  offerings?: Record<string, any>[];
  attributes?: Record<string, any>[];
  team?: Record<string, Record<string, any>>;
  services?: Record<string, Record<string, any>>;
  posts?: Record<string, Record<string, any>>;
  legal?: Record<string, Record<string, any>>;
  resources?: Record<string, Record<string, any>>;
}

/** Deep merge: text and numbers in `over` replace `base`; arrays merge by position only when lengths match. */
function merge(base: any, over: any): any {
  if (over === undefined || over === null || over === "") return base;
  if (Array.isArray(base)) {
    if (!Array.isArray(over) || over.length !== base.length) return base;
    return base.map((b, i) => merge(b, over[i]));
  }
  if (base && typeof base === "object") {
    if (typeof over !== "object") return base;
    const out: Record<string, any> = { ...base };
    for (const k of Object.keys(over)) if (k in base) out[k] = merge(base[k], over[k]);
    return out;
  }
  return typeof over === typeof base ? over : base;
}

const byKey = (list: any[] | undefined, key: string, tr: Record<string, any> | undefined) =>
  (list ?? []).map((item) => (tr && tr[item[key]] ? merge(item, tr[item[key]]) : item));
const byIndex = (list: any[] | undefined, tr: any[] | undefined) => (list ? merge(list, tr) : list);

export function localize<T extends Record<string, any>>(bundle: T, tr: Translation | undefined): T & { ui: Record<string, string> } {
  if (!tr) return { ...bundle, ui: {} };
  const b = bundle as Record<string, any>;
  return {
    ...bundle,
    site: merge(b.site, tr.site),
    hero: merge(b.hero, tr.hero),
    about: merge(b.about, tr.about),
    sections: merge(b.sections, tr.sections),
    partners: byIndex(b.partners, tr.partners),
    advantages: byIndex(b.advantages, tr.advantages),
    offerings: byIndex(b.offerings, tr.offerings),
    attributes: byIndex(b.attributes, tr.attributes),
    team: byKey(b.team, "name", tr.team),
    services: byKey(b.services, "slug", tr.services),
    posts: byKey(b.posts, "slug", tr.posts),
    legal: byKey(b.legal, "slug", tr.legal),
    resources: byKey(b.resources, "slug", tr.resources),
    ui: tr.ui ?? {},
  };
}
