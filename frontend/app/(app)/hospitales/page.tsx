import dynamic from "next/dynamic";
import type { Metadata } from "next";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import SubPageShell from "@/components/layout/SubPageShell";
import { getQueryClient } from "@/lib/get-query-client";
import { qk } from "@/lib/query-keys";
import { serverApiGetCached } from "@/lib/server-api";
import { pageMetadata } from "@/lib/metadata";
import type { HospitalsResponse } from "@/hooks/hospitals";

export const revalidate = 300;

const Hospitals = dynamic(() => import("@/components/features/hospitals"), {
  loading: () => (
    <section className="mx-auto w-full max-w-7xl px-4 py-10 text-sm text-slate-500">
      Cargando hospitales…
    </section>
  ),
});

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
    <SubPageShell breadcrumb="Hospitales y pacientes">
      <HydrationBoundary state={dehydrate(queryClient)}>
        <Hospitals />
      </HydrationBoundary>
    </SubPageShell>
  );
}
