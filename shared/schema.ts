/**
 * Single source of truth for everything editable in the CMS.
 * Used by the server (validation) and the admin app (auto-generated forms), so they can never drift apart.
 */
export type FieldType =
  | "text" | "textarea" | "markdown" | "url" | "email" | "phone" | "color" | "image"
  | "number" | "date" | "boolean" | "select" | "tags" | "list" | "object" | "slug";

export interface Field {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  max?: number;
  min?: number;
  help?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  /** For `list` of objects and `object`. A `list` with no `fields` is a list of strings. */
  fields?: Field[];
  itemLabel?: string;
  default?: unknown;
}

export interface Entity {
  key: string;
  label: string;
  singular?: string;
  kind: "singleton" | "collection";
  group: "Pages" | "Content" | "Trust" | "Resources";
  icon: string;
  description?: string;
  titleField?: string;
  /** Field that uniquely identifies a document in a collection (usually a slug). */
  keyField?: string;
  fields: Field[];
}

const f = {
  text: (key: string, label: string, o: Partial<Field> = {}): Field => ({ key, label, type: "text", max: 200, ...o }),
  area: (key: string, label: string, o: Partial<Field> = {}): Field => ({ key, label, type: "textarea", max: 4000, ...o }),
  md: (key: string, label: string, o: Partial<Field> = {}): Field => ({ key, label, type: "markdown", max: 30000, ...o }),
  url: (key: string, label: string, o: Partial<Field> = {}): Field => ({ key, label, type: "url", max: 500, ...o }),
  slug: (key: string, label: string, o: Partial<Field> = {}): Field => ({ key, label, type: "slug", max: 80, required: true, help: "Lowercase letters, numbers and dashes. Used in the page address.", ...o }),
  image: (key: string, label: string, o: Partial<Field> = {}): Field => ({ key, label, type: "image", max: 500, ...o }),
  color: (key: string, label: string, o: Partial<Field> = {}): Field => ({ key, label, type: "color", default: "#2f9ec7", ...o }),
  bool: (key: string, label: string, o: Partial<Field> = {}): Field => ({ key, label, type: "boolean", ...o }),
  tags: (key: string, label: string, o: Partial<Field> = {}): Field => ({ key, label, type: "tags", ...o }),
};

const SERVICE_ICONS = [
  { value: "spark", label: "Spark" }, { value: "dropbox", label: "Boxes" },
  { value: "gear", label: "Gear" }, { value: "ring", label: "Ring" },
];

