"use client";

import { useEffect, useRef, useState } from "react";
import { useGeocodeSearch, type GeocodeResult } from "@/hooks/geocode";
import { deploymentConfig } from "@/lib/deployment-config";

export type { GeocodeResult };

interface AddressSearchProps {
  onSelect: (result: GeocodeResult) => void;
  /** Punto de referencia para priorizar resultados cercanos a la zona afectada. */
  bias?: { lat: number; lng: number };
}

export default function AddressSearch({ onSelect, bias }: AddressSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const geocode = useGeocodeSearch();
  const loading = geocode.isPending;

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (q.length < 3) {
      setError("Escribe al menos 3 caracteres.");
      return;
    }
    setError(null);
    try {
      const data = await geocode.mutateAsync({ q, bias });
      const found = data.results ?? [];
      setResults(found);
      setOpen(true);
      if (found.length === 0) {
        setError(`No se encontró esa dirección en ${deploymentConfig.regionLabel}.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al buscar.");
    }
  }

  function choose(result: GeocodeResult) {
    onSelect(result);
    setOpen(false);
    setResults([]);
    setQuery(result.label.split(",").slice(0, 2).join(", "));
  }

  function useMyLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Tu dispositivo no permite compartir la ubicación.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        setOpen(false);
        setResults([]);
        setQuery("Mi ubicación actual");
        onSelect({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          label: "Mi ubicación actual",
        });
      },
      (err) => {
        setLocating(false);
        const message =
          err.code === err.PERMISSION_DENIED
            ? "Permiso denegado. Activa la ubicación para usar esta opción."
            : err.code === err.TIMEOUT
              ? "Tardó demasiado en obtener tu ubicación. Inténtalo de nuevo."
              : "No se pudo obtener tu ubicación.";
        setError(message);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <form
        onSubmit={search}
        className="flex items-center gap-1 rounded-full border border-slate-200 bg-white py-1 pl-3 pr-1 shadow-lg ring-1 ring-black/5"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="pointer-events-none h-4 w-4 shrink-0 text-slate-400"
          aria-hidden
        >
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Buscar dirección o zona…"
          aria-label="Buscar dirección"
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-sm outline-none placeholder:text-slate-400"
        />
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          title="Usar mi ubicación actual"
          aria-label="Usar mi ubicación actual"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-base text-slate-600 transition hover:bg-slate-100 disabled:opacity-60"
        >
          {locating ? (
            <span className="text-xs font-semibold">…</span>
          ) : (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-[18px] w-[18px]"
              aria-hidden
            >
              <line x1="12" y1="2" x2="12" y2="5" />
              <line x1="12" y1="19" x2="12" y2="22" />
              <line x1="2" y1="12" x2="5" y2="12" />
              <line x1="19" y1="12" x2="22" y2="12" />
              <circle cx="12" cy="12" r="7" />
              <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
            </svg>
          )}
        </button>
        <button
          type="submit"
          disabled={loading || query.trim().length === 0}
          aria-label="Buscar dirección"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-900 text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          {loading ? (
            <span className="text-xs font-semibold">…</span>
          ) : (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-[18px] w-[18px]"
              aria-hidden
            >
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          )}
        </button>
      </form>

      {error && (
        <p className="mt-1 rounded-lg bg-white/95 px-2 py-1 text-xs text-red-600 shadow-sm">
          {error}
        </p>
      )}

      {open && results.length > 0 && (
        <ul className="absolute z-[1200] mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {results.map((result, index) => (
            <li key={`${result.lat}-${result.lng}-${index}`}>
              <button
                type="button"
                onClick={() => choose(result)}
                className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                {result.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
