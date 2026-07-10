"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useEarthquakes } from "@/hooks/emergency";
import { useTick } from "@/hooks/useTick";
import { qk } from "@/lib/query-keys";
import { deploymentConfig } from "@/lib/deployment-config";
import { EarthquakeCard } from "./EarthquakeCard";

const USGS_MAP_URL = "https://earthquake.usgs.gov/earthquakes/map/";
const POLL_MS = 60_000;
const MIN_MAG_OPTIONS = [2, 3, 4, 5] as const;
const INITIAL_VISIBLE = 8;

export default function EarthquakesPanel() {
  const queryClient = useQueryClient();
  const { data: quakes, isLoading, isError } = useEarthquakes(POLL_MS);
  const [minMag, setMinMag] = useState<(typeof MIN_MAG_OPTIONS)[number]>(2);
  const [showAll, setShowAll] = useState(false);
  const now = useTick();

  const filtered = useMemo(
    () => (quakes ?? []).filter((q) => (q.magnitude ?? 0) >= minMag),
    [quakes, minMag],
  );
  const visible = showAll ? filtered : filtered.slice(0, INITIAL_VISIBLE);
  const hidden = filtered.length - visible.length;

  return (
    <section aria-labelledby="earthquakes-heading" className="e-m-section e-m-section--wash">
      <div className="e-m-section__inner max-w-3xl">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="e-m-section__head mb-0">
            <h2 id="earthquakes-heading" className="e-m-section__title">
              Sismos recientes
            </h2>
            <hr className="e-m-section__rule" />
            <p className="e-m-section__sub">
              Catálogo USGS de {deploymentConfig.regionLabel}, actualizado cada minuto.
            </p>
          </div>
          <div
            role="group"
            aria-label="Magnitud mínima"
            className="e-m-quake-panel__filters"
          >
            {MIN_MAG_OPTIONS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMinMag(m);
                  setShowAll(false);
                }}
                aria-pressed={minMag === m}
                className={`e-m-chip${minMag === m ? " e-m-chip--active" : ""}`}
              >
                {m}+
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <ul className="e-m-quake-list" aria-hidden>
            {Array.from({ length: 5 }).map((_, i) => (
              <li
                key={i}
                className="h-16 animate-pulse rounded-xl border border-[var(--m-gray-200)] bg-[var(--qi-white)]"
              />
            ))}
          </ul>
        ) : isError ? (
          <div className="e-m-hub-card">
            <p className="e-m-hub-card__title">No se pudieron cargar los sismos</p>
            <p className="e-m-hub-card__desc">
              Puede ser un problema temporal. También puedes consultar USGS.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  void queryClient.invalidateQueries({ queryKey: qk.earthquakes.list })
                }
                className="e-m-btn e-m-btn--primary e-m-btn--sm"
              >
                Reintentar
              </button>
              <a
                href={USGS_MAP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="e-m-link text-sm font-bold"
              >
                Ver en USGS
              </a>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--m-gray-500)]">
            Sin sismos de magnitud {minMag}+ en el catálogo reciente.
          </p>
        ) : (
          <>
            <ul className="e-m-quake-list">
              {visible.map((q) => (
                <EarthquakeCard key={q.id} quake={q} now={now} />
              ))}
            </ul>
            {hidden > 0 && (
              <button type="button" onClick={() => setShowAll(true)} className="e-m-quake-more">
                Ver más ({hidden})
              </button>
            )}
            <p className="mt-3 text-center text-xs text-[var(--m-gray-500)]">
              Fuente:{" "}
              <a href={USGS_MAP_URL} target="_blank" rel="noopener noreferrer" className="e-m-link">
                USGS
              </a>
            </p>
          </>
        )}
      </div>
    </section>
  );
}
