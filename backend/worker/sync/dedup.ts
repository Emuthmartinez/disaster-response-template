/**
 * Detección de posibles duplicados (read-only) — sub-fase 6a.
 *
 * NO modifica datos ni agrupa: solo reporta candidatos para que el equipo vea la
 * magnitud y la calidad antes de colapsar nada. Ver RFC §6 / análisis sobre
 * datos reales:
 *  - El NOMBRE agrupa candidatos (blocking), no confirma.
 *  - El discriminador NO es el número de edades, sino su CONCENTRACIÓN
 *    (edades_distintas / registros). En reportes masivos la gente adivina la
 *    edad, así que la misma persona tiene varias edades; lo que la delata es la
 *    redundancia. Ej.: "Vicky Urdaneta" 33 reg / 4 edades (ratio 0.12) = 1
 *    persona mass-reportada; "Carlos González" 15 reg / 10 edades (ratio 0.67)
 *    = ~10 personas distintas.
 *  - La UBICACIÓN es señal débil (la misma persona se escribe de formas muy
 *    distintas), por eso no se usa para descartar.
 */

import { sql } from "drizzle-orm";
import { getDb, hasDbEnv, schema } from "../../src/db";

const { missingPersons } = schema;

/** Umbral de concentración: edades_distintas/registros <= esto => misma persona. */
const AGE_RATIO_THRESHOLD = 0.34;

/** Clasifica un grupo (mismo nombre) por concentración de edades. */
export function classify(
  count: number,
  distinctAges: number,
): "same-person" | "homonyms" {
  if (distinctAges <= 1) return "same-person";
  return distinctAges / count <= AGE_RATIO_THRESHOLD ? "same-person" : "homonyms";
}

export interface DuplicateGroup {
  /** Nombre de muestra (uno de los originales del grupo). */
  name: string;
  count: number;
  /** Edades no nulas distintas dentro del grupo. */
  distinctAges: number;
  distinctLocations: number;
  /**
   * `same-person`: edades consistentes (0 o 1 edad no nula) -> probable misma
   * persona, candidata a agrupar.
   * `homonyms`: 2+ edades distintas -> probablemente varias personas, NO agrupar.
   */
  classification: "same-person" | "homonyms";
}

export interface DuplicateReport {
  source: string;
  /** Filas totales de la fuente consideradas. */
  totalRows: number;
  /** Grupos (nombre normalizado) con más de un registro. */
  duplicateGroups: number;
  /** Filas que sobran si se colapsara TODO grupo (techo bruto). */
  collapsibleRows: number;
  /** Grupos clasificados como misma persona (alta confianza). */
  samePersonGroups: number;
  /** Filas colapsables solo de los grupos same-person (estimación segura). */
  samePersonCollapsible: number;
  /** Grupos ambiguos (posibles homónimos) a revisar a mano. */
  homonymGroups: number;
  topGroups: DuplicateGroup[];
  generatedAt: number;
}

interface Row {
  name: string;
  c: number;
  ages: number;
  locs: number;
}

export async function buildDuplicateReport(
  opts: { source?: string; limitGroups?: number } = {},
): Promise<DuplicateReport> {
  if (!hasDbEnv()) {
    throw new Error("buildDuplicateReport requiere DATABASE_URL.");
  }
  const source = opts.source ?? "example-source";
  const limitGroups = Math.min(Math.max(Math.trunc(opts.limitGroups ?? 50), 1), 200);
  const db = getDb();

  // Una sola pasada: agrupa por nombre normalizado y cuenta edades/ubicaciones.
  // Usa el escape hatch `sql`: translate() + agregados FILTER no se expresan
  // limpiamente con el query builder. Semántica idéntica a la versión SQL cruda.
  const groups = (
    await db.execute(sql`
      WITH norm AS (
        SELECT translate(lower(trim(${missingPersons.name})), 'áéíóúüñ', 'aeiouun') AS nm,
               ${missingPersons.name} AS name, ${missingPersons.age} AS age,
               translate(lower(trim(${missingPersons.lastSeen})), 'áéíóúüñ', 'aeiouun') AS loc
        FROM ${missingPersons}
        WHERE ${missingPersons.source} = ${source} AND trim(${missingPersons.name}) <> ''
      )
      SELECT min(name) AS name,
             count(*)::int AS c,
             count(DISTINCT age) FILTER (WHERE age IS NOT NULL)::int AS ages,
             count(DISTINCT loc) FILTER (WHERE loc <> '')::int AS locs
      FROM norm
      GROUP BY nm
      HAVING count(*) > 1
    `)
  ).rows as unknown as Row[];

  const totalRowsRes = (
    await db.execute(sql`
      SELECT count(*)::int AS n FROM ${missingPersons}
      WHERE ${missingPersons.source} = ${source} AND trim(${missingPersons.name}) <> ''
    `)
  ).rows as { n: number }[];

  let collapsibleRows = 0;
  let samePersonGroups = 0;
  let samePersonCollapsible = 0;
  let homonymGroups = 0;
  for (const g of groups) {
    collapsibleRows += g.c - 1;
    if (classify(g.c, g.ages) === "same-person") {
      samePersonGroups++;
      samePersonCollapsible += g.c - 1;
    } else {
      homonymGroups++;
    }
  }

  const topGroups: DuplicateGroup[] = [...groups]
    .sort((a, b) => b.c - a.c)
    .slice(0, limitGroups)
    .map((g) => ({
      name: g.name,
      count: g.c,
      distinctAges: g.ages,
      distinctLocations: g.locs,
      classification: classify(g.c, g.ages),
    }));

  return {
    source,
    totalRows: totalRowsRes[0]?.n ?? 0,
    duplicateGroups: groups.length,
    collapsibleRows,
    samePersonGroups,
    samePersonCollapsible,
    homonymGroups,
    topGroups,
    generatedAt: Date.now(),
  };
}
