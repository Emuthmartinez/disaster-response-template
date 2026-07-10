"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ACOPIO_DEFAULT_FILTERS,
  isModuleDisabledError,
  useCollectionCenters,
  type CollectionCenter,
} from "@/hooks/acopio";
import { RESPONSEGRID_EMERGENCY_URL } from "@/lib/responsegrid";

const CATEGORY_LABELS: Record<string, string> = {
  food: "Alimentos",
  water: "Agua",
  medicines: "Medicinas",
  medical_supplies: "Insumos médicos",
  clothing: "Ropa",
  shelter: "Refugio",
  hygiene: "Higiene",
};

function categoryLabel(key: string): string {
  return CATEGORY_LABELS[key] ?? key;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  saturated: { label: "Saturado", cls: "e-m-badge e-m-badge--warning" },
  paused: { label: "En pausa", cls: "e-m-badge e-m-badge--muted" },
  closed: { label: "Cerrado", cls: "e-m-badge e-m-badge--danger" },
};

const PAGE_SIZE = 24;
const SEARCH_DEBOUNCE_MS = 300;
const DEFAULT_COUNTRY = ACOPIO_DEFAULT_FILTERS.country ?? "";

function locationLabel(center: CollectionCenter): string {
  return [center.city, center.country].filter(Boolean).join(" · ");
}

function linkifyContact(text: string): ReactNode[] {
  return text.split(/(\s+)/).map((token, i) => {
    if (/^https?:\/\//i.test(token)) {
      return (
        <a key={i} href={token} target="_blank" rel="noopener noreferrer" className="e-m-link">
          {token}
        </a>
      );
    }
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(token)) {
      return (
        <a key={i} href={`mailto:${token}`} className="e-m-link">
          {token}
        </a>
      );
    }
    return <span key={i}>{token}</span>;
  });
}

interface FilterChipProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}

function FilterChip({ active, onClick, children }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={active ? "e-m-chip e-m-chip--active" : "e-m-chip"}
    >
      {children}
    </button>
  );
}

