import { QueryClient, isServer } from "@tanstack/react-query";

/**
 * Config global de TanStack Query. Estos defaults resuelven, de raíz, los
 * problemas que teníamos con el fetching manual:
 *
 *  - refetchIntervalInBackground:false  -> el polling se PAUSA solo cuando la
 *    pestaña no está visible (reemplaza el cableado manual de visibilitychange
 *    que repetían 6 componentes).
 *  - staleTime corto por defecto; cada query polleada fija su refetchInterval.
 *  - structuralSharing (ON por defecto en v5) -> si los datos no cambian, se
 *    conserva la identidad de los objetos => NO re-render (reemplaza mergeById).
 *  - retry acotado y sin reintento en 4xx (un 400/404 no se arregla reintentando).
 *  - refetchOnWindowFocus:false -> en una app de polling, refetch al enfocar es
 *    ruido; el intervalo ya mantiene fresco.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        refetchIntervalInBackground: false,
        retry: (failureCount, error) => {
          const status = (error as { status?: number })?.status;
          if (status && status >= 400 && status < 500) return false;
          return failureCount < 2;
        },
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

/**
 * Server: SIEMPRE un cliente nuevo (aislado por request, sin fuga de cache
 * entre usuarios). Browser: singleton de módulo (un solo cache para la pestaña;
 * sobrevive a suspense/HMR). Usado por el provider y por el prefetch en RSC.
 */
export function getQueryClient(): QueryClient {
  if (isServer) return makeQueryClient();
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}