export const entities: Entity[] = [
  // ---------- Pages (singletons) ----------
  {
    key: "site", label: "Site settings", kind: "singleton", group: "Pages", icon: "⚙",
    description: "Name, contact details and footer. These appear across the whole site.",
    fields: [
      f.text("name", "Company name", { required: true }),
      f.area("description", "Short description (used for search engines and sharing)", { max: 300, required: true }),
      { key: "email", label: "Public email", type: "email", required: true, max: 200, help: "Shown in the footer, contact section and About page." },
      { key: "phone", label: "Call number", type: "phone", max: 30, help: "Include the country code, e.g. +919833445810. Powers the Call button on mobile." },
      f.text("phoneLabel", "Name shown with the phone number", { max: 80 }),
      { key: "whatsapp", label: "WhatsApp number", type: "phone", max: 30, help: "Include the country code. Powers the WhatsApp button." },
      f.area("whatsappMessage", "WhatsApp pre-filled message", { max: 300 }),
      f.url("linkedin", "LinkedIn page"),
      f.text("footerNote", "Footer note", { max: 200 }),
    ],
  },
  {
    key: "hero", label: "Home: hero", kind: "singleton", group: "Pages", icon: "★",
    description: "The big banner at the top of the home page.",
    fields: [
      f.text("lineA", "Headline, line 1", { required: true }),
      f.text("lineB", "Headline, line 2", { required: true }),
      { key: "words", label: "Rotating keywords", type: "list", itemLabel: "Keyword", max: 8, help: "Typed out one after another under the headline." },
      f.area("card", "Intro card text", { max: 500 }),
      f.text("cta", "Button text", { max: 40 }),
    ],
  },
  {
    key: "about", label: "Home: About us", kind: "singleton", group: "Pages", icon: "ⓘ",
    description: "The About section: story, numbers, mission cards and values.",
    fields: [
      f.text("eyebrow", "Small heading", { max: 60 }),
      f.text("lead", "Big headline", { required: true }),
      f.area("intro", "Opening paragraph", { max: 1200 }),
      { key: "paragraphs", label: "More paragraphs", type: "list", itemLabel: "Paragraph", max: 6 },
      {
        key: "stats", label: "Numbers", type: "list", itemLabel: "Number", max: 6, fields: [
          f.text("label", "Label", { required: true, max: 60 }),
          { key: "value", label: "Value", type: "number", required: true, min: 0, max: 100000 },
          f.text("suffix", "Suffix (for example + or /7)", { max: 6 }),
        ],
      },
      {
        key: "pillars", label: "Mission cards", type: "list", itemLabel: "Card", max: 6, fields: [
          f.text("icon", "Symbol", { max: 4, help: "A single character, e.g. ◎" }),
          f.text("title", "Title", { required: true, max: 60 }),
          f.area("text", "Text", { required: true, max: 600 }),
        ],
      },
      {
        key: "values", label: "Values", type: "list", itemLabel: "Value", max: 8, fields: [
          f.text("title", "Title", { required: true, max: 40 }),
          f.area("text", "Text", { required: true, max: 200 }),
        ],
      },
    ],
  },
  {
    key: "sections", label: "Section headings", kind: "singleton", group: "Pages", icon: "☰",
    description: "Headings and intro text for each section of the home page.",
    fields: [
      { key: "partners", label: "Partners", type: "object", fields: [f.text("eyebrow", "Small heading"), f.text("heading", "Heading"), f.area("sub", "Intro", { max: 300 })] },
      {
        key: "team", label: "Team", type: "object", fields: [
          f.text("heading", "Heading"), f.text("partnersHeading", "Consulting partners sub-heading"),
        ],
      },
      { key: "advantages", label: "Advantages", type: "object", fields: [f.text("heading", "Heading")] },
      { key: "offerings", label: "Offerings", type: "object", fields: [f.text("heading", "Heading"), f.text("sub", "Sub-heading"), f.area("intro", "Intro", { max: 600 })] },
      { key: "process", label: "Process timeline", type: "object", fields: [f.text("eyebrow", "Small heading"), f.text("heading", "Heading")] },
      {
        key: "attributes", label: "Key attributes", type: "object", fields: [
          f.text("eyebrow", "Small heading"), f.text("heading", "Heading"), f.area("text", "Text", { max: 600 }), f.text("cta", "Button text", { max: 40 }),
        ],
      },
      { key: "quiz", label: "Security quiz", type: "object", fields: [f.text("eyebrow", "Small heading"), f.text("heading", "Heading")] },
      { key: "resources", label: "Free resource", type: "object", fields: [f.text("eyebrow", "Small heading"), f.text("heading", "Heading")] },
      { key: "contact", label: "Contact", type: "object", fields: [f.text("heading", "Heading"), f.text("emailNote", "Email prompt", { max: 80 })] },
    ],
  },

  // ---------- Content (collections) ----------
  {
    key: "services", label: "Services", singular: "service", kind: "collection", group: "Content", icon: "🛡", titleField: "title", keyField: "slug",
    description: "Each service has its own page with steps and FAQs.",
    fields: [
      f.slug("slug", "Page address"),
      f.text("title", "Title", { required: true }),
      f.text("tagline", "Tagline", { required: true }),
      f.area("intro", "Introduction", { required: true, max: 1200 }),
      { key: "covers", label: "What it covers", type: "list", itemLabel: "Point", max: 12 },
      {
        key: "steps", label: "How it works", type: "list", itemLabel: "Step", max: 10, fields: [
          f.text("title", "Step title", { required: true, max: 60 }), f.area("text", "Description", { required: true, max: 400 }),
        ],
      },
      {
        key: "faqs", label: "FAQs", type: "list", itemLabel: "Question", max: 15, fields: [
          f.text("q", "Question", { required: true, max: 200 }), f.area("a", "Answer", { required: true, max: 1000 }),
        ],
      },
    ],
  },
  {
    key: "offerings", label: "Offerings (home)", singular: "offering", kind: "collection", group: "Content", icon: "◇", titleField: "title",
    description: "The four staggered cards in the Our Offerings section.",
    fields: [
      f.text("title", "Title", { required: true, max: 60 }),
      { key: "icon", label: "Icon", type: "select", options: SERVICE_ICONS, default: "spark" },
      f.text("slug", "Linked service address", { max: 80, help: "Match a service page address so the Learn more link works." }),
      f.area("text", "Text", { required: true, max: 1200 }),
    ],
  },
  {
    key: "advantages", label: "Advantages", singular: "advantage", kind: "collection", group: "Content", icon: "✓", titleField: "title",
    fields: [f.text("title", "Title", { required: true }), f.area("text", "Text", { required: true, max: 600 })],
  },
  {
    key: "attributes", label: "Key attributes", singular: "attribute", kind: "collection", group: "Content", icon: "✦", titleField: "title",
    fields: [f.text("title", "Title", { required: true }), f.area("text", "Text", { required: true, max: 1000 })],
  },
  {
    key: "posts", label: "Insights (blog)", singular: "article", kind: "collection", group: "Content", icon: "✎", titleField: "title", keyField: "slug",
    description: "Articles shown on the Insights page.",
    fields: [
      f.slug("slug", "Page address"),
      f.text("title", "Title", { required: true }),
      { key: "date", label: "Publish date", type: "date", required: true },
      { key: "readMins", label: "Minutes to read", type: "number", min: 1, max: 120, default: 3 },
      f.area("excerpt", "Summary", { required: true, max: 400 }),
      f.md("body", "Article", { required: true, help: "Use ## for headings, - for bullets, **bold**, and [links](https://...)." }),
    ],
  },
  {
    key: "legal", label: "Legal pages", singular: "page", kind: "collection", group: "Content", icon: "§", titleField: "title", keyField: "slug",
    description: "Privacy policy, terms and accessibility statement.",
    fields: [f.slug("slug", "Page address"), f.text("title", "Title", { required: true }), f.md("body", "Content", { required: true })],
  },

  // ---------- Trust ----------
  {
    key: "partners", label: "Partners", singular: "partner", kind: "collection", group: "Trust", icon: "🤝", titleField: "name",
    description: "Logos in the revolving carousel. Every card links to the partner's website.",
    fields: [
      f.text("name", "Name", { required: true, max: 80 }),
      f.image("src", "Logo", { required: true, help: "PNG, JPG or WebP. Transparent backgrounds look best." }),
      f.url("url", "Website", { required: true }),
      f.color("color", "Accent colour"),
      f.text("tagline", "Short description", { max: 80 }),
    ],
  },
  {
    key: "team", label: "Team", singular: "team member", kind: "collection", group: "Trust", icon: "👤", titleField: "name",
    description: "Featured members get the large card; others appear as consulting partners.",
    fields: [
      f.text("name", "Name", { required: true, max: 80 }),
      f.text("role", "Role", { required: true, max: 80 }),
      f.bool("featured", "Featured (large card)"),
      f.image("photo", "Photo", { required: true }),
      f.url("linkedin", "LinkedIn profile"),
      f.md("bio", "Biography", { max: 5000, help: "Separate paragraphs with a blank line." }),
      f.tags("skills", "Skills"),
      {
        key: "certs", label: "Certifications", type: "list", itemLabel: "Certification", max: 12, fields: [
          f.text("vendor", "Vendor / certification", { required: true, max: 60 }), f.image("logo", "Vendor logo", { help: "Use the vendor's official logo (square or symbol works best). Leave blank to show the first letter." }), f.color("color", "Border colour"),
        ],
      },
      f.text("linkLabel", "Extra link label", { max: 80, help: "For example: Watch ISME Session" }),
      f.url("linkUrl", "Extra link address"),
    ],
  },
  {
    key: "testimonials", label: "Testimonials", singular: "testimonial", kind: "collection", group: "Trust", icon: "❝", titleField: "name",
    description: "Hidden on the site until you add at least one. Add only real, permitted quotes.",
    fields: [
      f.area("quote", "Quote", { required: true, max: 800 }), f.text("name", "Name", { required: true, max: 80 }),
      f.text("role", "Role", { max: 80 }), f.text("company", "Company", { max: 80 }),
    ],
  },
  {
    key: "badges", label: "Certifications and standards", singular: "badge", kind: "collection", group: "Trust", icon: "🏅", titleField: "name",
    description: "Company-level certifications. Hidden until you add one.",
    fields: [f.text("name", "Name", { required: true, max: 80 }), f.image("src", "Logo"), f.url("href", "Link")],
  },

  // ---------- Resources ----------
  {
    key: "resources", label: "Downloads", singular: "download", kind: "collection", group: "Resources", icon: "⬇", titleField: "title", keyField: "slug",
    description: "Gated downloads. Visitors give their email to receive the file.",
    fields: [
      f.slug("slug", "Address"),
      f.text("title", "Title", { required: true }),
      f.area("description", "Description", { required: true, max: 600 }),
      { key: "bullets", label: "Highlights", type: "list", itemLabel: "Highlight", max: 8 },
      f.text("fileName", "Download file name", { max: 80, help: "Shown to the visitor, e.g. Cloud-Security-Checklist.pdf" }),
    ],
  },
];