export default function CollectionCenters() {
  const [country, setCountry] = useState<string>(DEFAULT_COUNTRY);
  const [category, setCategory] = useState<string>("");
  const [rawQuery, setRawQuery] = useState("");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE_SIZE);

  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(rawQuery.trim());
      setShown(PAGE_SIZE);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [rawQuery]);

  function selectCountry(value: string) {
    setCountry(value);
    setShown(PAGE_SIZE);
  }
  function selectCategory(value: string) {
    setCategory(value);
    setShown(PAGE_SIZE);
  }

  const filters = useMemo(
    () => ({
      country: country || undefined,
      category: category || undefined,
      q: query || undefined,
    }),
    [country, category, query],
  );

  const { data, isLoading, isError, error, isFetching, refetch } =
    useCollectionCenters(filters);
  const moduleDisabled = isModuleDisabledError(error);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const facets = data?.facets ?? { byCountry: {}, byCategory: {} };

  const countryChips = useMemo(
    () => Object.entries(facets.byCountry).sort((a, b) => b[1] - a[1]),
    [facets.byCountry],
  );
  const categoryChips = useMemo(
    () => Object.entries(facets.byCategory).sort((a, b) => b[1] - a[1]),
    [facets.byCategory],
  );

  const visible = items.slice(0, shown);

  function clearFilters() {
    setCountry("");
    setCategory("");
    setRawQuery("");
    setQuery("");
    setShown(PAGE_SIZE);
  }

  return (
    <section id="centros-acopio" className="e-m-section e-m-section--wash">
      <div className="e-m-section__inner">
        <header className="e-m-section__head">
          <span className="e-m-kicker">ResponseGrid · acopio</span>
          <h1 className="e-m-section__title flex flex-wrap items-center gap-2">
            Centros de acopio
            {!isLoading && (
              <span className="e-m-eyebrow">{total} {total === 1 ? "punto" : "puntos"}</span>
            )}
          </h1>
          <hr className="e-m-section__rule" />
          <p className="e-m-rg-intro" style={{ marginTop: 16 }}>
            Lugares verificados donde puedes llevar donaciones físicas para quienes
            fueron afectados por el terremoto. Revisa qué reciben antes de ir.
          </p>
        </header>

        <div className="e-m-input-wrap">
          <span className="e-m-input-wrap__icon" aria-hidden>
            🔎
          </span>
          <input
            type="search"
            value={rawQuery}
            onChange={(e) => setRawQuery(e.target.value)}
            placeholder="Busca por organización, ciudad o dirección…"
            aria-label="Buscar centro de acopio"
            className="e-m-input"
          />
        </div>

        {countryChips.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <p className="e-m-filter-label">País</p>
            <div className="flex flex-wrap gap-1.5">
              <FilterChip active={!country} onClick={() => selectCountry("")}>
                Todos
              </FilterChip>
              {countryChips.map(([name, count]) => (
                <FilterChip
                  key={name}
                  active={country === name}
                  onClick={() => selectCountry(name)}
                >
                  {name} ({count})
                </FilterChip>
              ))}
            </div>
          </div>
        )}

        {categoryChips.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <p className="e-m-filter-label">Reciben</p>
            <div className="flex flex-wrap gap-1.5">
              <FilterChip active={!category} onClick={() => selectCategory("")}>
                Todas
              </FilterChip>
              {categoryChips.map(([key, count]) => (
                <FilterChip
                  key={key}
                  active={category === key}
                  onClick={() => selectCategory(key)}
                >
                  {categoryLabel(key)} ({count})
                </FilterChip>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: 24 }}>
          {isLoading ? (
            <ul className="e-m-card-grid">
              {Array.from({ length: 6 }).map((_, i) => (
                <li key={i} className="e-m-skeleton" style={{ height: 176 }} />
              ))}
            </ul>
          ) : moduleDisabled ? (
            <p className="e-m-rg-meta">
              El directorio de centros de acopio no está disponible en este
              deployment.
            </p>
          ) : isError ? (
            <div className="e-m-alert-error">
              No pudimos cargar los centros de acopio en este momento.{" "}
              <button type="button" onClick={() => refetch()} className="e-m-link">
                Reintentar
              </button>
            </div>
          ) : items.length === 0 ? (
            <p className="e-m-rg-meta">
              No encontramos centros con esos filtros.{" "}
              <button type="button" onClick={clearFilters} className="e-m-link">
                Limpiar filtros
              </button>
            </p>
          ) : (
            <>
              <ul className="e-m-card-grid">
                {visible.map((center) => {
                  const status = STATUS_META[center.status];
                  return (
                    <li key={center.id} className="e-m-center-card">
                      <div className="flex items-start justify-between gap-2">
                        <p className="e-m-center-card__location">
                          {locationLabel(center) || "Ubicación no indicada"}
                        </p>
                        <div className="flex shrink-0 flex-wrap justify-end gap-1">
                          <span
                            className={
                              center.verificationLevel === "official"
                                ? "e-m-badge e-m-badge--official"
                                : "e-m-badge e-m-badge--verified"
                            }
                          >
                            {center.verificationLevel === "official"
                              ? "✓ Oficial"
                              : "✓ Verificado"}
                          </span>
                          {status && <span className={status.cls}>{status.label}</span>}
                        </div>
                      </div>

                      <h3 className="e-m-center-card__title">{center.name}</h3>
                      {center.manager && (
                        <p className="e-m-center-card__meta">{center.manager}</p>
                      )}

                      {center.address && (
                        <p className="e-m-center-card__body">📍 {center.address}</p>
                      )}

                      {center.schedule && (
                        <p className="e-m-center-card__meta" style={{ marginTop: 8 }}>
                          🕐 {center.schedule}
                        </p>
                      )}

                      {center.accepts.length > 0 && (
                        <div style={{ marginTop: 12 }}>
                          <p className="e-m-filter-label">Reciben</p>
                          <ul className="mt-1.5 flex flex-wrap gap-1.5">
                            {center.accepts.map((item) => (
                              <li key={item} className="e-m-tag">
                                {categoryLabel(item)}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {center.contact && (
                        <p className="e-m-center-card__meta mt-3 break-words">
                          📞 {linkifyContact(center.contact)}
                        </p>
                      )}

                      {center.disputed && (
                        <p className="e-m-note e-m-note--warning mt-2">
                          ⚠️ Información en revisión.
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>

              {items.length > shown && (
                <div className="mt-6 text-center">
                  <button
                    type="button"
                    onClick={() => setShown((s) => s + PAGE_SIZE)}
                    className="e-m-btn e-m-btn--primary"
                  >
                    Ver más ({items.length - shown} restantes)
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <p className="e-m-note e-m-note--info">
            💚 Si conoces otro punto de acopio activo, repórtalo en el mapa con el
            marcador <strong>Centro de Acopio</strong> para que más personas puedan
            donar.
          </p>
          <p className="e-m-note e-m-note--warning">
            ⚠️ Verifica horarios y disponibilidad antes de desplazarte. La información
            proviene de convocatorias ciudadanas y puede cambiar.
          </p>
        </div>

        <p className="e-m-rg-foot mt-6">
          Datos:{" "}
          {RESPONSEGRID_EMERGENCY_URL ? (
            <a
              href={RESPONSEGRID_EMERGENCY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="e-m-link"
            >
              ResponseGrid
            </a>
          ) : (
            "ResponseGrid"
          )}{" "}
          / Global Emergency ·{" "}
          <a
            href="https://creativecommons.org/licenses/by-sa/4.0/"
            target="_blank"
            rel="noopener noreferrer"
            className="e-m-link"
          >
            CC BY-SA 4.0
          </a>
          {isFetching && !isLoading ? " · actualizando…" : ""}
        </p>
      </div>
    </section>
  );
}
