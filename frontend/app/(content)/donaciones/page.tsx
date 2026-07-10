import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/metadata";
import SubPageShell from "@/components/layout/SubPageShell";
import { Info, LifeBuoy } from "lucide-react";
import OfertasList from "./OfertasList";

export const metadata: Metadata = pageMetadata({
  title: "Donaciones",
  description: "Dona dinero, sangre o insumos a organizaciones verificadas que trabajan en el terreno. Iniciativa ciudadana, independiente y no gubernamental.",
  path: "/donaciones",
});

export default function DonacionesPage() {
  return (
    <SubPageShell breadcrumb="Donaciones">
      <section className="mx-auto w-full max-w-[1120px] px-4 py-8 sm:px-6">
        <h1 className="mb-2 text-[28px] font-bold text-slate-900 sm:text-[32px]">Donaciones</h1>
        <p className="mb-4 text-[15px] text-slate-600 sm:text-base">
          Dona dinero, sangre o insumos a organizaciones verificadas que trabajan en el terreno.
        </p>

        {/* Acceso directo para quien llega buscando ayuda y no a donar:
            lleva al directorio de apoyo mapeado (/apoyo-disponible).
            Full-width en mobile, compacto en desktop. */}
        <Link
          href="/apoyo-disponible"
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-5 py-2.5 text-sm font-semibold text-sky-700 transition-colors hover:bg-sky-100 sm:inline-flex sm:w-auto"
        >
          <LifeBuoy size={16} aria-hidden />
          Necesito apoyo
        </Link>

        <div className="mb-10">
          <OfertasList />
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-medium text-amber-900">
          <Info size={18} className="shrink-0 text-amber-600" />
          <p>Dona solo en sitios oficiales. Desconfía de cuentas no verificadas en redes sociales.</p>
        </div>
      </section>
    </SubPageShell>
  );
}
