"use client";

import Link from "next/link";
import { HeroDesktopNav, MobileStickyNav } from "@/components/layout/SectionNav";
import SiteFooter from "@/components/layout/SiteFooter";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <>
      <HeroDesktopNav />
      <main
        id="main"
        className="flex min-h-[60vh] flex-1 flex-col items-center justify-center gap-4 bg-[var(--ebg)] px-4 text-center"
      >
        <span className="text-5xl" aria-hidden>
          ⚠️
        </span>
        <h1 className="text-2xl font-black text-[var(--etext)]">Algo salió mal</h1>
        <p className="max-w-md text-[var(--etext2)]">
          Ocurrió un error al cargar esta sección. Puedes reintentar o volver al
          inicio. Si es una emergencia, contacta también a los servicios oficiales.
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <button type="button" onClick={reset} className="e-btn e-btn-brand px-5 py-2.5 text-sm">
            Reintentar
          </button>
          <Link href="/" className="e-btn e-btn-secondary px-5 py-2.5 text-sm">
            Ir al inicio
          </Link>
        </div>
      </main>
      <SiteFooter />
      <MobileStickyNav />
    </>
  );
}
