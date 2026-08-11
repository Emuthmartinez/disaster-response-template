import type { Metadata } from "next";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import SubPageShell from "@/components/layout/SubPageShell";
import { getQueryClient } from "@/lib/get-query-client";
import { qk } from "@/lib/query-keys";
import { serverApiGetCached } from "@/lib/server-api";
import { pageMetadata } from "@/lib/metadata";
import type { HospitalsResponse } from "@/hooks/hospitals";
import Hospitals from "@/components/features/hospitals";

export const revalidate = 300;

/**
 * `Hospitals` se importa DIRECTAMENTE, sin next/dynamic, a proposito.
 *
 * Con `dynamic()` esta pagina se quedaba colgada para siempre en "Cargando
 * hospitales…" en navegadores reales, aunque curl viera un HTML de 200
 * aparentemente completo.
 *
 * El mecanismo, comparando el HTML servido con el de /acopio (que si funciona
 * y usa el mismo patron):
 *
 *   /acopio      -> 0 <template id="B:n">, 0 $RC(  ... la frontera resuelve
 *                   EN LINEA durante el SSR.
 *   /hospitales  -> 1 <template id="B:0">, 1 <div hidden id="S:0">, 1 $RC(
 *                   ... el SSR tardaba lo suficiente (el prefetch de
 *                   /api/hospitals con limit=1000) como para que React
 *                   vaciara primero el fallback y enviara el contenido
 *                   despues, dejando la revelacion en manos del script $RC().
 *
 * Ese swap nunca llegaba a ejecutarse en el navegador, asi que el usuario se
 * quedaba mirando el placeholder de forma indefinida — en la ruta mas critica
 * del sitio durante una emergencia.
 *
 * Quitar `dynamic()` elimina esa frontera diferida. Y no se pierde nada:
 * partir en chunks el contenido PRINCIPAL de una ruta cuyo unico proposito es
 * ese contenido no ahorra bytes utiles, solo añade un viaje mas.
 *
 * VERIFICACION tras desplegar: grepea el HTML servido de la ruta y comprueba
 * 0 ocurrencias de '$RC(' y '<template id="B:' — si aparece alguna, algo
 * volvió a envolver el contenido primario en un boundary diferido.
 */

export const metadata: Metadata = pageMetadata({
  title: "Hospitales y pacientes",
  description:
    "Red hospitalaria priorizada con búsqueda global de pacientes por nombre o número de cédula.",
  path: "/hospitales",
});

export default async function HospitalesPage() {
  const queryClient = getQueryClient();
  await queryClient
    .prefetchQuery({
      queryKey: qk.hospitals.list({ include: "states", limit: 1000 }),
      queryFn: () =>
        serverApiGetCached<HospitalsResponse>(
          "/api/hospitals?include=states&limit=1000",
          300,
        ),
    })
    .catch(() => {});

  return (
    <SubPageShell breadcrumb="Hospitales y pacientes" path="/hospitales">
      <HydrationBoundary state={dehydrate(queryClient)}>
        <Hospitals />
      </HydrationBoundary>
    </SubPageShell>
  );
}
