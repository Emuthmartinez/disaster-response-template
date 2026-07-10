"use client";

import { memo } from "react";

/**
 * Input de búsqueda presentacional (sin datos). Markup verbatim del que vivía en
 * EmergencyApp: caja con lupa, botón de limpiar y placeholder. Reutilizable.
 */
export interface SearchInputProps {
  value: string;
  /** Cambio de valor. Alias: `onValueChange` (mismo callback). */
  onChange?: (value: string) => void;
  /** Alias de `onChange` usado por algunos consumidores. */
  onValueChange?: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  /** Alias DOM de `ariaLabel`. */
  "aria-label"?: string;
  /** Etiqueta visible opcional (se asocia al input por `id`). */
  label?: string;
  /** id del input (necesario si se usa `label`). */
  id?: string;
  /** Clases extra para el contenedor. */
  className?: string;
  autoComplete?: string;
}

function SearchInputImpl({
  value,
  onChange,
  onValueChange,
  placeholder = "Buscar…",
  ariaLabel = "Buscar",
  "aria-label": ariaLabelDom,
  label,
  id,
  className,
  autoComplete,
}: SearchInputProps) {
  const emit = onChange ?? onValueChange ?? (() => {});
  return (
    <div
      className={`flex flex-1 items-center gap-2 rounded-xl border border-[var(--eborder)] bg-[var(--einput)] px-3 py-1.5${
        className ? ` ${className}` : ""
      }`}
    >
      {label && (
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
      )}
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
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        type="search"
        id={id}
        value={value}
        onChange={(e) => emit(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabelDom ?? ariaLabel}
        autoComplete={autoComplete}
        enterKeyHint="search"
        className="min-w-0 flex-1 bg-transparent py-1 text-sm text-[var(--etext)] outline-none placeholder:text-[var(--etext3)]"
      />
      {value && (
        <button
          type="button"
          onClick={() => emit("")}
          aria-label="Limpiar búsqueda"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        >
          ×
        </button>
      )}
    </div>
  );
}

export const SearchInput = memo(SearchInputImpl);
export default SearchInput;
