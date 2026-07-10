/**
 * Registro de fuentes. Agregar una fuente nueva = importar su adaptador aquí
 * y sumarlo a `ALL_SOURCES`, gateado por su propio flag `ENABLE_*` (ver
 * docs/modules.md — cada fuente es un módulo opcional, OFF por defecto).
 *
 * Habilitación por env: `SYNC_SOURCES` es una lista csv de ids de fuente que
 * además RESTRINGE cuáles de las ya-habilitadas-por-flag corren (si no se
 * define, corren todas las habilitadas por flag).
 *
 * `example-source` (worked example, fixture sintético, sin red) se registra
 * SOLO con ENABLE_EXAMPLE_SOURCE=true — es el ejemplo de referencia para
 * docs/modules.md. Ningún scraper de un tercero real viene registrado por
 * defecto en este template.
 */

import type { SourceAdapter } from "../types";
import { exampleSourceAdapter } from "./example-source";

/** Todas las fuentes registradas Y habilitadas por su flag de env. */
export const ALL_SOURCES: SourceAdapter[] = [
  ...(process.env.ENABLE_EXAMPLE_SOURCE === "true" ? [exampleSourceAdapter] : []),
];

/** Adaptadores activos según `SYNC_SOURCES` (csv de ids); todas si no se define. */
export function enabledSources(): SourceAdapter[] {
  const raw = (process.env.SYNC_SOURCES ?? "").trim();
  if (!raw) return ALL_SOURCES;
  const ids = new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return ALL_SOURCES.filter((s) => ids.has(s.id));
}

/** Busca un adaptador por id. */
export function getSource(id: string): SourceAdapter | undefined {
  return ALL_SOURCES.find((s) => s.id === id);
}
