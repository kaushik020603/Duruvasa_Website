import { useEffect, useSyncExternalStore } from "react";
import { SITE, getContentVersion, img, siteInfo, subscribeContent } from "./data/content";
import Header from "./components/Header";
import Hero from "./components/Hero";
import Partners from "./components/Partners";
import About from "./components/About";
import Team from "./components/Team";
import Advantages from "./components/Advantages";
import Offerings from "./components/Offerings";
import Process from "./components/Process";
import Quiz from "./components/Quiz";
import Trust from "./components/Trust";
import Attributes from "./components/Attributes";
import Contact from "./components/Contact";
import ResourceSection from "./components/ResourceSection";
import ContactFab from "./components/ContactFab";
import Footer from "./components/Footer";
import { InsightsPage, Legal, NotFound, PostPage, ServicePage } from "./components/Pages";
import { BackToTop, CookieBanner, Loader, ScrollProgress, SectionRail, SkipLink } from "./components/Extras";
import { useReveal } from "./hooks";
import { initFx } from "./fx";
import { installLinkInterceptor, useRoute } from "./lib/router";
import { useHead } from "./lib/head";
import { PrefsProvider, useAnalytics } from "./lib/prefs";

function Home() {
  useHead({
    title: SITE.name, path: "/",
    jsonLd: {
      "@context": "https://schema.org", "@type": "Organization", name: SITE.name, url: SITE.url,
      logo: SITE.url + img.logo, description: SITE.description,
      email: SITE.email,
      telephone: siteInfo.phone,
      contactPoint: { "@type": "ContactPoint", contactType: "customer support", email: SITE.email },
      founder: { "@type": "Person", name: "Rajeshkumar Chemalli", sameAs: "https://www.linkedin.com/in/rchemalli/" },
    },
  });
  return (
    <>
      <Hero />
      <Partners />
      <About />
      <Team />
      <Advantages />
      <Offerings />
      <Process />
      <Attributes />
      <Quiz />
      <Trust />
      <ResourceSection />
      <Contact />
    </>
  );
}

function Shell() {
  useSyncExternalStore(subscribeContent, getContentVersion); // re-render whole tree when CMS content changes
  const route = useRoute();
  useAnalytics();
  useReveal(route.name + ("slug" in route ? route.slug : ""));
  useEffect(() => initFx(), []);
  useEffect(() => installLinkInterceptor(), []);

  return (
    <>
      <SkipLink />
      <Loader />
      <ScrollProgress />
      <Header onHome={route.name === "home"} section={route.name === "insights" || route.name === "post" ? "insights" : null} />
      {route.name === "home" && <SectionRail />}
      <main id="main" tabIndex={-1}>
        {route.name === "home" && <Home />}
        {route.name === "legal" && <Legal slug={route.slug} />}
        {route.name === "service" && <ServicePage slug={route.slug} />}
        {route.name === "insights" && <InsightsPage />}
        {route.name === "post" && <PostPage slug={route.slug} />}
        {route.name === "notfound" && <NotFound />}
      </main>
      <Footer />
      <ContactFab />
      <BackToTop />
      <CookieBanner />
    </>
  );
}

export default function App() {
  return (
    <PrefsProvider>
      <Shell />
    </PrefsProvider>
  );
}
