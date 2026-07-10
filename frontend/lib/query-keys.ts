/**
 * Fábrica central de queryKeys. TODA query usa estas claves — NUNCA arrays
 * inline. Razón: la dedup y la invalidación de TanStack Query se basan en
 * igualdad de la queryKey; dos componentes que pidan lo mismo DEBEN usar la
 * MISMA clave o se dispara doble request (el bug que teníamos: carousel + lista
 * polleaban /api/missing por separado). Centralizar las claves lo garantiza.
 *
 * Convención: [dominio, sub, ...params]. Las invalidaciones por prefijo
 * (queryClient.invalidateQueries({ queryKey: qk.missing.all })) limpian todo el
 * dominio tras una mutación.
 */
export const qk = {
  missing: {
    all: ["missing"] as const,
    list: (p: { status: string; page: number; pageSize: number; q?: string }) =>
      ["missing", "list", p] as const,
    map: (bounds: { north: number; south: number; east: number; west: number } | null) =>
      ["missing", "map", bounds] as const,
    stats: ["missing", "stats"] as const,
  },
  reports: {
    all: ["reports"] as const,
    list: ["reports", "list"] as const,
  },
  earthquakes: {
    all: ["earthquakes"] as const,
    list: ["earthquakes", "list"] as const,
  },
  hospitals: {
    all: ["hospitals"] as const,
    list: (p?: Record<string, unknown>) => ["hospitals", "list", p ?? {}] as const,
    patients: (hospitalId: string) => ["hospitals", hospitalId, "patients"] as const,
    supplies: (hospitalId: string) => ["hospitals", hospitalId, "supplies"] as const,
    patientSearch: (q: string) => ["hospitals", "patient-search", q] as const,
  },
  chat: {
    all: ["chat"] as const,
    list: (role?: string) => ["chat", "list", role ?? "all"] as const,
  },
  contact: {
    all: ["contact"] as const,
  },
  acopio: {
    all: ["acopio"] as const,
    list: (p: { country?: string; category?: string; q?: string }) =>
      ["acopio", "list", p] as const,
  },
  geocode: (q: string) => ["geocode", q] as const,
} as const;
