import siteJson from "../content/site.json";
import pagesJson from "../content/pages.json";
import servicesJson from "../content/services.json";
import postsJson from "../content/posts.json";

/** Local, optimised copies of the original site's images (decorative backgrounds). */
export const img = {
  logo: "/img/logo-t.webp",
  hero: "/img/hero.webp",
  aboutBg: "/img/about-bg.webp",
  intro: "/img/intro.webp",
  offeringsBg: "/img/offerings-bg.webp",
  circuit: "/img/circuit.webp",
  contactBg: "/img/contact-bg.webp",
  footerBg: "/img/footer-bg.webp",
};

export interface SiteInfo {
  name: string; description: string; email: string; phone: string; phoneLabel: string;
  whatsapp: string; whatsappMessage: string; linkedin: string; footerNote: string;
}
export interface Hero { lineA: string; lineB: string; words: string[]; card: string; cta: string }
export interface About {
  eyebrow: string; lead: string; intro: string; paragraphs: string[];
  stats: { label: string; value: number; suffix: string }[];
  pillars: { icon: string; title: string; text: string }[];
  values: { title: string; text: string }[];
}
export interface Sections {
  partners: { eyebrow: string; heading: string; sub: string };
  team: { heading: string; partnersHeading: string };
  advantages: { heading: string };
  offerings: { heading: string; sub: string; intro: string };
  process: { eyebrow: string; heading: string };
  attributes: { eyebrow: string; heading: string; text: string; cta: string };
  quiz: { eyebrow: string; heading: string };
  resources: { eyebrow: string; heading: string };
  contact: { heading: string; emailNote: string };
}
export interface Partner { name: string; src: string; url: string; color: string; tagline: string }
export interface Member {
  name: string; role: string; photo: string; linkedin: string; bio?: string; featured?: boolean;
  skills?: string[]; certs?: { vendor: string; color: string; logo?: string }[]; linkLabel?: string; linkUrl?: string;
}
export type IconName = "spark" | "dropbox" | "gear" | "ring";
export interface Offering { title: string; icon: IconName; slug: string; text: string }
export interface Item { title: string; text: string }
export interface Testimonial { quote: string; name: string; role: string; company?: string }
export interface Badge { name: string; src?: string; href?: string }
export interface Service {
  slug: string; title: string; tagline: string; intro: string;
  covers: string[]; steps: { title: string; text: string }[]; faqs: { q: string; a: string }[];
}
export interface Post { slug: string; title: string; date: string; readMins: number; excerpt: string; body: string }
export interface LegalPage { slug: string; title: string; body: string }
export interface Resource { slug: string; title: string; description: string; bullets: string[]; fileName: string }

export interface ContentBundle {
  site: SiteInfo; hero: Hero; about: About; sections: Sections;
  partners: Partner[]; team: Member[]; advantages: Item[]; offerings: Offering[]; attributes: Item[];
  services: Service[]; posts: Post[]; testimonials: Testimonial[]; badges: Badge[]; legal: LegalPage[]; resources: Resource[];
}

const byDateDesc = (a: Post, b: Post) => b.date.localeCompare(a.date);

// Live bindings: components read these at render time. `applyContent` swaps in the server's data.
export let siteInfo = pagesJson.site as SiteInfo;
export let hero = pagesJson.hero as Hero;
export let about = pagesJson.about as About;
export let sections = pagesJson.sections as Sections;
export let legal = pagesJson.legal as LegalPage[];
export let resources = pagesJson.resources as Resource[];
export let partners = siteJson.partners as Partner[];
export let team = siteJson.team as Member[];
export let advantages = siteJson.advantages as Item[];
export let offerings = siteJson.offerings as Offering[];
export let attributes = siteJson.attributes as Item[];
export let testimonials = siteJson.testimonials as Testimonial[];
export let badges = siteJson.badges as Badge[];
export let services = servicesJson.items as unknown as Service[];
export let posts = [...(postsJson.items as Post[])].sort(byDateDesc);

// Tiny external store so React re-renders when the CMS data arrives or changes.
let version = 0;
const listeners = new Set<() => void>();
export const subscribeContent = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const getContentVersion = () => version;

export function applyContent(c: Partial<ContentBundle>) {
  if (c.site) siteInfo = c.site;
  if (c.hero) hero = c.hero;
  if (c.about) about = c.about;
  if (c.sections) sections = c.sections;
  if (c.legal) legal = c.legal;
  if (c.resources) resources = c.resources;
  if (c.partners) partners = c.partners;
  if (c.team) team = c.team;
  if (c.advantages) advantages = c.advantages;
  if (c.offerings) offerings = c.offerings;
  if (c.attributes) attributes = c.attributes;
  if (c.testimonials) testimonials = c.testimonials;
  if (c.badges) badges = c.badges;
  if (c.services) services = c.services;
  if (c.posts) posts = [...c.posts].sort(byDateDesc);
  version++;
  listeners.forEach((l) => l());
}

/** Official vendor logos shipped with the site, used when a certification has no logo set. */
const OEM_LOGOS: Record<string, string> = {
  zscaler: "/img/oem/zscaler-symbol.svg", fortinet: "/img/oem/fortinet.svg", "palo alto networks": "/img/oem/paloalto.svg",
};
export const oemLogo = (vendor: string, logo?: string) => logo || OEM_LOGOS[vendor.trim().toLowerCase()] || "";

export const nav = [
  { label: "Home", id: "home" },
  { label: "Services", id: "services-list" },
  { label: "Features", id: "features" },
  { label: "About Us", id: "about" },
  { label: "Contact Us", id: "contact" },
] as const;

const SITE_URL = ((import.meta.env.VITE_SITE_URL as string | undefined) ?? "https://www.duruvasa.com").replace(/\/$/, "");

/** Getter-based so it always reflects the latest CMS data. */
export const SITE = {
  get name() { return siteInfo.name; },
  get url() { return SITE_URL; },
  get email() { return siteInfo.email; },
  get description() { return siteInfo.description; },
  get phone() { return siteInfo.phone; },
  get whatsapp() { return siteInfo.whatsapp; },
};

/** "+919833445810" -> "+91 98334 45810" for display. */
export function prettyPhone(p: string): string {
  const d = p.replace(/[^\d+]/g, "");
  const m = d.match(/^\+91(\d{5})(\d{5})$/);
  return m ? `+91 ${m[1]} ${m[2]}` : p;
}
