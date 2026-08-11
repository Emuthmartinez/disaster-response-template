"use client";

/**
 * Pestaña "Mascotas" del directorio. Espeja PersonsTab (búsqueda debounced,
 * paginación con prefetch de vecinas, poll adaptado al ancho de banda, estados
 * de carga honestos) sobre el dominio `pets`, que tiene sus PROPIOS endpoints y
 * su propia tabla: nada de lo que pase aquí puede alterar el conteo de personas.
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import { Search } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  PET_DEFAULT_LIST_PARAMS,
  PET_LIST_PAGE_SIZE,
  PET_SPECIES_OPTIONS,
  MIN_SEARCH_LEN,
  useMarkPetFound,
  usePetsList,
  usePetStats,
  usePrefetchPetsPages,
  type Pet,
} from "@/hooks/pets";
import { qk } from "@/lib/query-keys";
import { useLowBandwidthMode } from "@/hooks/useLowBandwidthMode";
import { useDirectoryHeaderStats } from "@/hooks/useDirectoryHeaderStats";
import { Pagination } from "@/components/ui/Pagination";
import { SectionLoading } from "@/components/ui/SectionLoading";
import { PetCard } from "./PetCard";
import { ZoneFilters, type PersonStatusFilter } from "./ZoneFilters";

const PetDetailModal = dynamic(
  () => import("@/components/features/pets/PetDetail"),
  { ssr: false },
);

const POLL_INTERVAL_MS = 8000;
const LOW_BANDWIDTH_POLL_INTERVAL_MS = 45_000;
const SEARCH_DEBOUNCE_MS = 350;

export type PetsTabHandle = {
  refresh: () => void;
};

export const PetsTab = forwardRef<PetsTabHandle>(function PetsTab(_props, ref) {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [filter, setFilter] = useState<PersonStatusFilter>(
    PET_DEFAULT_LIST_PARAMS.status as PersonStatusFilter,
  );
  const [species, setSpecies] = useState<string | null>(null);
  const [selected, setSelected] = useState<Pet | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const skipScrollRef = useRef(true);

  // pageSize FIJO, igual que en personas: es lo que permite que la queryKey del
  // servidor y la del cliente coincidan y la lista llegue ya en el HTML.
  const pageSize = PET_LIST_PAGE_SIZE;
  const network = useLowBandwidthMode(
    POLL_INTERVAL_MS,
    LOW_BANDWIDTH_POLL_INTERVAL_MS,
  );

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(query);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const search = debouncedQuery.trim();
  const listParams = {
    status: filter,
    page,
    pageSize,
    q: search.length >= MIN_SEARCH_LEN ? search : undefined,
    species: species ?? undefined,
  };
  const { data, isPending, isError } = usePetsList(listParams, network.pollIntervalMs);
  const stats = usePetStats();

  const pets = data?.pets ?? [];
  const totalPages = data?.totalPages ?? 1;
  // Los tres contadores salen de /api/pets/stats, NO del total de la lista: ese
  // total es el del FILTRO activo, así que con "Todas" seleccionado etiquetarlo
  // como "perdidas" daría "43 perdidas / 6 reunidas" sobre 43 en total — números
  // que no suman y que hacen dudar del resto de la página. El badge "reportadas"
  // tenía el mismo fallo: con "Reunidas" puesto anunciaba el nº de reunidas como
  // si fuera el total reportado. Lógica compartida con PersonsTab — ver
  // hooks/useDirectoryHeaderStats.ts.
  const {
    statsUnknown,
    reportedTotal,
    reportedLabel,
    activeLabel,
    foundLabel,
  } = useDirectoryHeaderStats(stats);

  const prefetchPetsPages = usePrefetchPetsPages();
  useEffect(() => {
    if (totalPages <= 1) return;
    prefetchPetsPages(listParams, totalPages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, page, pageSize, search, species, totalPages, prefetchPetsPages]);

  useEffect(() => {
    setPage(1);
  }, [pageSize, debouncedQuery, filter, species]);

  useEffect(() => {
    setPage((p) => Math.min(p, Math.max(1, totalPages)));
  }, [totalPages]);

  useImperativeHandle(
    ref,
    () => ({
      refresh() {
        setPage(1);
        void qc.invalidateQueries({ queryKey: qk.pets.all });
      },
    }),
    [qc],
  );

  useEffect(() => {
    if (skipScrollRef.current) {
      skipScrollRef.current = false;
      return;
    }
    gridRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [page]);

  const markFound = useMarkPetFound();
  const handleMarkFound = useCallback(
    async (
      id: string,
      payload: { note: string; photo: string | null; turnstileToken?: string },
    ) => {
      await markFound.mutateAsync({
        id,
        note: payload.note,
        photo: payload.photo,
        turnstileToken: payload.turnstileToken,
      });
      setSelected(null);
    },
    [markFound],
  );

  const isSearching = search.length >= MIN_SEARCH_LEN;
  const queryTooShort = search.length > 0 && search.length < MIN_SEARCH_LEN;

  return (
    <>
      <div className="e-m-directory__intro">
        <div className="e-m-person-head">
          <h2 className="e-m-section__title e-m-section__title--sm">Mascotas</h2>
          <span
            className="e-m-person-head__count"
            aria-label={
              statsUnknown
                ? "Cargando el número de mascotas reportadas"
                : `${reportedTotal} mascotas reportadas`
            }
          >
            {reportedLabel} reportadas
          </span>
        </div>
        <div className="e-m-person-stats">
          <span className="e-m-person-stats__item">
            <span
              className="e-m-person-stats__dot e-m-person-stats__dot--missing"
              aria-hidden
            />
            {activeLabel} perdidas
          </span>
          <span className="e-m-person-stats__item">
            <span
              className="e-m-person-stats__dot e-m-person-stats__dot--found"
              aria-hidden
            />
            {foundLabel} reunidas
          </span>
        </div>
        <p className="e-m-section__sub">
          Si reconoces a alguna, contacta a quien la reportó.
        </p>
      </div>

      <ZoneFilters filter={filter} onChange={setFilter} />

      <div className="e-m-person-toolbar" role="group" aria-label="Filtrar por especie">
        <button
          type="button"
          aria-pressed={species === null}
          onClick={() => setSpecies(null)}
          className={`e-m-chip${species === null ? " e-m-chip--active" : ""}`}
        >
          Todas
        </button>
        {PET_SPECIES_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={species === option.value}
            onClick={() => setSpecies(species === option.value ? null : option.value)}
            className={`e-m-chip${species === option.value ? " e-m-chip--active" : ""}`}
          >
            <span aria-hidden>{option.icon}</span> {option.label}
          </button>
        ))}
      </div>

      <div className="e-m-person-search">
        <label htmlFor="mascotas-directory-search" className="sr-only">
          Buscar mascotas
        </label>
        <div className="e-m-person-search__field">
          <Search size={16} strokeWidth={2} aria-hidden />
          <input
            id="mascotas-directory-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre, raza, color o zona…"
            autoComplete="off"
            enterKeyHint="search"
          />
        </div>
        {queryTooShort && (
          <p className="mt-1.5 text-xs text-[var(--m-gray-500)]">
            Escribe al menos {MIN_SEARCH_LEN} letras para buscar.
          </p>
        )}
      </div>

      <div ref={gridRef} className="e-m-person-grid" role="list">
        {/* "Cargando" y "vacío" NO son el mismo estado: pintar "aún no hay
            reportes" con la respuesta en vuelo afirma algo falso. */}
        {isPending ? (
          <SectionLoading
            label="Cargando mascotas reportadas…"
            rows={3}
            className="col-span-full"
          />
        ) : isError ? (
          // "Falló la petición" y "no hay reportes" NO son lo mismo. Sin esta
          // rama, un error de la API se pinta como "Aún no hay reportes", que
          // afirma algo falso: alguien buscando a su mascota concluiría que su
          // reporte se perdió. Pasa de verdad en la ventana entre desplegar el
          // backend y correr la migración, cuando /api/pets todavía da 500.
          <div className="e-m-person-empty" role="listitem">
            <p className="e-m-person-empty__title">No pudimos cargar las mascotas</p>
            <p className="e-m-person-empty__desc">
              Es un problema nuestro, no tuyo: los reportes siguen guardados.
              Reintentamos solos en unos segundos.
            </p>
          </div>
        ) : pets.length === 0 ? (
          <div className="e-m-person-empty" role="listitem">
            <p className="e-m-person-empty__title">
              {isSearching ? "No encontramos coincidencias" : "Aún no hay reportes"}
            </p>
            <p className="e-m-person-empty__desc">
              {isSearching
                ? "Prueba con otra raza, color o zona."
                : "Sé el primero en reportar una mascota perdida o encontrada."}
            </p>
          </div>
        ) : (
          pets.map((pet) => (
            <PetCard key={pet.id} pet={pet} onOpen={() => setSelected(pet)} />
          ))
        )}
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        ariaLabel="Paginación del directorio de mascotas"
      />
      {totalPages > 1 && (
        <p className="mt-2 text-center text-xs text-[var(--m-gray-500)]">
          Página {page.toLocaleString("es")} de {totalPages.toLocaleString("es")}
        </p>
      )}

      {selected && (
        <PetDetailModal
          pet={selected}
          pets={pets}
          onNavigate={setSelected}
          onClose={() => setSelected(null)}
          onMarkFound={(payload) => handleMarkFound(selected.id, payload)}
        />
      )}
    </>
  );
});
