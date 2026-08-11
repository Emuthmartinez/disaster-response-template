"use client";

/**
 * Detalle editable de insumos de UN hospital: semáforos por categoría,
 * necesidades activas, solicitudes de ayuda, POCs (solo lectura) y bitácora.
 * Las escrituras piden hospital:edit en el backend; si faltan permisos el BFF
 * propaga el 403 y se muestra el error tal cual (visible y accionable).
 */
import { useState, type FormEvent, type ReactNode } from "react";
import { useAdminSessionContext } from "@/src/shared/auth/admin-session-context";
import { Button, Input } from "@/src/ui";
import { useSupplyEvents, useSupplyMutations } from "./use-hospital-supplies";
import {
  CATEGORY_LABELS,
  HELP_STATUS_LABELS,
  NEED_STATUS_LABELS,
  STATUS_DOT,
  STATUS_LABELS,
  type SupplyBoardRow,
  type SupplyCategory,
  type SupplyStatusValue,
} from "./types";

const CATEGORIES = Object.keys(CATEGORY_LABELS) as SupplyCategory[];

export function SupplyDetail({ row }: { row: SupplyBoardRow }) {
  const { hospital, supply } = row;
  const { can } = useAdminSessionContext();
  const canEdit = can("hospital:edit");
  const mutations = useSupplyMutations(hospital.id);
  const events = useSupplyEvents(hospital.id);

  const mutationError = mutations.lastError;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className="text-xl font-semibold">{hospital.name}</h2>
        <p className="text-sm text-gray-500">
          {hospital.state}
          {hospital.municipality ? ` · ${hospital.municipality}` : ""} · zona{" "}
          {hospital.priorityZone}
        </p>
      </header>

      {mutationError && (
        <p role="alert" className="text-sm text-red-600">
          {mutationError.message}
        </p>
      )}

      {/* --- Semáforos por categoría ------------------------------------- */}
      <section className="rounded border p-4">
        <h3 className="font-semibold">Semáforos por categoría</h3>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {supply.statuses.map((status) => (
            <li key={status.id}>
              <div className="flex items-center gap-2">
                <span
                  className={["inline-block h-3 w-3 rounded-full", STATUS_DOT[status.status]].join(" ")}
                />
                <span className="font-medium">{status.label}</span>
                <span className="text-gray-500">
                  {STATUS_LABELS[status.status]} · {status.freshness.confirmedAgo}
                  {status.freshness.isStale ? " · DESACTUALIZADO" : ""}
                </span>
                {canEdit && (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={mutations.updateStatus.isPending}
                    onClick={() =>
                      mutations.updateStatus.mutate({
                        category: status.category,
                        confirmOnly: true,
                      })
                    }
                  >
                    Confirmar vigente
                  </Button>
                )}
              </div>
              {status.publicNote && <p className="ml-5 text-gray-600">{status.publicNote}</p>}
              {status.restrictedNote && (
                <p className="ml-5 text-amber-700">Interno: {status.restrictedNote}</p>
              )}
            </li>
          ))}
          {supply.statuses.length === 0 && (
            <li className="text-gray-500">Sin semáforos reportados todavía.</li>
          )}
        </ul>
        {canEdit && (
          <StatusForm
            pending={mutations.updateStatus.isPending}
            onSubmit={(body) => mutations.updateStatus.mutateAsync(body)}
          />
        )}
      </section>

      {/* --- Necesidades activas ----------------------------------------- */}
      <section className="rounded border p-4">
        <h3 className="font-semibold">Necesidades activas</h3>
        <ul className="mt-2 flex flex-col gap-2 text-sm">
          {supply.activeNeeds.map((need) => (
            <li key={need.id} className="rounded border p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">
                  {need.itemType}
                  {need.quantity ? ` — ${need.quantity} ${need.unit}`.trimEnd() : ""}
                </span>
                <span
                  className={["inline-block h-3 w-3 rounded-full", STATUS_DOT[need.urgency]].join(" ")}
                  title={`Urgencia: ${STATUS_LABELS[need.urgency]}`}
                />
              </div>
              <p className="text-gray-500">
                {need.categoryLabel} · {NEED_STATUS_LABELS[need.status]} · {need.updatedAgo}
              </p>
              {need.publicNote && <p>{need.publicNote}</p>}
              {need.restrictedNote && (
                <p className="text-amber-700">Interno: {need.restrictedNote}</p>
              )}
              {canEdit && (
                <PendingSelect
                  label="Cambiar estado"
                  value={need.status}
                  disabled={mutations.patchNeed.isPending}
                  onCommit={(next) =>
                    mutations.patchNeed.mutateAsync({ needId: need.id, status: next })
                  }
                >
                  {Object.entries(NEED_STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </PendingSelect>
              )}
            </li>
          ))}
          {supply.activeNeeds.length === 0 && (
            <li className="text-gray-500">Sin necesidades activas.</li>
          )}
        </ul>
        {canEdit && (
          <NeedForm
            pending={mutations.createNeed.isPending}
            onSubmit={(body) => mutations.createNeed.mutateAsync(body)}
          />
        )}
      </section>

      {/* --- Solicitudes de ayuda ---------------------------------------- */}
      <section className="rounded border p-4">
        <h3 className="font-semibold">Solicitudes de ayuda</h3>
        <ul className="mt-2 flex flex-col gap-2 text-sm">
          {supply.helpRequests.map((request) => (
            <li key={request.id} className="rounded border p-2">
              <p className="font-medium">{request.message}</p>
              <p className="text-gray-500">
                {request.categoryLabel} · {HELP_STATUS_LABELS[request.status]} · pide{" "}
                {request.requestedBy} · {request.updatedAgo}
              </p>
              {request.restrictedNote && (
                <p className="text-amber-700">Interno: {request.restrictedNote}</p>
              )}
              {canEdit && (
                <PendingSelect
                  label="Cambiar estado"
                  value={request.status}
                  disabled={mutations.patchHelp.isPending}
                  onCommit={(next) =>
                    mutations.patchHelp.mutateAsync({ requestId: request.id, status: next })
                  }
                >
                  {Object.entries(HELP_STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </PendingSelect>
              )}
            </li>
          ))}
          {supply.helpRequests.length === 0 && (
            <li className="text-gray-500">Sin solicitudes de ayuda.</li>
          )}
        </ul>
      </section>

      {/* --- POCs (solo lectura) ----------------------------------------- */}
      <section className="rounded border p-4">
        <h3 className="font-semibold">Puntos de contacto (POC)</h3>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {supply.pocs.map((poc) => (
            <li key={poc.id}>
              <span className="font-medium">{poc.displayName}</span>{" "}
              <span className="text-gray-500">
                {poc.role} · {poc.active ? "activo" : "inactivo"}
              </span>
              {poc.restrictedContact && (
                <span className="text-amber-700"> · {poc.restrictedContact}</span>
              )}
            </li>
          ))}
          {supply.pocs.length === 0 && <li className="text-gray-500">Sin POCs asignados.</li>}
        </ul>
      </section>

      {/* --- Bitácora ----------------------------------------------------- */}
      <section className="rounded border p-4">
        <h3 className="font-semibold">Bitácora reciente</h3>
        {events.isLoading && <p className="mt-2 text-sm text-gray-500">Cargando bitácora…</p>}
        {events.isError && (
          <p role="alert" className="mt-2 text-sm text-red-600">
            No se pudo cargar la bitácora: {events.error.message}
          </p>
        )}
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {(events.data?.items ?? []).map((event) => (
            <li key={event.id} className="text-gray-600">
              <span className="font-medium">{event.action}</span>
              {event.category ? ` · ${event.category}` : ""} · {event.actor} ·{" "}
              {new Date(event.createdAt).toLocaleString()}
            </li>
          ))}
          {events.data && events.data.items.length === 0 && (
            <li className="text-gray-500">Sin eventos registrados.</li>
          )}
        </ul>
      </section>
    </div>
  );
}

/**
 * Select controlado con valor optimista: al elegir, muestra la opción elegida
 * (no el valor del server) hasta que la mutación TERMINA — sin esto el select
 * "rebota" al valor viejo durante el write y parece que la edición se perdió.
 * En fallo vuelve al valor real; el banner de error explica el porqué.
 */
function PendingSelect({
  label,
  value,
  disabled,
  onCommit,
  children,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onCommit: (next: string) => Promise<unknown>;
  children: ReactNode;
}) {
  const [pendingValue, setPendingValue] = useState<string | null>(null);
  return (
    <label className="mt-1 block text-xs text-gray-500">
      {label}
      <select
        className="ml-2 rounded border px-2 py-1 text-sm"
        value={pendingValue ?? value}
        disabled={disabled || pendingValue !== null}
        onChange={(event) => {
          const next = event.target.value;
          setPendingValue(next);
          // Al resolver, el board ya refetcheó (onSuccess espera la
          // invalidación), así que `value` es la verdad del server.
          onCommit(next)
            .catch(() => {})
            .finally(() => setPendingValue(null));
        }}
      >
        {children}
      </select>
    </label>
  );
}

/** Form de upsert de semáforo: categoría + estado + notas. */
function StatusForm({
  pending,
  onSubmit,
}: {
  pending: boolean;
  onSubmit: (body: Record<string, unknown>) => Promise<unknown>;
}) {
  const [category, setCategory] = useState<SupplyCategory>("medications");
  const [status, setStatus] = useState<SupplyStatusValue>("yellow");
  const [publicNote, setPublicNote] = useState("");
  const [restrictedNote, setRestrictedNote] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    // Limpia SOLO si la escritura llegó: un 400 (p.ej. texto rechazado por el
    // filtro de seguridad) no debe borrar lo que la persona escribió.
    void onSubmit({
      category,
      status,
      publicNote: publicNote || undefined,
      restrictedNote: restrictedNote || undefined,
    })
      .then(() => {
        setPublicNote("");
        setRestrictedNote("");
      })
      .catch(() => {});
  }

  return (
    <form onSubmit={submit} className="mt-3 flex flex-col gap-2 border-t pt-3">
      <p className="text-sm font-medium">Actualizar semáforo</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-gray-500">
          Categoría
          <select
            className="mt-1 w-full rounded border px-2 py-1 text-sm"
            value={category}
            onChange={(event) => setCategory(event.target.value as SupplyCategory)}
          >
            {CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {CATEGORY_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-500">
          Estado
          <select
            className="mt-1 w-full rounded border px-2 py-1 text-sm"
            value={status}
            onChange={(event) => setStatus(event.target.value as SupplyStatusValue)}
          >
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Input
        label="Nota pública (opcional)"
        value={publicNote}
        onChange={(event) => setPublicNote(event.target.value)}
      />
      <Input
        label="Nota interna (opcional)"
        value={restrictedNote}
        onChange={(event) => setRestrictedNote(event.target.value)}
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Guardar semáforo"}
      </Button>
    </form>
  );
}

/** Form de alta de necesidad: categoría + insumo + cantidad + urgencia. */
function NeedForm({
  pending,
  onSubmit,
}: {
  pending: boolean;
  onSubmit: (body: Record<string, unknown>) => Promise<unknown>;
}) {
  const [category, setCategory] = useState<SupplyCategory>("medications");
  const [itemType, setItemType] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [urgency, setUrgency] = useState<"yellow" | "red">("yellow");
  const [publicNote, setPublicNote] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    // Limpia SOLO en éxito — un rechazo del server no borra lo escrito.
    void onSubmit({
      category,
      itemType,
      quantity: quantity ? Number(quantity) : undefined,
      unit: unit || undefined,
      urgency,
      publicNote: publicNote || undefined,
    })
      .then(() => {
        setItemType("");
        setQuantity("");
        setUnit("");
        setPublicNote("");
      })
      .catch(() => {});
  }

  return (
    <form onSubmit={submit} className="mt-3 flex flex-col gap-2 border-t pt-3">
      <p className="text-sm font-medium">Registrar necesidad</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-gray-500">
          Categoría
          <select
            className="mt-1 w-full rounded border px-2 py-1 text-sm"
            value={category}
            onChange={(event) => setCategory(event.target.value as SupplyCategory)}
          >
            {CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {CATEGORY_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-500">
          Urgencia
          <select
            className="mt-1 w-full rounded border px-2 py-1 text-sm"
            value={urgency}
            onChange={(event) => setUrgency(event.target.value as "yellow" | "red")}
          >
            <option value="yellow">Amarilla</option>
            <option value="red">Roja</option>
          </select>
        </label>
      </div>
      <Input
        label="Insumo / tipo"
        required
        value={itemType}
        onChange={(event) => setItemType(event.target.value)}
      />
      <div className="grid grid-cols-2 gap-2">
        <Input
          label="Cantidad (opcional)"
          type="number"
          min="1"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
        />
        <Input
          label="Unidad (opcional)"
          value={unit}
          onChange={(event) => setUnit(event.target.value)}
        />
      </div>
      <Input
        label="Nota pública (opcional)"
        value={publicNote}
        onChange={(event) => setPublicNote(event.target.value)}
      />
      <Button type="submit" disabled={pending || !itemType.trim()}>
        {pending ? "Guardando…" : "Registrar necesidad"}
      </Button>
    </form>
  );
}
