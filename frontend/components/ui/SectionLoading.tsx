/**
 * Estado de carga visible para secciones que tardan (mapa, directorios, sismos).
 *
 * POR QUE EXISTE: antes cada seccion mostraba una linea de texto gris —
 * "Cargando directorio…"— centrada en una franja vacia. En un movil, con datos
 * lentos, eso se lee como "aqui no hay nada" y la gente se va. En un sitio de
 * emergencia esa lectura equivocada tiene coste real: alguien concluye que no
 * hay hospitales cerca cuando en realidad la lista todavia esta viajando.
 *
 * Asi que el placeholder ahora PARECE contenido a punto de aparecer: barras
 * pulsantes con la forma aproximada del resultado, mas la etiqueta de que se
 * esta cargando.
 *
 * Accesibilidad: `role="status"` + `aria-live="polite"` para que un lector de
 * pantalla anuncie la carga, y `aria-busy` mientras dura. Las barras son
 * decorativas (`aria-hidden`).
 */
export function SectionLoading({
  label = "Cargando…",
  rows = 3,
  className = "",
}: {
  /** Que se esta cargando. Concreto: "Cargando hospitales…", no "Cargando…". */
  label?: string;
  /** Cuantas barras pintar. Aproxima la forma del contenido real. */
  rows?: number;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={`w-full px-4 py-6 ${className}`}
    >
      <p className="mb-4 flex items-center justify-center gap-2 text-sm text-[var(--etext2)]">
        <span
          aria-hidden
          className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--eborder)] border-t-[var(--etext2)]"
        />
        {label}
      </p>
      <ul aria-hidden className="mx-auto flex max-w-3xl flex-col gap-3">
        {Array.from({ length: rows }).map((_, i) => (
          <li key={i} className="e-m-skeleton" />
        ))}
      </ul>
    </div>
  );
}

/**
 * Estado de carga para un mapa: un bloque con proporcion de mapa, no una lista.
 */
export function MapLoading({ label = "Cargando mapa…" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex h-full min-h-[360px] w-full flex-col items-center justify-center gap-3 bg-[var(--esurf)]"
    >
      <span
        aria-hidden
        className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[var(--eborder)] border-t-[var(--etext2)]"
      />
      <p className="text-sm text-[var(--etext2)]">{label}</p>
    </div>
  );
}

/**
 * Estado VACIO, que es distinto de "cargando" y hay que decirlo distinto.
 *
 * Un directorio vacio porque todavia no se ha cargado el catalogo no es lo
 * mismo que un directorio vacio porque los filtros no casan con nada. Mezclar
 * los dos mensajes hace que la persona ajuste filtros que no son el problema.
 */
export function SectionEmpty({
  title,
  hint,
  className = "",
}: {
  title: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-dashed border-[var(--eborder)] bg-[var(--esurf)] px-5 py-8 text-center ${className}`}
    >
      <p className="text-sm font-semibold text-[var(--etext)]">{title}</p>
      {hint && <p className="mt-1 text-sm text-[var(--etext2)]">{hint}</p>}
    </div>
  );
}
