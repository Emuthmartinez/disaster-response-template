/**
 * Tipos compartidos del sistema de sincronización de fuentes.
 * Ver docs/rfcs/0001-sincronizacion-fuentes.md
 */

/** Estado de una persona reportada (modelo interno del proyecto). */
export type MissingStatus = "active" | "found";

/**
 * Registro normalizado que produce cada adaptador de fuente. El motor de
 * sincronización no sabe de dónde vino: solo conoce esta forma canónica.
 */
export interface ExternalPerson {
  /** Identificador único DENTRO de la fuente (sin namespace). */
  externalId: string;
  /** Id de la fuente, ej. "example-source". */
  source: string;
  /** Enlace al registro original, si existe. */
  sourceUrl?: string | null;
  name: string;
  age?: number | null;
  /** Texto de la última ubicación conocida. */
  lastSeen?: string | null;
  description?: string | null;
  /**
   * Datos de contacto. Por defecto NO se importan (riesgo de extorsión); cada
   * adaptador decide según su flag de configuración. Ver RFC §6.
   */
  contact?: string | null;
  /** URL absoluta de la foto. */
  photoUrl?: string | null;
  status: MissingStatus;
  resolutionNote?: string | null;
  /** epoch ms */
  resolvedAt?: number | null;
  /** epoch ms */
  createdAt?: number | null;
  /** epoch ms — usado como watermark para sync incremental (futuro). */
  updatedAt?: number | null;
}

/** Contexto que el motor pasa a cada adaptador en `fetchAll`. */
export interface FetchCtx {
  /** User-Agent identificable (proyecto + contacto). */
  userAgent: string;
  /** Tope de registros a traer (para dry-runs y corridas acotadas). */
  limit?: number;
  /** Permite abortar la petición (timeout). */
  signal?: AbortSignal;
  /** Filtro de estado en fuentes que lo soportan. */
  statusFilter?: "found" | "missing";
}

/**
 * Punto de extensión: una fuente nueva = un archivo que implementa esto + una
 * línea en `lib/sync/sources/index.ts`.
 */
export interface SourceAdapter {
  /** Id estable de la fuente (también se usa como namespace del externalId). */
  readonly id: string;
  readonly label: string;
  readonly kind: "json-api" | "pfif" | "html" | "remix-data";
  /** Trae los registros de la fuente, ya normalizados a `ExternalPerson`. */
  fetchAll(ctx: FetchCtx): Promise<ExternalPerson[]>;
  /**
   * Trae UNA página (1-based) — habilita la ejecución por chunks. `totalPages`
   * es null si la fuente no pagina (entonces no se usa el modo chunked).
   * Opcional: si el adaptador no lo implementa, solo soporta `fetchAll`.
   */
  fetchPage?(
    page: number,
    ctx: FetchCtx,
  ): Promise<{ people: ExternalPerson[]; totalPages: number | null }>;
}

/** Resultado de sincronizar una fuente. */
export interface SyncResult {
  source: string;
  ok: boolean;
  dryRun: boolean;
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
  /** Mensaje de fallo a nivel de fuente (si `ok` es false). */
  error?: string;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  // --- solo en modo chunked ---
  /** Páginas procesadas en esta corrida. */
  pagesProcessed?: number;
  /** Rango de páginas [from, to] cubierto en esta corrida. */
  fromPage?: number;
  toPage?: number;
  /** Página por la que arrancará la próxima corrida. */
  nextPage?: number;
  /** true si esta corrida cerró un ciclo completo (volvió a la página 1). */
  cycleCompleted?: boolean;
}
