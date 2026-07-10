"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import {
  HOSPITAL_SUPPLY_CATEGORY_META,
  HOSPITAL_SUPPLY_NEED_STATUS_META,
  HOSPITAL_SUPPLY_STATUS_META,
  PATIENT_CONDITION_META,
  PATIENT_STATUS_META,
  type Hospital,
  type HospitalPatient,
  type PublicHospitalSupplyNeed,
  type PublicHospitalSupplyStatus,
  type PublicHospitalSupplySummary,
} from "@/lib/hospitals-meta";
import { formatLocaleNumber, timeAgo } from "@/lib/format";
import { qk } from "@/lib/query-keys";
import {
  useHospitalPatients,
  useHospitalSupplies,
} from "@/hooks/hospitals";
import { useTick } from "@/hooks/useTick";
import PatientDetailOverlay from "@/components/features/hospitals/PatientDetailOverlay";

const ADMIN_STORAGE_KEY = "emergency:adminToken";
const HOSPITAL_DETAIL_POLL_MS = 30_000;

interface Props {
  hospital: Hospital;
  initialPatients: HospitalPatient[];
  initialSupply?: PublicHospitalSupplySummary;
}

export default function HospitalDetailView({
  hospital: initialHospital,
  initialPatients,
  initialSupply,
}: Props) {
  const queryClient = useQueryClient();
  const now = useTick();
  const {
    data: patientsData,
    error: patientsError,
    isFetching: refreshingPatients,
    refetch: refetchPatients,
  } = useHospitalPatients(initialHospital.id, {
    initial: { patients: initialPatients, hospital: initialHospital },
    pollMs: HOSPITAL_DETAIL_POLL_MS,
  });
  const {
    data: suppliesData,
    error: suppliesError,
    isFetching: refreshingSupplies,
    refetch: refetchSupplies,
  } = useHospitalSupplies(initialHospital.id, {
    initial: initialSupply ?? initialHospital.supplySummary ?? null,
    pollMs: HOSPITAL_DETAIL_POLL_MS,
  });

  const hospital = patientsData?.hospital ?? initialHospital;
  const patients = useMemo(
    () => patientsData?.patients ?? initialPatients,
    [initialPatients, patientsData?.patients],
  );
  const supply = suppliesData?.supply ?? null;
  const [search, setSearch] = useState("");
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<HospitalPatient | null>(
    null,
  );
  const refreshing = refreshingPatients || refreshingSupplies;
  const error = patientsError
    ? patientsError instanceof Error
      ? patientsError.message
      : "No se pudieron cargar los pacientes."
    : suppliesError
      ? suppliesError instanceof Error
        ? suppliesError.message
        : "No se pudieron cargar los insumos hospitalarios."
      : null;

  useEffect(() => {
    const id = requestAnimationFrame(() =>
      setAdminToken(
        typeof window !== "undefined"
          ? sessionStorage.getItem(ADMIN_STORAGE_KEY)
          : null,
      ),
    );
    return () => cancelAnimationFrame(id);
  }, []);

  async function handleRefresh() {
    await Promise.all([refetchPatients(), refetchSupplies()]);
  }

  async function handleDelete(id: string) {
    if (!adminToken) return;
    if (!confirm("¿Eliminar este paciente?")) return;
    const res = await apiFetch(
      `/api/hospitals/${hospital.id}/patients/${id}`,
      {
        method: "DELETE",
        headers: { "x-admin-token": adminToken },
      },
    );
    if (res.ok) {
      await queryClient.invalidateQueries({
        queryKey: qk.hospitals.patients(hospital.id),
      });
    }
  }

  const q = search.trim().toLowerCase();
  const filtered = q
    ? patients.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.notes.toLowerCase().includes(q) ||
          p.contact.toLowerCase().includes(q),
      )
    : patients;
  const active = patients.filter((p) => p.status === "hospitalized").length;

  return (
    <div className="space-y-4">
      <HospitalSupplyPanel supply={supply} now={now} />

    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-slate-900">
            Pacientes registrados
          </h2>
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
            {active} hospitalizados
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={refreshing}
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
          >
            {refreshing ? "Actualizando…" : "🔄 Actualizar"}
          </button>
        </div>
      </div>

      <div className="border-b border-slate-200 px-5 py-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar paciente por nombre, nota o contacto…"
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400"
        />
      </div>

      <div className="px-5 py-4">
        {error && (
          <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            No pudimos cargar la información del hospital. Revisa tu conexión e
            inténtalo de nuevo con 🔄 Actualizar.
          </p>
        )}

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center">
            <p className="text-2xl" aria-hidden>🏥</p>
            <p className="mt-2 text-sm font-medium text-slate-700">
              {patients.length === 0
                ? "Todavía no hay pacientes registrados en este hospital."
                : "Sin resultados para la búsqueda."}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((p) => {
              const condition = PATIENT_CONDITION_META[p.condition];
              const status = PATIENT_STATUS_META[p.status];
              return (
                <li
                  key={p.id}
                  id={`paciente-${p.id}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedPatient(p)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedPatient(p);
                    }
                  }}
                  className="cursor-pointer scroll-mt-24 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition target:border-red-400 target:bg-red-50 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {p.name}
                        {p.age !== null && (
                          <span className="ml-2 text-xs font-normal text-slate-500">
                            {p.age} años
                          </span>
                        )}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Pill bg={status.color}>{status.label}</Pill>
                        <Pill bg={condition.color}>{condition.label}</Pill>
                      </div>
                    </div>
                    {adminToken && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDelete(p.id);
                        }}
                        className="text-xs font-medium text-red-600 hover:underline"
                      >
                        Eliminar
                      </button>
                    )}
                  </div>
                  {p.notes && (
                    <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-slate-600">
                      {p.notes}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                    <span>📅 Ingreso {timeAgo(p.admittedAt, now)}</span>
                    {p.contact && (
                      <span className="truncate">📞 {p.contact}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {selectedPatient && (
        <PatientDetailOverlay
          result={{ patient: selectedPatient, hospital }}
          onClose={() => setSelectedPatient(null)}
        />
      )}
    </div>
    </div>
  );
}

function HospitalSupplyPanel({
  supply,
  now,
}: {
  supply: PublicHospitalSupplySummary | null;
  now: number;
}) {
  const statuses = supply?.statuses ?? [];
  const activeNeeds = supply?.activeNeeds ?? [];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
            Insumos hospitalarios
          </p>
          <h2 className="mt-1 text-lg font-bold text-slate-900">
            Estado por categoría
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
            Datos operativos reportados por personal verificado. No incluye
            contactos privados ni notas restringidas.
          </p>
        </div>
      </div>

      {statuses.length === 0 && activeNeeds.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
          <p className="text-sm font-semibold text-slate-700">
            Sin reporte de insumos confirmado todavía.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Coordinación puede actualizar el semáforo desde el panel restringido.
          </p>
        </div>
      ) : (
        <>
          {statuses.length > 0 && (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {statuses.map((status) => (
                <SupplyStatusCard key={status.category} status={status} />
              ))}
            </div>
          )}

          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs leading-5 text-amber-950">
            Prioriza exactamente lo pedido por el hospital. Evita donar comida
            genérica si el reporte solicita alimentos blandos/digeribles,
            medicamentos o líquidos IV específicos.
          </div>

          <div className="mt-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900">
                Necesidades activas
              </h3>
              {supply?.lastConfirmedAt && (
                <span className="text-xs text-slate-500">
                  Última confirmación {timeAgo(supply.lastConfirmedAt, now)}
                </span>
              )}
            </div>
            {activeNeeds.length === 0 ? (
              <p className="mt-2 rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm text-slate-500">
                No hay necesidades itemizadas activas publicadas.
              </p>
            ) : (
              <ul className="mt-2 grid gap-2">
                {activeNeeds.map((need) => (
                  <SupplyNeedItem key={need.id} need={need} />
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function SupplyStatusCard({ status }: { status: PublicHospitalSupplyStatus }) {
  const meta = HOSPITAL_SUPPLY_STATUS_META[status.status];
  const category = HOSPITAL_SUPPLY_CATEGORY_META[status.category];
  return (
    <article
      className={`rounded-xl border p-3 ${
        status.freshness.isStale
          ? "border-amber-200 bg-amber-50"
          : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-900">{category.label}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Confirmado {status.freshness.confirmedAgo}
          </p>
        </div>
        <span
          className="inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white"
          style={{ background: meta.color }}
        >
          {meta.label}
        </span>
      </div>
      {status.publicNote && (
        <p className="mt-2 text-xs leading-5 text-slate-600">
          {status.publicNote}
        </p>
      )}
      {status.freshness.isStale && (
        <p className="mt-2 text-[11px] font-semibold text-amber-800">
          Requiere reconfirmación.
        </p>
      )}
    </article>
  );
}

function SupplyNeedItem({ need }: { need: PublicHospitalSupplyNeed }) {
  const urgency = HOSPITAL_SUPPLY_STATUS_META[need.urgency];
  const status = HOSPITAL_SUPPLY_NEED_STATUS_META[need.status];
  const quantity =
    need.quantity !== null
      ? `${formatLocaleNumber(need.quantity)}${need.unit ? ` ${need.unit}` : ""}`
      : need.unit || "Cantidad por confirmar";

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900">{need.itemType}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {need.categoryLabel} · {quantity} · {need.updatedAgo}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1">
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
            style={{ background: urgency.color }}
          >
            {urgency.label}
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
            style={{ background: status.color }}
          >
            {status.label}
          </span>
        </div>
      </div>
      {need.publicNote && (
        <p className="mt-2 text-xs leading-5 text-slate-600">{need.publicNote}</p>
      )}
    </li>
  );
}

function Pill({
  bg,
  children,
}: {
  bg: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
      style={{ background: bg }}
    >
      {children}
    </span>
  );
}
