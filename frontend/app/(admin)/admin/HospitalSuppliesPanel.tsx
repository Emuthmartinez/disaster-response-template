"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  HOSPITAL_SUPPLY_CATEGORIES,
  HOSPITAL_SUPPLY_CATEGORY_META,
  HOSPITAL_SUPPLY_HELP_STATUS_META,
  HOSPITAL_SUPPLY_NEED_STATUS_META,
  HOSPITAL_SUPPLY_STATUS_META,
  isOpenHospitalSupplyHelpStatus,
  type Hospital,
  type HospitalPocAssignment,
  type HospitalSupplyCategory,
  type HospitalSupplyHelpRequest,
  type HospitalSupplyHelpStatus,
  type HospitalSupplyNeedStatus,
  type HospitalSupplyStatus,
  type PublicHospitalSupplySummary,
  type RestrictedHospitalSupplyNeed,
  type RestrictedHospitalSupplyStatus,
} from "@/lib/hospitals-meta";

interface RestrictedHospitalSupplySnapshot {
  hospitalId: string;
  summary: PublicHospitalSupplySummary;
  statuses: RestrictedHospitalSupplyStatus[];
  activeNeeds: RestrictedHospitalSupplyNeed[];
  helpRequests: HospitalSupplyHelpRequest[];
  pocs: HospitalPocAssignment[];
}

interface AdminHospitalSupplyRow {
  hospital: Hospital;
  supply: RestrictedHospitalSupplySnapshot;
}

interface AdminHospitalSupplyData {
  generatedAt: number;
  stats: {
    hospitals: number;
    redCategories: number;
    yellowCategories: number;
    staleCategories: number;
    activeNeeds: number;
    helpOpen: number;
  };
  hospitals: AdminHospitalSupplyRow[];
}

interface Props {
  token: string;
  query: string;
}

const STATUS_OPTIONS: HospitalSupplyStatus[] = [
  "green",
  "yellow",
  "red",
  "unknown",
];

const NEED_STATUS_OPTIONS: HospitalSupplyNeedStatus[] = [
  "active",
  "partially_covered",
  "covered",
  "needs_verification",
  "cancelled",
];

const HELP_STATUS_OPTIONS: HospitalSupplyHelpStatus[] = [
  "open",
  "contacting",
  "resolved",
  "closed",
];

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function fmt(ts: number): string {
  return new Date(ts).toLocaleString("es");
}

