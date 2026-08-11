"use client";

import Link from "next/link";
import { useEffect } from "react";
import { HeroDesktopNav, MobileStickyNav } from "@/components/layout/SectionNav";
import SiteFooter from "@/components/layout/SiteFooter";

/**
 * ¿El fallo es "el JS de esta pagina ya no existe"?
 *
 * Cada despliegue publica chunks con nombres nuevos. Una pestaña abierta desde
 * ANTES del despliegue sigue con el HTML viejo, que pide chunks que ya no
 * estan: el import dinamico da 404 y Next cae aqui. No es un bug de la app —
 * el usuario solo necesita HTML nuevo.
 */
function isStaleChunkError(error: unknown): boolean {
  const err = error as { name?: string; message?: string } | null;
  const msg = err ? `${err.name ?? ""} ${err.message ?? ""}` : String(error);
  return /ChunkLoadError|Loading chunk \d+ failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(
    msg,
  );
}

const RELOAD_GUARD_KEY = "e-chunk-reload";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Recarga automatica UNA sola vez cuando el fallo es de chunk obsoleto. El
  // guard en sessionStorage evita el bucle si tras recargar sigue fallando
  // (ahi si es un problema de verdad y conviene mostrar el error).
  useEffect(() => {
    if (!isStaleChunkError(error)) return;
    try {
      if (sessionStorage.getItem(RELOAD_GUARD_KEY)) return;
      sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
    } catch {
      return; // sin sessionStorage no arriesgamos un bucle de recargas
    }
    window.location.reload();
  }, [error]);

  // Al renderizar bien, limpiamos el guard para que la proxima vez pueda actuar.
  useEffect(() => {
    if (isStaleChunkError(error)) return;
    try {
      sessionStorage.removeItem(RELOAD_GUARD_KEY);
    } catch {
      /* sin storage, nada que limpiar */
    }
  }, [error]);

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
