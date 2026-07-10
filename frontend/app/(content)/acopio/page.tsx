import dynamic from "next/dynamic";
import type { Metadata } from "next";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { pageMetadata } from "@/lib/metadata";
import SubPageShell from "@/components/layout/SubPageShell";
import { getQueryClient } from "@/lib/get-query-client";
import { qk } from "@/lib/query-keys";
import { serverApiGetCached } from "@/lib/server-api";
import {
  ACOPIO_DEFAULT_FILTERS,
  buildAcopioUrl,
  type AcopioResponse,
} from "@/lib/acopio";

// Refresca el HTML server-rendered cada 5 min (los centros cambian poco).
export const revalidate = 300;

const CollectionCenters = dynamic(
  () => import("@/components/features/collection/CollectionCenters"),
  {
    loading: () => (
      <section className="mx-auto w-full max-w-7xl px-4 py-10 text-sm text-slate-500">
        Cargando centros de acopio…
      </section>
    ),
  },
);

export const metadata: Metadata = pageMetadata({
  title: "Centros de acopio",
  description:
    "Puntos verificados para entregar agua, alimentos, medicinas y artículos de primera necesidad.",
  path: "/acopio",
});

export default async function AcopioPage() {
  // Prefetch en el servidor con los MISMOS filtros del primer render del cliente,
  // para que el listado de centros venga en el HTML (visible para buscadores y
  // agentes de IA) y se hidrate sin re-fetch. Espeja app/(app)/hospitales/page.tsx.
  // Se hace a mano (en vez de prefetchQuery) para reutilizar el mismo resultado
  // en el ItemList de abajo, sin pedirlo dos veces.
  const queryClient = getQueryClient();
  let centers: AcopioResponse["items"] = [];
  try {
    const data = await serverApiGetCached<AcopioResponse>(
      buildAcopioUrl(ACOPIO_DEFAULT_FILTERS),
      300,
    );
    queryClient.setQueryData(qk.acopio.list(ACOPIO_DEFAULT_FILTERS), data);
    centers = data.items;
  } catch {
    // Si el backend no responde al generar/revalidar la página, el componente
    // cliente hace su propio fetch como respaldo; no rompemos el render.
  }

  // ItemList: colección legible por máquina para buscadores/agentes de IA.
  // Script inline (no depende de helpers compartidos aún no mergeados) para
  // que este PR siga siendo independiente.
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Centros de acopio",
    numberOfItems: centers.length,
    itemListElement: centers.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      ...([c.city, c.country].filter(Boolean).length
        ? { description: [c.city, c.country].filter(Boolean).join(", ") }
        : {}),
    })),
  };

  return (
    <SubPageShell breadcrumb="Centros de acopio">
      {centers.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(itemListJsonLd).replace(/</g, "\\u003c"),
          }}
        />
      )}
      <HydrationBoundary state={dehydrate(queryClient)}>
        <CollectionCenters />
      </HydrationBoundary>
    </SubPageShell>
  );
}
