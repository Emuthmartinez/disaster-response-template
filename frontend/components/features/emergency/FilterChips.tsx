"use client";

import { memo } from "react";
import {
  MAP_REPORT_TYPE_KEYS,
  REPORT_TYPES,
  type ReportType,
} from "@/lib/types";
import ChipFilter from "@/components/ui/ChipFilter";

/** Etiquetas cortas para los chips de filtro; el label completo va en
 * `REPORT_TYPES[type].label` y se expone via title/aria-label. */
const REPORT_TYPE_SHORT: Record<ReportType, string> = {
  critical: "Crítica",
  supplies: "Suministros",
  shelter: "Acopio",
  nopower: "Sin luz",
  missing: "Buscan",
  building: "Edificios",
  starlink: "Starlink",
};

export interface FilterChipsProps {
  selectedTypes: Set<ReportType>;
  counts: Record<ReportType, number>;
  onChipClick: (type: ReportType) => void;
}

function FilterChipsImpl({ selectedTypes, counts, onChipClick }: FilterChipsProps) {
  return (
    <div
      className="e-map-type-filters flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0"
      role="group"
      aria-label="Filtrar capas del mapa por tipo"
    >
      {MAP_REPORT_TYPE_KEYS.map((type) => {
        const meta = REPORT_TYPES[type];
        const active = selectedTypes.has(type);
        return (
          <ChipFilter
            key={type}
            active={active}
            onClick={() => onChipClick(type)}
            icon={meta.icon}
            color={meta.color}
            count={counts[type]}
            shortLabel={REPORT_TYPE_SHORT[type]}
            label={meta.label}
            description={meta.description}
            ariaLabel={`${meta.label}: ${counts[type]} reportes. ${
              active
                ? "Visible en el mapa, toca para ocultar."
                : "Oculto en el mapa, toca para mostrar."
            }`}
          />
        );
      })}
    </div>
  );
}

export const FilterChips = memo(FilterChipsImpl);
export default FilterChips;
