import Link from "next/link";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";
import SubPageShell from "@/components/layout/SubPageShell";

export const metadata: Metadata = pageMetadata({
  title: "Página no encontrada",
  description:
    "La página que buscas no existe o fue movida. Vuelve al inicio para seguir reportando o consultando información.",
  index: false,
});

export default function NotFound() {
  return (
    <SubPageShell breadcrumb="Página no encontrada">
      <section className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 px-4 py-20 text-center">
        <span className="text-5xl" aria-hidden>
          🧭
        </span>
        <h1 className="text-2xl font-bold text-[var(--etext)]">
          Esta página no existe
        </h1>
        <p className="max-w-md text-[var(--etext2)]">
          Puede que el enlace esté roto o que la página se haya movido. Vuelve al
          inicio para seguir reportando o consultando información.
        </p>
        <Link
          href="/"
          className="e-btn e-btn-brand mt-2 px-5 py-2.5 text-sm font-bold"
        >
          Volver al inicio
        </Link>
      </section>
    </SubPageShell>
  );
}
