"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Search } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useMarkFound,
  useMissingList,
  useMissingStats,
  usePrefetchMissingPages,
  type MissingPerson,
} from "@/hooks/missing";
import { qk } from "@/lib/query-keys";
import { useLowBandwidthMode } from "@/hooks/useLowBandwidthMode";
import { Pagination } from "@/components/ui/Pagination";
import { MissingPersonCard } from "./MissingPersonCard";
import { ZoneFilters, type PersonStatusFilter } from "./ZoneFilters";
import { useHospitalGridColumns } from "./useHospitalGridColumns";

const DetailModal = dynamic(
  () => import("@/components/features/missing/MissingPersonDetail"),
  { ssr: false },
);

const POLL_INTERVAL_MS = 8000;
const LOW_BANDWIDTH_POLL_INTERVAL_MS = 45_000;
const MIN_SEARCH_LEN = 3;
const SEARCH_DEBOUNCE_MS = 350;

export type PersonsTabHandle = {
  refresh: () => void;
};

export const PersonsTab = forwardRef<PersonsTabHandle>(function PersonsTab(
  _props,
  ref,
) {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [filter, setFilter] = useState<PersonStatusFilter>("all");
  const [selected, setSelected] = useState<MissingPerson | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const skipScrollRef = useRef(true);

  const gridCols = useHospitalGridColumns(4);
  const pageSize = gridCols * (gridCols === 1 ? 4 : 2);
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
  };
  const { data } = useMissingList(listParams, network.pollIntervalMs);
  const stats = useMissingStats();

  const people = data?.people ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const foundTotal = stats.data?.found ?? 0;

  const prefetchMissingPages = usePrefetchMissingPages();
  useEffect(() => {
    if (totalPages <= 1) return;
    prefetchMissingPages(listParams, totalPages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, page, pageSize, search, totalPages, prefetchMissingPages]);

  useEffect(() => {
    setPage(1);
  }, [pageSize, debouncedQuery, filter]);

  useEffect(() => {
    setPage((p) => Math.min(p, Math.max(1, totalPages)));
  }, [totalPages]);

  useImperativeHandle(
    ref,
    () => ({
      refresh() {
        setPage(1);
        void qc.invalidateQueries({ queryKey: qk.missing.all });
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

  const markFound = useMarkFound();
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
          <h2 className="e-m-section__title e-m-section__title--sm">Personas</h2>
          <span className="e-m-person-head__count" aria-label={`${total} personas reportadas`}>
            {total.toLocaleString("es")} reportadas
          </span>
        </div>
        <div className="e-m-person-stats">
          <span className="e-m-person-stats__item">
            <span className="e-m-person-stats__dot e-m-person-stats__dot--missing" aria-hidden />
            {total.toLocaleString("es")} desaparecidas
          </span>
          <span className="e-m-person-stats__item">
            <span className="e-m-person-stats__dot e-m-person-stats__dot--found" aria-hidden />
            {foundTotal.toLocaleString("es")} encontradas
          </span>
        </div>
        <p className="e-m-section__sub">
          Si reconoces a alguien, contacta a quien la reportó.
        </p>
      </div>

      <ZoneFilters filter={filter} onChange={setFilter} />

      <div className="e-m-person-search">
        <label htmlFor="personas-directory-search" className="sr-only">
          Buscar personas
        </label>
        <div className="e-m-person-search__field">
          <Search size={16} strokeWidth={2} aria-hidden />
          <input
            id="personas-directory-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre, zona o descripción…"
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
        {people.length === 0 ? (
          <div className="e-m-person-empty" role="listitem">
            <p className="e-m-person-empty__title">
              {isSearching ? "No encontramos coincidencias" : "Aún no hay reportes"}
            </p>
            <p className="e-m-person-empty__desc">
              {isSearching
                ? "Prueba con otro nombre o zona."
                : "Sé el primero en compartir información para localizar a alguien."}
            </p>
          </div>
        ) : (
          people.map((person) => (
            <MissingPersonCard
              key={person.id}
              person={person}
              onOpen={() => setSelected(person)}
            />
          ))
        )}
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        ariaLabel="Paginación del directorio de personas"
      />
      {totalPages > 1 && (
        <p className="mt-2 text-center text-xs text-[var(--m-gray-500)]">
          Página {page.toLocaleString("es")} de {totalPages.toLocaleString("es")}
        </p>
      )}

      {selected && (
        <DetailModal
          person={selected}
          people={people}
          onNavigate={setSelected}
          onClose={() => setSelected(null)}
          onMarkFound={(payload) => handleMarkFound(selected.id, payload)}
        />
      )}
    </>
  );
});
