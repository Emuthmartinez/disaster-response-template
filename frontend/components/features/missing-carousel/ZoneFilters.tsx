"use client";

export type PersonStatusFilter = "all" | "active" | "found";

interface ZoneFiltersProps {
  filter: PersonStatusFilter;
  onChange: (filter: PersonStatusFilter) => void;
}

export function ZoneFilters({ filter, onChange }: ZoneFiltersProps) {
  return (
    <div className="e-m-person-toolbar" role="group" aria-label="Filtrar personas">
      <button
        type="button"
        aria-pressed={filter === "all"}
        onClick={() => onChange("all")}
        className={`e-m-chip${filter === "all" ? " e-m-chip--active" : ""}`}
      >
        Todas
      </button>
      <button
        type="button"
        aria-pressed={filter === "active"}
        onClick={() => onChange("active")}
        className={`e-m-chip e-m-chip--filter-missing${filter === "active" ? " e-m-chip--active" : ""}`}
      >
        <span className="e-m-person-stats__dot e-m-person-stats__dot--missing" aria-hidden />
        Desaparecidas
      </button>
      <button
        type="button"
        aria-pressed={filter === "found"}
        onClick={() => onChange("found")}
        className={`e-m-chip e-m-chip--filter-found${filter === "found" ? " e-m-chip--active" : ""}`}
      >
        <span className="e-m-person-stats__dot e-m-person-stats__dot--found" aria-hidden />
        Encontradas
      </button>
    </div>
  );
}
