import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import HomePage from "@/components/layout/HomePage";
import { getQueryClient } from "@/lib/get-query-client";
import { qk } from "@/lib/query-keys";
import { serverApiGetCached } from "@/lib/server-api";
import {
  ACOPIO_DEFAULT_FILTERS,
  buildAcopioUrl,
  type AcopioResponse,
} from "@/lib/acopio";
import {
  MISSING_DEFAULT_LIST_PARAMS,
  buildMissingUrl,
  type MissingListResponse,
  type MissingStats,
} from "@/lib/missing";

export const revalidate = 300;

export default async function Home() {
  const queryClient = getQueryClient();

  // Los tres prefetch van EN PARALELO: son independientes, así que la latencia
  // es el máximo y no la suma. Cada uno falla por separado (allSettled) — que el
  // hub de acopio esté caído no puede dejar el directorio de personas sin datos.
  //
  // POR QUÉ el listado de personas se prefetchea aquí: es el contenido primario
  // del sitio. Si solo se pide desde el cliente, no aparece hasta que el
  // navegador descarga el bundle, hidrata y hace el round-trip a la API — y
  // mientras tanto la UI renderiza el estado vacío ("Aún no hay reportes", "0
  // reportadas"), que se lee como "no hay nadie reportado" en vez de "cargando".
  // Con el prefetch, la primera pintura ya lleva las personas dentro del HTML.
  //
  // POR QUÉ NO se prefetchean las MASCOTAS aquí (omisión deliberada, no olvido):
  // el directorio abre en la pestaña "Personas", así que la lista de mascotas no
  // se pinta hasta que alguien cambia de pestaña. Añadir dos peticiones más al
  // render de la home retrasaría la página que la gente usa para buscar a su
  // familia a cambio de contenido que todavía no se ve. Mismo criterio que
  // HospitalsTab, que tampoco se prefetchea. La capa de mascotas del MAPA sí pide
  // datos (usePetsMap), porque el mapa sí es visible de entrada.
  const [acopio, missingList, missingStats] = await Promise.allSettled([
    serverApiGetCached<AcopioResponse>(
      buildAcopioUrl(ACOPIO_DEFAULT_FILTERS),
      300,
    ),
    serverApiGetCached<MissingListResponse>(
      buildMissingUrl(MISSING_DEFAULT_LIST_PARAMS),
      revalidate,
    ),
    serverApiGetCached<{ stats: MissingStats }>("/api/missing/stats", revalidate),
  ]);

  // El cliente reintenta lo que falle: TanStack considera stale el dato
  // deshidratado y refetchea al montar, así que un prefetch fallido degrada a
  // "carga como antes", nunca a "roto".
  if (acopio.status === "fulfilled") {
    queryClient.setQueryData(
      qk.acopio.list(ACOPIO_DEFAULT_FILTERS),
      acopio.value,
    );
  }
  if (missingList.status === "fulfilled") {
    queryClient.setQueryData(
      qk.missing.list(MISSING_DEFAULT_LIST_PARAMS),
      missingList.value,
    );
  }
  if (missingStats.status === "fulfilled") {
    queryClient.setQueryData(qk.missing.stats, missingStats.value.stats);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <HomePage />
    </HydrationBoundary>
  );
}
