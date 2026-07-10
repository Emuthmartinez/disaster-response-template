import dynamic from "next/dynamic";
import EmergencyApp from "@/components/features/emergency";
import { HeroDesktopNav, MobileStickyNav } from "@/components/layout/SectionNav";
import SiteFooter from "@/components/layout/SiteFooter";
import HeroSection from "@/components/layout/HeroSection";
import HelpSection from "@/components/layout/HelpSection";
import TutorialSteps from "@/components/layout/TutorialSteps";
import { LazySection } from "@/components/ui/LazySection";
import ResponseGridHub from "@/components/features/responsegrid";

const MissingPersonsCarousel = dynamic(
  () => import("@/components/features/missing-carousel"),
  {
    loading: () => (
      <section className="e-page-loading">Cargando directorio…</section>
    ),
  },
);

const EarthquakesPanel = dynamic(
  () => import("@/components/features/earthquakes"),
  {
    loading: () => (
      <section className="e-page-loading e-page-loading--alt">
        Cargando sismos…
      </section>
    ),
  },
);

export default function HomePage() {
  return (
    <>
      <HeroDesktopNav />
      <main id="main" className="e-shell-main">
        <HeroSection />
        <ResponseGridHub />

        <MissingPersonsCarousel />

        <TutorialSteps />

        <HelpSection />

        <EmergencyApp />

        <LazySection rootMargin="400px" minHeight={240}>
          <EarthquakesPanel />
        </LazySection>
      </main>

      <SiteFooter />
      <MobileStickyNav />
    </>
  );
}