export default function HospitalSuppliesPanel({ token, query }: Props) {
  const [data, setData] = useState<AdminHospitalSupplyData | null>(null);
  const [selectedHospitalId, setSelectedHospitalId] = useState<string>("");
  const [selectedCategory, setSelectedCategory] =
    useState<HospitalSupplyCategory>("medications");
  const [categoryNote, setCategoryNote] = useState("");
  const [needForm, setNeedForm] = useState({
    category: "medications" as HospitalSupplyCategory,
    itemType: "",
    quantity: "",
    unit: "",
    urgency: "red" as HospitalSupplyStatus,
    publicNote: "",
    restrictedNote: "",
  });
  const [helpForm, setHelpForm] = useState({
    category: "medications" as HospitalSupplyCategory,
    urgency: "yellow" as HospitalSupplyStatus,
    message: "",
    restrictedNote: "",
  });
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await apiFetch("/api/admin/hospital-supplies", {
      headers: { "x-admin-token": token },
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Error desconocido." }));
      throw new Error(body.error ?? "No se pudieron cargar los insumos.");
    }
    const next = (await res.json()) as AdminHospitalSupplyData;
    setData(next);
    setError(null);
    setSelectedHospitalId((current) => current || next.hospitals[0]?.hospital.id || "");
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      if (cancelled) return;
      load().catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Error al cargar insumos.");
      });
    });
    return () => { cancelled = true; cancelAnimationFrame(id); };
  }, [load]);

  const filteredRows = useMemo(() => {
    if (!data) return [];
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    if (terms.length === 0) return data.hospitals;
    return data.hospitals.filter((row) => {
      const searchable = normalize(
        [
          row.hospital.name,
          row.hospital.state,
          row.hospital.municipality,
          row.supply.statuses.map((s) => `${s.label} ${s.status}`).join(" "),
          row.supply.activeNeeds.map((n) => n.itemType).join(" "),
          row.supply.helpRequests.map((h) => h.message).join(" "),
        ].join(" "),
      );
      return terms.every((term) => searchable.includes(term));
    });
  }, [data, query]);

  const selectedRow = useMemo(() => {
    if (!data) return null;
    return (
      data.hospitals.find((row) => row.hospital.id === selectedHospitalId) ??
      data.hospitals[0] ??
      null
    );
  }, [data, selectedHospitalId]);

  const selectedStatus = selectedRow?.supply.statuses.find(
    (status) => status.category === selectedCategory,
  );

  async function postJson(path: string, body: Record<string, unknown>, method = "POST") {
    const res = await apiFetch(path, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": token,
      },
      body: JSON.stringify(body),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        typeof payload.error === "string" ? payload.error : "No se pudo guardar.",
      );
    }
    return payload;
  }

  async function updateStatus(status: HospitalSupplyStatus, confirmOnly = false) {
    if (!selectedRow) return;
    setSaving(`${selectedCategory}:${status}:${confirmOnly ? "confirm" : "set"}`);
    try {
      await postJson(`/api/hospitals/${selectedRow.hospital.id}/supplies`, {
        category: selectedCategory,
        status,
        confirmOnly,
        publicNote: confirmOnly || !categoryNote.trim() ? undefined : categoryNote,
        updatedBy: "panel_admin",
        source: "admin_panel",
      });
      setCategoryNote("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar.");
    } finally {
      setSaving(null);
    }
  }

  async function createNeed() {
    if (!selectedRow) return;
    setSaving("need");
    try {
      await postJson(`/api/hospitals/${selectedRow.hospital.id}/supplies/needs`, {
        ...needForm,
        quantity: needForm.quantity,
        updatedBy: "panel_admin",
        source: "admin_panel",
      });
      setNeedForm((prev) => ({
        ...prev,
        itemType: "",
        quantity: "",
        unit: "",
        publicNote: "",
        restrictedNote: "",
      }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear necesidad.");
    } finally {
      setSaving(null);
    }
  }

  async function patchNeed(need: RestrictedHospitalSupplyNeed, status: HospitalSupplyNeedStatus) {
    setSaving(`need:${need.id}`);
    try {
      await postJson(
        `/api/hospitals/${need.hospitalId}/supplies/needs/${need.id}`,
        { status, updatedBy: "panel_admin", source: "admin_panel" },
        "PATCH",
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar necesidad.");
    } finally {
      setSaving(null);
    }
  }

  async function createHelpRequest() {
    if (!selectedRow) return;
    setSaving("help");
    try {
      await postJson(`/api/hospitals/${selectedRow.hospital.id}/supplies/help`, {
        ...helpForm,
        requestedBy: "poc_hospitalario",
        source: "admin_panel",
      });
      setHelpForm((prev) => ({ ...prev, message: "", restrictedNote: "" }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear solicitud.");
    } finally {
      setSaving(null);
    }
  }

  async function patchHelp(
    request: HospitalSupplyHelpRequest,
    status: HospitalSupplyHelpStatus,
  ) {
    setSaving(`help:${request.id}`);
    try {
      await postJson(
        `/api/hospitals/${request.hospitalId}/supplies/help/${request.id}`,
        { status, requestedBy: "panel_admin", source: "admin_panel" },
        "PATCH",
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar solicitud.");
    } finally {
      setSaving(null);
    }
  }

  if (!data) {
    return (
      <section className="p-6 text-sm text-slate-500">
        {error ?? "Cargando insumos hospitalarios…"}
      </section>
    );
  }

  return (
    <section className="bg-slate-50">
      <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <SupplyMetric label="Hospitales" value={data.stats.hospitals} />
        <SupplyMetric label="Categorías rojas" value={data.stats.redCategories} accent="#c41a1a" />
        <SupplyMetric label="Categorías stale" value={data.stats.staleCategories} accent="#b45309" />
        <SupplyMetric label="Necesidades activas" value={data.stats.activeNeeds} accent="#2b51f0" />
        <SupplyMetric label="Ayuda abierta" value={data.stats.helpOpen} accent="#9333ea" />
      </div>

      {error && (
        <p className="mx-4 mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="grid gap-4 p-4 xl:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.6fr)]">
        <aside className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Priorización
            </p>
            <h2 className="mt-1 text-lg font-bold text-slate-900">
              Hospitales con insumos
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Orden práctico: rojo, stale, solicitudes y necesidades activas.
            </p>
          </div>
          <div className="max-h-[620px] overflow-y-auto">
            {filteredRows.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">Sin hospitales para el filtro.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {filteredRows.map((row) => (
                  <li key={row.hospital.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedHospitalId(row.hospital.id)}
                      className={`block w-full p-3 text-left transition hover:bg-slate-50 ${
                        selectedRow?.hospital.id === row.hospital.id
                          ? "bg-blue-50/80"
                          : "bg-white"
                      }`}
                    >
                      <p className="text-sm font-bold text-slate-900">
                        {row.hospital.name}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {row.hospital.state}
                        {row.hospital.municipality ? ` · ${row.hospital.municipality}` : ""}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {row.supply.summary.counts.red > 0 && (
                          <MiniBadge color="#c41a1a">
                            {row.supply.summary.counts.red} rojo
                          </MiniBadge>
                        )}
                        {row.supply.summary.counts.stale > 0 && (
                          <MiniBadge color="#b45309">
                            {row.supply.summary.counts.stale} stale
                          </MiniBadge>
                        )}
                        {row.supply.summary.counts.activeNeeds > 0 && (
                          <MiniBadge color="#2b51f0">
                            {row.supply.summary.counts.activeNeeds} necesidades
                          </MiniBadge>
                        )}
                        {row.supply.helpRequests.some((h) =>
                          isOpenHospitalSupplyHelpStatus(h.status),
                        ) && (
                          <MiniBadge color="#9333ea">ayuda</MiniBadge>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {selectedRow ? (
          <div className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Panel POC/admin
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-slate-900">
                    {selectedRow.hospital.name}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {selectedRow.hospital.state}
                    {selectedRow.hospital.municipality
                      ? ` · ${selectedRow.hospital.municipality}`
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => load().catch((err) => setError(err.message))}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Actualizar datos
                </button>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {HOSPITAL_SUPPLY_CATEGORIES.map((category) => (
                  <CategoryStatusCard
                    key={category}
                    category={category}
                    status={selectedRow.supply.statuses.find(
                      (s) => s.category === category,
                    )}
                    active={selectedCategory === category}
                    onSelect={() => {
                      setSelectedCategory(category);
                      setNeedForm((prev) => ({ ...prev, category }));
                      setHelpForm((prev) => ({ ...prev, category }));
                    }}
                  />
                ))}
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      {HOSPITAL_SUPPLY_CATEGORY_META[selectedCategory].label}
                    </p>
                    <p className="text-xs text-slate-500">
                      {selectedStatus
                        ? `Última confirmación ${selectedStatus.freshness.confirmedAgo}`
                        : "Sin reporte confirmado todavía"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateStatus(selectedStatus?.status ?? "unknown", true)}
                    disabled={saving !== null || !selectedStatus}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Sin cambios
                  </button>
                </div>

                <textarea
                  value={categoryNote}
                  onChange={(event) => setCategoryNote(event.target.value)}
                  placeholder="Nota pública segura opcional para esta categoría…"
                  className="mt-3 min-h-20 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400"
                />
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {STATUS_OPTIONS.map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => updateStatus(status)}
                      disabled={saving !== null}
                      className="min-h-12 rounded-xl px-3 py-2 text-sm font-bold text-white shadow-sm disabled:opacity-50"
                      style={{ background: HOSPITAL_SUPPLY_STATUS_META[status].color }}
                    >
                      {HOSPITAL_SUPPLY_STATUS_META[status].label}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-base font-bold text-slate-900">
                  Agregar necesidad específica
                </h3>
                <div className="mt-3 grid gap-2">
                  <SupplyCategorySelect
                    value={needForm.category}
                    onChange={(category) =>
                      setNeedForm((prev) => ({ ...prev, category }))
                    }
                  />
                  <input
                    value={needForm.itemType}
                    onChange={(event) =>
                      setNeedForm((prev) => ({
                        ...prev,
                        itemType: event.target.value,
                      }))
                    }
                    placeholder="Ej. Ringer lactato, gasas, alimentos blandos…"
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={needForm.quantity}
                      onChange={(event) =>
                        setNeedForm((prev) => ({
                          ...prev,
                          quantity: event.target.value,
                        }))
                      }
                      inputMode="numeric"
                      placeholder="Cantidad"
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400"
                    />
                    <input
                      value={needForm.unit}
                      onChange={(event) =>
                        setNeedForm((prev) => ({ ...prev, unit: event.target.value }))
                      }
                      placeholder="Unidad"
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400"
                    />
                  </div>
                  <select
                    value={needForm.urgency}
                    onChange={(event) =>
                      setNeedForm((prev) => ({
                        ...prev,
                        urgency: event.target.value as HospitalSupplyStatus,
                      }))
                    }
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400"
                  >
                    {STATUS_OPTIONS.filter((status) => status !== "green").map(
                      (status) => (
                        <option key={status} value={status}>
                          Urgencia {HOSPITAL_SUPPLY_STATUS_META[status].label}
                        </option>
                      ),
                    )}
                  </select>
                  <textarea
                    value={needForm.publicNote}
                    onChange={(event) =>
                      setNeedForm((prev) => ({
                        ...prev,
                        publicNote: event.target.value,
                      }))
                    }
                    placeholder="Nota pública segura (sin teléfonos, nombres privados ni pacientes)…"
                    className="min-h-20 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400"
                  />
                  <textarea
                    value={needForm.restrictedNote}
                    onChange={(event) =>
                      setNeedForm((prev) => ({
                        ...prev,
                        restrictedNote: event.target.value,
                      }))
                    }
                    placeholder="Nota restringida para coordinación…"
                    className="min-h-16 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-red-400"
                  />
                  <button
                    type="button"
                    onClick={createNeed}
                    disabled={saving !== null || !needForm.itemType.trim()}
                    className="min-h-11 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {saving === "need" ? "Guardando…" : "Agregar necesidad"}
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-base font-bold text-slate-900">
                  Necesito ayuda para actualizar
                </h3>
                <div className="mt-3 grid gap-2">
                  <SupplyCategorySelect
                    value={helpForm.category}
                    onChange={(category) =>
                      setHelpForm((prev) => ({ ...prev, category }))
                    }
                  />
                  <select
                    value={helpForm.urgency}
                    onChange={(event) =>
                      setHelpForm((prev) => ({
                        ...prev,
                        urgency: event.target.value as HospitalSupplyStatus,
                      }))
                    }
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400"
                  >
                    {STATUS_OPTIONS.filter((status) => status !== "green").map(
                      (status) => (
                        <option key={status} value={status}>
                          Urgencia {HOSPITAL_SUPPLY_STATUS_META[status].label}
                        </option>
                      ),
                    )}
                  </select>
                  <textarea
                    value={helpForm.message}
                    onChange={(event) =>
                      setHelpForm((prev) => ({
                        ...prev,
                        message: event.target.value,
                      }))
                    }
                    placeholder="Mensaje corto para coordinación…"
                    className="min-h-24 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400"
                  />
                  <textarea
                    value={helpForm.restrictedNote}
                    onChange={(event) =>
                      setHelpForm((prev) => ({
                        ...prev,
                        restrictedNote: event.target.value,
                      }))
                    }
                    placeholder="Nota restringida opcional…"
                    className="min-h-16 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-red-400"
                  />
                  <button
                    type="button"
                    onClick={createHelpRequest}
                    disabled={saving !== null || !helpForm.message.trim()}
                    className="min-h-11 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving === "help" ? "Enviando…" : "Pedir ayuda"}
                  </button>
                </div>
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <OperationsList
                title="Necesidades activas y fulfillment"
                empty="Sin necesidades registradas."
              >
                {selectedRow.supply.activeNeeds.map((need) => (
                  <li key={need.id} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-slate-900">
                          {need.itemType}
                        </p>
                        <p className="text-xs text-slate-500">
                          {need.categoryLabel} · {need.quantity ?? "?"} {need.unit} ·{" "}
                          {fmt(need.updatedAt)}
                        </p>
                      </div>
                      <select
                        value={need.status}
                        onChange={(event) =>
                          patchNeed(
                            need,
                            event.target.value as HospitalSupplyNeedStatus,
                          )
                        }
                        disabled={saving === `need:${need.id}`}
                        className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                      >
                        {NEED_STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {HOSPITAL_SUPPLY_NEED_STATUS_META[status].label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {need.publicNote && (
                      <p className="mt-2 text-xs text-slate-600">
                        Pública: {need.publicNote}
                      </p>
                    )}
                    {need.restrictedNote && (
                      <p className="mt-1 text-xs text-slate-500">
                        Restringida: {need.restrictedNote}
                      </p>
                    )}
                  </li>
                ))}
              </OperationsList>

              <OperationsList
                title="Solicitudes de ayuda"
                empty="Sin solicitudes de ayuda."
              >
                {selectedRow.supply.helpRequests.map((request) => (
                  <li key={request.id} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-slate-900">
                          {request.categoryLabel}
                        </p>
                        <p className="text-xs text-slate-500">
                          {fmt(request.createdAt)} · {request.requestedBy}
                        </p>
                      </div>
                      <select
                        value={request.status}
                        onChange={(event) =>
                          patchHelp(
                            request,
                            event.target.value as HospitalSupplyHelpStatus,
                          )
                        }
                        disabled={saving === `help:${request.id}`}
                        className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                      >
                        {HELP_STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {HOSPITAL_SUPPLY_HELP_STATUS_META[status].label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-xs text-slate-700">
                      {request.message}
                    </p>
                    {request.restrictedNote && (
                      <p className="mt-1 text-xs text-slate-500">
                        Restringida: {request.restrictedNote}
                      </p>
                    )}
                  </li>
                ))}
              </OperationsList>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-base font-bold text-slate-900">
                POCs asignados
              </h3>
              {selectedRow.supply.pocs.length === 0 ? (
                <p className="mt-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                  Sin asignaciones POC cargadas todavía. El modelo queda listo
                  para habilitar altas/revocaciones restringidas.
                </p>
              ) : (
                <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                  {selectedRow.supply.pocs.map((poc) => (
                    <li
                      key={poc.id}
                      className="rounded-xl border border-slate-200 p-3 text-sm"
                    >
                      <p className="font-bold text-slate-900">{poc.displayName}</p>
                      <p className="text-xs text-slate-500">
                        {poc.role} · {poc.active ? "activo" : "inactivo"}
                      </p>
                      {poc.restrictedContact && (
                        <p className="mt-1 text-xs text-slate-500">
                          Contacto restringido: {poc.restrictedContact}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : (
          <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            Selecciona un hospital para actualizar insumos.
          </p>
        )}
      </div>
    </section>
  );
}

function SupplyMetric({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-black" style={{ color: accent ?? "#0f172a" }}>
        {value.toLocaleString("es")}
      </p>
    </div>
  );
}

function MiniBadge({
  color,
  children,
}: {
  color: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
      style={{ background: color }}
    >
      {children}
    </span>
  );
}

function CategoryStatusCard({
  category,
  status,
  active,
  onSelect,
}: {
  category: HospitalSupplyCategory;
  status: RestrictedHospitalSupplyStatus | undefined;
  active: boolean;
  onSelect: () => void;
}) {
  const categoryMeta = HOSPITAL_SUPPLY_CATEGORY_META[category];
  const statusMeta = HOSPITAL_SUPPLY_STATUS_META[status?.status ?? "unknown"];
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-xl border p-3 text-left transition hover:border-slate-300 ${
        active ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-bold text-slate-900">{categoryMeta.label}</p>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
          style={{ background: statusMeta.color }}
        >
          {statusMeta.label}
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {status
          ? `${status.freshness.confirmedAgo}${status.freshness.isStale ? " · stale" : ""}`
          : "Sin reporte"}
      </p>
    </button>
  );
}

function SupplyCategorySelect({
  value,
  onChange,
}: {
  value: HospitalSupplyCategory;
  onChange: (value: HospitalSupplyCategory) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as HospitalSupplyCategory)}
      className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400"
    >
      {HOSPITAL_SUPPLY_CATEGORIES.map((category) => (
        <option key={category} value={category}>
          {HOSPITAL_SUPPLY_CATEGORY_META[category].label}
        </option>
      ))}
    </select>
  );
}

function OperationsList({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const items = Array.isArray(children) ? children : [];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-base font-bold text-slate-900">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
          {empty}
        </p>
      ) : (
        <ul className="mt-3 grid gap-2">{children}</ul>
      )}
    </div>
  );
}
