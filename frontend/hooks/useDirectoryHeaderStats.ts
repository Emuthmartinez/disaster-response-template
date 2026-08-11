"use client";

/**
 * Cabecera compartida "N reportadas / N activas / N encontradas" que usan
 * PersonsTab y PetsTab. Antes cada pestaña reimplementaba la misma lógica de
 * formateo por su cuenta (visto en la deployment original: los dos archivos
 * tenían el mismo `fmtCount`/`statsUnknown` copiado carácter por carácter).
 * Extraído aquí para que un cambio en la regla ("qué contar como '—'", cómo se
 * formatea un número) se haga una vez y no diverja entre dominios.
 *
 * Los TRES contadores deben salir siempre de un endpoint /stats propio del
 * dominio, NUNCA del `total` de una lista filtrada: ese total es el del filtro
 * activo (p.ej. con "Encontradas" puesto, el total de la lista ES el conteo de
 * encontradas), y usarlo como si fuera el total del directorio muestra números
 * que no cuadran entre sí.
 *
 * Mientras las stats están en vuelo (`isPending`) o la petición falló
 * (`isError`) no se afirma "0": se muestra "—". Un cero mientras el dato viaja
 * —o cuando la petición falló— se lee como "no hay ninguno reportado", que es
 * una afirmación falsa sobre cuánta gente/mascotas hay buscándose.
 */
export interface DirectoryHeaderStatsInput {
  total?: number;
  active?: number;
  found?: number;
}

export interface DirectoryHeaderStatsQuery {
  data?: DirectoryHeaderStatsInput;
  isPending: boolean;
  isError: boolean;
}

export interface DirectoryHeaderStats {
  statsUnknown: boolean;
  reportedTotal: number;
  activeTotal: number;
  foundTotal: number;
  reportedLabel: string;
  activeLabel: string;
  foundLabel: string;
}

export function useDirectoryHeaderStats(
  stats: DirectoryHeaderStatsQuery,
): DirectoryHeaderStats {
  const reportedTotal = stats.data?.total ?? 0;
  const activeTotal = stats.data?.active ?? 0;
  const foundTotal = stats.data?.found ?? 0;
  const statsUnknown = stats.isPending || stats.isError;
  const fmtCount = (n: number) => (statsUnknown ? "—" : n.toLocaleString("es"));

  return {
    statsUnknown,
    reportedTotal,
    activeTotal,
    foundTotal,
    reportedLabel: fmtCount(reportedTotal),
    activeLabel: fmtCount(activeTotal),
    foundLabel: fmtCount(foundTotal),
  };
}
