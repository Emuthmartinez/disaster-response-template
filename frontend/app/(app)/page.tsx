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

export const revalidate = 300;

export default async function Home() {
  const queryClient = getQueryClient();
  try {
    const data = await serverApiGetCached<AcopioResponse>(
      buildAcopioUrl(ACOPIO_DEFAULT_FILTERS),
      300,
    );
    queryClient.setQueryData(qk.acopio.list(ACOPIO_DEFAULT_FILTERS), data);
  } catch {
    // El hub cliente reintenta si el prefetch falla al generar la home.
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <HomePage />
    </HydrationBoundary>
  );
}
