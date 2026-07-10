"use client";

import Link from "next/link";
import {
  FACILITY_TYPE_META,
  HOSPITAL_SUPPLY_STATUS_META,
  PRIORITY_ZONE_META,
  type Hospital,
  type HospitalPriorityZone,
  type PublicHospitalSupplySummary,
} from "@/lib/hospitals-meta";

export const HOSPITAL_ZONE_FILTERS: {
  value: HospitalPriorityZone | "all";
  label: string;
}[] = [
  { value: "all", label: "Todas" },
  { value: "P0", label: "Zona cero" },
  { value: "P1", label: "Corredor" },
  { value: "P2", label: "Recuperación" },
  { value: "P3", label: "Base nacional" },
];

export function computeHospitalStats(hospitals: Hospital[]) {
  const byZone = { P0: 0, P1: 0, P2: 0, P3: 0 } as Record<
    HospitalPriorityZone,
    number
  >;
  let activePatients = 0;
  for (const h of hospitals) {
    byZone[h.priorityZone]++;
    activePatients += h.activePatients;
  }
  return { byZone, activePatients, total: hospitals.length };
}

export function filterHospitals(
  hospitals: Hospital[],
  search: string,
  zoneFilter: HospitalPriorityZone | "all",
): Hospital[] {
  const q = search.trim().toLowerCase();
  return hospitals.filter((h) => {
    if (zoneFilter !== "all" && h.priorityZone !== zoneFilter) return false;
    if (!q) return true;
    return (
      h.name.toLowerCase().includes(q) ||
      h.municipality.toLowerCase().includes(q) ||
      h.address.toLowerCase().includes(q) ||
      h.state.toLowerCase().includes(q)
    );
  });
}

export function HospitalStatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="e-hospital-stat">
      <p className="e-hospital-stat__label">{label}</p>
      <p className="e-hospital-stat__value" style={{ color: accent }}>
        {value.toLocaleString("es")}
      </p>
    </div>
  );
}

export function HospitalStatsRow({ hospitals }: { hospitals: Hospital[] }) {
  const stats = computeHospitalStats(hospitals);
  return (
    <div className="e-hospital-stats">
      <HospitalStatCard label="Total" value={stats.total} accent="var(--etext)" />
      {(Object.keys(PRIORITY_ZONE_META) as HospitalPriorityZone[]).map(
        (zone) => (
          <HospitalStatCard
            key={zone}
            label={`${PRIORITY_ZONE_META[zone].emoji} ${PRIORITY_ZONE_META[zone].label}`}
            value={stats.byZone[zone]}
            accent={PRIORITY_ZONE_META[zone].color}
          />
        ),
      )}
      <HospitalStatCard
        label="Hospitalizados"
        value={stats.activePatients}
        accent="#1d4ed8"
      />
    </div>
  );
}

export function HospitalZoneFilters({
  zoneFilter,
  onZoneFilterChange,
}: {
  zoneFilter: HospitalPriorityZone | "all";
  onZoneFilterChange: (zone: HospitalPriorityZone | "all") => void;
}) {
  return (
    <div className="e-hospital-filters">
      {HOSPITAL_ZONE_FILTERS.map((f) => {
        const active = zoneFilter === f.value;
        const color =
          f.value !== "all" ? PRIORITY_ZONE_META[f.value].color : "#c41a1a";
        return (
          <button
            key={f.value}
            type="button"
            onClick={() => onZoneFilterChange(f.value)}
            aria-pressed={active}
            className={`e-hospital-filter${active ? " is-active" : ""}`}
            style={active ? { background: color, borderColor: color } : undefined}
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );
}

export function HospitalCard({
  hospital,
  href,
  onOpen,
}: {
  hospital: Hospital;
  href?: string;
  onOpen?: () => void;
}) {
  const zone = PRIORITY_ZONE_META[hospital.priorityZone];
  const facility = FACILITY_TYPE_META[hospital.facilityType];

  const content = (
    <>
      <div className="e-hospital-card__tags">
        <span
          className="e-hospital-card__zone"
          style={{ background: zone.color }}
        >
          {hospital.priorityZone}
        </span>
        <span className="e-hospital-card__tag">
          {facility.emoji} {facility.label}
        </span>
        {hospital.level && (
          <span className="e-hospital-card__tag">
            Nivel {hospital.level}
          </span>
        )}
      </div>

      <div>
        <p className="e-hospital-card__name">{hospital.name}</p>
        <p className="e-hospital-card__location">
          {hospital.state}
          {hospital.municipality ? ` · ${hospital.municipality}` : ""}
        </p>
      </div>

      {hospital.address && (
        <p className="e-hospital-card__address">📍 {hospital.address}</p>
      )}

      {hospital.supplySummary && (
        <HospitalSupplySummaryStrip summary={hospital.supplySummary} />
      )}

      <div className="e-hospital-card__footer">
        <span className="e-hospital-card__beds">
          <span aria-hidden>🛏️</span>
          <strong>{hospital.activePatients.toLocaleString("es")}</strong>
          hospitalizados
        </span>
        <span className="e-hospital-card__cta">Ver →</span>
      </div>
    </>
  );

  const className = "e-hospital-card group";
  const style = { borderLeftColor: zone.color };

  if (href) {
    return (
      <Link href={href} className={className} style={style} role="listitem">
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onOpen} className={className} style={style}>
      {content}
    </button>
  );
}

function HospitalSupplySummaryStrip({
  summary,
}: {
  summary: PublicHospitalSupplySummary;
}) {
  const urgentStatuses = summary.statuses
    .filter((status) => status.status === "red" || status.status === "yellow")
    .slice(0, 3);
  const staleCount = summary.counts.stale;
  const activeNeeds = summary.counts.activeNeeds;

  if (urgentStatuses.length === 0 && staleCount === 0 && activeNeeds === 0) {
    return null;
  }

  return (
    <div className="e-hospital-card__supply" aria-label="Resumen de insumos">
      <div className="e-hospital-card__supply-tags">
        {urgentStatuses.map((status) => (
          <span
            key={status.category}
            className="e-hospital-card__supply-tag"
            style={{ color: HOSPITAL_SUPPLY_STATUS_META[status.status].color }}
          >
            <span
              className="e-hospital-card__supply-dot"
              style={{
                background: HOSPITAL_SUPPLY_STATUS_META[status.status].color,
              }}
              aria-hidden
            />
            {status.label}
          </span>
        ))}
        {activeNeeds > 0 && (
          <span className="e-hospital-card__supply-tag">
            {activeNeeds} necesidad{activeNeeds === 1 ? "" : "es"}
          </span>
        )}
        {staleCount > 0 && (
          <span className="e-hospital-card__supply-tag is-stale">
            {staleCount} stale
          </span>
        )}
      </div>
    </div>
  );
}