export const entityMap: Record<string, Entity> = Object.fromEntries(entities.map((e) => [e.key, e]));

// ------------------------------------------------------------------ validation
export type Errors = Record<string, string>;
export class ValidationError extends Error {
  constructor(public errors: Errors) { super("Validation failed"); }
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9 ()-]{6,30}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Only http(s), mailto, tel and same-site paths. Blocks javascript: and data: links. */
export function safeUrl(v: string): boolean {
  return /^(https?:\/\/[^\s]+|mailto:[^\s]+|tel:[^\s]+|\/[^\s]*)$/i.test(v) && !/^\/\//.test(v);
}

function clean(v: unknown, multiline: boolean): string {
  let s = typeof v === "string" ? v : v == null ? "" : String(v);
  s = s.replace(CTRL, "").replace(/\r\n/g, "\n");
  if (!multiline) s = s.replace(/\n+/g, " ");
  return s.trim();
}

function one(f: Field, input: unknown, path: string, errors: Errors): unknown {
  const empty = input === undefined || input === null || input === "";
  switch (f.type) {
    case "boolean": return input === true || input === "true";
    case "number": {
      if (empty) { if (f.required) errors[path] = `${f.label} is required`; return f.default ?? 0; }
      const n = Number(input);
      if (!Number.isFinite(n)) { errors[path] = `${f.label} must be a number`; return 0; }
      if (f.min !== undefined && n < f.min) errors[path] = `${f.label} must be at least ${f.min}`;
      if (f.max !== undefined && n > f.max) errors[path] = `${f.label} must be at most ${f.max}`;
      return n;
    }
    case "tags": case "list": {
      const arr = Array.isArray(input) ? input : [];
      const cap = f.type === "list" && f.fields ? (f.max ?? 50) : 50;
      if (f.required && !arr.length) errors[path] = `${f.label} needs at least one item`;
      if (arr.length > cap) errors[path] = `Too many items in ${f.label} (max ${cap})`;
      if (f.fields) return arr.slice(0, 50).map((it, i) => validateFields(f.fields!, (it ?? {}) as Record<string, unknown>, `${path}.${i}`, errors));
      return arr.slice(0, 50).map((s) => clean(s, false).slice(0, f.type === "tags" ? 60 : 1000)).filter(Boolean);
    }
    case "object": return validateFields(f.fields ?? [], (input ?? {}) as Record<string, unknown>, path, errors);
    default: break;
  }
  const multi = f.type === "textarea" || f.type === "markdown";
  const s = clean(input, multi);
  if (!s) { if (f.required) errors[path] = `${f.label} is required`; return ""; }
  if (f.max && s.length > f.max) { errors[path] = `${f.label} is too long (max ${f.max} characters)`; return s.slice(0, f.max); }
  if (f.type === "slug" && !SLUG.test(s)) errors[path] = `${f.label} may contain only lowercase letters, numbers and dashes`;
  if (f.type === "email" && !EMAIL.test(s)) errors[path] = `${f.label} must be a valid email`;
  if (f.type === "phone" && !PHONE.test(s)) errors[path] = `${f.label} must be a valid phone number`;
  if (f.type === "color" && !HEX.test(s)) errors[path] = `${f.label} must be a hex colour like #2f9ec7`;
  if (f.type === "date" && (!DATE.test(s) || Number.isNaN(Date.parse(s)))) errors[path] = `${f.label} must be a date (YYYY-MM-DD)`;
  if ((f.type === "url" || f.type === "image") && !safeUrl(s)) errors[path] = `${f.label} must be a web address or a path starting with /`;
  if (f.type === "select" && f.options && !f.options.some((o) => o.value === s)) errors[path] = `${f.label} has an invalid choice`;
  return s;
}

export function validateFields(fields: Field[], data: Record<string, unknown>, path: string, errors: Errors): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = data[f.key];
    out[f.key] = one(f, raw === undefined && f.default !== undefined ? f.default : raw, path ? `${path}.${f.key}` : f.key, errors);
  }
  return out;
}

/** Whitelists and cleans a document. Unknown keys are dropped. Throws ValidationError with per-field messages. */
export function validateDoc(entity: Entity, data: unknown): Record<string, unknown> {
  const errors: Errors = {};
  const out = validateFields(entity.fields, (data && typeof data === "object" ? data : {}) as Record<string, unknown>, "", errors);
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return out;
}

/** Fresh empty document for the "Add" form. */
export function blankDoc(fields: Field[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.type === "list" || f.type === "tags") out[f.key] = [];
    else if (f.type === "object") out[f.key] = blankDoc(f.fields ?? []);
    else if (f.type === "boolean") out[f.key] = false;
    else if (f.type === "number") out[f.key] = f.default ?? 0;
    else out[f.key] = f.default ?? "";
  }
  return out;
}
