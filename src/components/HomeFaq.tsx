import { services } from "../data/content";
import { homeFaqs } from "../../shared/seo";
import { usePrefs } from "../lib/prefs";
import { Faq } from "./Pages";

/** Common questions, taken from the service pages. Also published as FAQPage structured data by the server. */
export default function HomeFaq() {
  const { t } = usePrefs();
  const items = homeFaqs(services);
  if (!items.length) return null;
  return (
    <section id="faq" className="home-faq" aria-labelledby="home-faq-h">
      <h2 id="home-faq-h">{t("svc.faq", "Frequently asked questions")}</h2>
      <Faq items={items} />
    </section>
  );
}
