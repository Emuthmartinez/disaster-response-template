import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";
import SubPageShell from "@/components/layout/SubPageShell";
import SurvivalGuide from "@/components/features/guide/SurvivalGuide";
import { CARDS } from "@/lib/data/survival-guide";
import { howToSchema } from "@/lib/jsonld";

// `SurvivalGuide` se importa DIRECTAMENTE, sin next/dynamic, a proposito: es
// el contenido PRINCIPAL de esta ruta. Ver el comentario largo en
// app/(app)/hospitales/page.tsx sobre por qué next/dynamic puede dejar una
// ruta colgada en "Cargando…" para siempre en pestañas en segundo plano
// (React 19 + Suspense), y por qué además le esconde el contenido a
// crawlers/agentes de IA que no esperan a que llegue el JS.

const GUIDE_TITLE = "Guía rápida de emergencia ante un sismo";
const GUIDE_DESC =
  "Pasos esenciales antes, durante y después de un sismo. Cómo proteger a tu familia y solicitar ayuda.";
/** Fecha editorial del contenido de la guía (ISO). CHANGE_ME: actualiza esto
 *  cuando el contenido de la guía cambie de verdad, no en cada deploy. */
const GUIDE_PUBLISHED = "2026-01-01";

export const metadata: Metadata = pageMetadata({
  title: "Guía rápida de emergencia",
  description: GUIDE_DESC,
  path: "/guia",
});

export default function GuiaPage() {
  const howTo = howToSchema({
    name: GUIDE_TITLE,
    description: GUIDE_DESC,
    path: "/guia",
    steps: CARDS.map((card) => ({
      id: card.id,
      name: card.title,
      text: [
        card.subtitle,
        ...card.bullets.map((b) => b.text),
        ...(card.tip ? [`Consejo: ${card.tip}`] : []),
      ].join(" "),
    })),
  });

  return (
    <SubPageShell
      breadcrumb="Guía rápida"
      path="/guia"
      article={{
        headline: GUIDE_TITLE,
        description: GUIDE_DESC,
        datePublished: GUIDE_PUBLISHED,
        dateModified: GUIDE_PUBLISHED,
      }}
      extraSchema={[howTo]}
    >
      <SurvivalGuide />
    </SubPageShell>
  );
}
