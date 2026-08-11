"use client";

/**
 * Aviso ámbar de "datos guardados de hace X": se muestra cuando el service
 * worker sirvió RESPALDO cacheado porque el backend estaba lento o sin
 * conexión — ver public/sw.js (markStale) y los hooks de stats que exponen
 * `swStaleAt`. En un directorio de personas/mascotas desaparecidas, números
 * congelados de hace horas presentados como actuales son un dato falso:
 * avisar es parte del contrato. Compartido por PersonsTab y PetsTab para que
 * el aviso (copy, umbral, color) no diverja entre pestañas hermanas.
 */

/**
 * "hace X" corto: minutos si es reciente, horas o días después. Sin
 * dependencias nuevas (YAGNI).
 */
function formatAgo(epochMs: number): string {
  const mins = Math.max(1, Math.round((Date.now() - epochMs) / 60_000));
  if (mins < 60) return `${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} días`;
}

export function StaleDataNotice({ staleAt }: { staleAt?: number }) {
  if (staleAt === undefined) return null;
  return (
    // Se actualiza solo (poll de 60 s + revalidación en segundo plano del SW).
    <p role="status" className="e-m-section__sub" style={{ color: "#92400e" }}>
      ⚠️ Mostrando datos guardados de hace {formatAgo(staleAt)} — sin
      conexión estable con el servidor. Se actualizarán automáticamente.
    </p>
  );
}
