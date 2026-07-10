"use client";

import { memo } from "react";

/**
 * Chip de filtro presentacional con icono coloreado, contador y tooltip.
 * Markup verbatim del filtro de capas del mapa de EmergencyApp. Genérico:
 * recibe icono/color/contador/etiquetas por props.
 */
export interface ChipFilterProps {
  active: boolean;
  onClick: () => void;
  icon: string;
  color: string;
  count: number;
  shortLabel: string;
  label: string;
  description: string;
  ariaLabel: string;
}

function ChipFilterImpl({
  active,
  onClick,
  icon,
  color,
  count,
  shortLabel,
  label,
  description,
  ariaLabel,
}: ChipFilterProps) {
  return (
    <div className="e-map-type-chip-wrap group relative shrink-0">
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        aria-label={ariaLabel}
        className={`e-map-type-chip flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-semibold shadow-sm backdrop-blur transition ${
          active
            ? "is-active border-transparent bg-slate-900 text-white"
            : "border-slate-200 bg-white/90 text-slate-400 hover:text-slate-600"
        }`}
      >
        <span
          className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] leading-none text-white transition ${
            active ? "" : "opacity-35 grayscale"
          }`}
          style={{ background: color }}
          aria-hidden
        >
          {icon}
        </span>
        <span className="tabular-nums">{count.toLocaleString("es")}</span>
        <span>{shortLabel}</span>
      </button>
      <span
        role="tooltip"
        className="e-map-type-tip pointer-events-none absolute left-1/2 top-full z-[1300] mt-2 w-60 max-w-[70vw] rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-medium leading-snug text-white shadow-xl"
      >
        <span className="font-bold">{label}.</span> {description}
      </span>
    </div>
  );
}

export const ChipFilter = memo(ChipFilterImpl);
export default ChipFilter;
