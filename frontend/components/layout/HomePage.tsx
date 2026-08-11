import dynamic from "next/dynamic";
import EmergencyApp from "@/components/features/emergency";
import { HeroDesktopNav, MobileStickyNav } from "@/components/layout/SectionNav";
import SiteFooter from "@/components/layout/SiteFooter";
import HeroSection from "@/components/layout/HeroSection";
import HelpSection from "@/components/layout/HelpSection";
import TutorialSteps from "@/components/layout/TutorialSteps";
import MissingPersonsCarousel from "@/components/features/missing-carousel";
import ResponseGridHub from "@/components/features/responsegrid";
import { LazySection } from "@/components/ui/LazySection";
import { SectionLoading } from "@/components/ui/SectionLoading";

// El directorio de personas se importa ESTÁTICO, no con next/dynamic. Es
// contenido primario de la home; meterlo en un chunk aparte solo añade
// latencia (un round-trip más antes de poder hidratar y disparar la primera
// query).
//
// Además evita un fallo real: next/dynamic lo envuelve en un boundary de
// Suspense, y React 19 programa el "reveal" de un boundary con
// requestAnimationFrame — que NO se ejecuta en una pestaña en segundo plano.
// En una pestaña abierta con ⌘-clic o restaurada al arrancar el navegador, la
// sección se queda clavada en el esqueleto de carga indefinidamente (el
// contenido queda en el <div hidden> de staging de React, sin insertarse).
// El form de reporte y el modal de detalle SIGUEN siendo dynamic: esos sí son
// pesados y solo hacen falta tras una interacción.

const EarthquakesPanel = dynamic(
  () => import("@/components/features/earthquakes"),
  {
    loading: () => (
      <SectionLoading label="Cargando sismos recientes…" rows={4} />
    ),
  },
);

export default function HomePage() {
  return (
    <>
      <HeroDesktopNav />
      <main id="main" className="e-shell-main">
        <HeroSection />

        {/* El mapa en vivo es lo primero tras el hero: es la razón por la que
            alguien llega al sitio durante una emergencia. ResponseGridHub
            sigue existiendo aquí debajo — se oculta solo (ver
            lib/responsegrid.ts) cuando el deployment no configuró
            NEXT_PUBLIC_RESPONSEGRID_SLUG, así que no hace falta un segundo
            flag para decidir si se renderiza. */}
        <EmergencyApp />

        <ResponseGridHub />

        <MissingPersonsCarousel />

        <TutorialSteps />

        <HelpSection />

        <LazySection rootMargin="400px" minHeight={240}>
          <EarthquakesPanel />
        </LazySection>
      </main>

      <SiteFooter />
      <MobileStickyNav />
    </>
  );
}
