import type { Metadata } from "next";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import SubPageShell from "@/components/layout/SubPageShell";
import { getQueryClient } from "@/lib/get-query-client";
import { qk } from "@/lib/query-keys";
import { serverApiGetCached } from "@/lib/server-api";
import { pageMetadata } from "@/lib/metadata";
import {
  PET_DEFAULT_LIST_PARAMS,
  buildPetsUrl,
  type PetListResponse,
  type PetStats,
} from "@/lib/pets";
import Pets from "@/components/features/pets";

export const revalidate = 300;

/**
 * `Pets` se importa DIRECTAMENTE, sin next/dynamic, a proposito — misma razon
 * que en /hospitales: partir en chunks el contenido PRINCIPAL de una ruta cuyo
 * unico proposito es ese contenido no ahorra bytes utiles, y ahi ya nos costo
 * una pagina colgada para siempre en "Cargando…". Ver el comentario largo en
 * app/(app)/hospitales/page.tsx.
 */
export const metadata: Metadata = pageMetadata({
  title: "Mascotas perdidas",
  description:
    "Directorio de mascotas perdidas y encontradas tras el desastre: publica un reporte con foto y señas, o busca por nombre, raza, color o zona.",
  path: "/mascotas",
});

export default async function MascotasPage() {
  const queryClient = getQueryClient();

  // A DIFERENCIA de la home, aqui SI se prefetchean: en esta ruta las mascotas
  // son el contenido primario, no algo detras de una pestaña. Sin esto la lista
  // no aparece hasta que el navegador hidrata, y mientras tanto se pinta el
  // estado vacio — que se lee como "no hay ninguna reportada".
  const [list, stats] = await Promise.allSettled([
    serverApiGetCached<PetListResponse>(
      buildPetsUrl(PET_DEFAULT_LIST_PARAMS),
      revalidate,
    ),
    serverApiGetCached<{ stats: PetStats }>("/api/pets/stats", revalidate),
  ]);

  // Lo que falle degrada a "carga como antes", nunca a "roto": TanStack
  // considera stale el dato deshidratado y refetchea al montar.
  if (list.status === "fulfilled") {
    queryClient.setQueryData(qk.pets.list(PET_DEFAULT_LIST_PARAMS), list.value);
  }
  if (stats.status === "fulfilled") {
    queryClient.setQueryData(qk.pets.stats, stats.value.stats);
  }

  return (
    <SubPageShell
      breadcrumb="Mascotas perdidas"
      path="/mascotas"
      article={{
        headline: "Mascotas perdidas y encontradas",
        description:
          "Directorio publico de mascotas perdidas tras el desastre, con reporte ciudadano y busqueda por raza, color y zona.",
      }}
    >
      <HydrationBoundary state={dehydrate(queryClient)}>
        <Pets />
      </HydrationBoundary>
    </SubPageShell>
  );
}
