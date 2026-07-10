import dynamic from "next/dynamic";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";
import SubPageShell from "@/components/layout/SubPageShell";

const SurvivalGuide = dynamic(
  () => import("@/components/features/guide/SurvivalGuide"),
  {
    loading: () => (
      <section className="mx-auto w-full max-w-7xl px-4 py-10 text-sm text-slate-500">
        Cargando guía…
      </section>
    ),
  },
);

export const metadata: Metadata = pageMetadata({
  title: "Guía rápida de emergencia",
  description:
    "Pasos esenciales antes, durante y después de un sismo. Cómo proteger a tu familia y solicitar ayuda.",
  path: "/guia",
});

export default function GuiaPage() {
  return (
    <SubPageShell
      breadcrumb="Guía rápida"
      path="/guia"
      article={{
        headline: "Guía rápida de emergencia ante un sismo",
        description:
          "Pasos esenciales antes, durante y después de un sismo. Cómo proteger a tu familia y solicitar ayuda.",
      }}
    >
      <SurvivalGuide />
    </SubPageShell>
  );
}
