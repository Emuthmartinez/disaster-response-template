"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import LegalConsentNotice from "@/components/content/LegalConsentNotice";
import { MAP_REPORT_TYPE_KEYS, REPORT_TYPES, type ReportType } from "@/lib/types";
import { trackEvent } from "@/lib/openpanel";
import { useTurnstile } from "@/hooks/useTurnstile";
import { usePhotoUpload } from "@/hooks/usePhotoUpload";
import { copyFor } from "./report-form-helpers";

interface ReportFormProps {
  /** Ubicación elegida, o null mientras el usuario aún no la define. */
  coords: { lat: number; lng: number } | null;
  onCancel: () => void;
  onCoordsChange?: (coords: { lat: number; lng: number }) => void;
  /** Oculta el modal sin desmontarlo (conserva lo escrito) mientras el usuario
   * elige el punto tocando el mapa. */
  hidden?: boolean;
  /** Solicita elegir la ubicación tocando el mapa. */
  onPickOnMap?: () => void;
  /** Quita la ubicación elegida (vuelve a "sin definir"). */
  onClearLocation?: () => void;
  onSubmit: (payload: {
    type: ReportType;
    place: string;
    affected: number;
    needs: string;
    photo: string | null;
    turnstileToken?: string;
  }) => Promise<void>;
}


export default function ReportForm({
  coords,
  onCancel,
  onCoordsChange,
  hidden = false,
  onPickOnMap,
  onClearLocation,
  onSubmit,
}: ReportFormProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const { mountRef: turnstileMount, getToken: turnstileGetToken } = useTurnstile();
  // Al abrir (o al volver de "elegir en el mapa") movemos el foco al modal para
  // que Esc lo cierre de inmediato, y por accesibilidad.
  useEffect(() => {
    if (!hidden) dialogRef.current?.focus({ preventScroll: true });
  }, [hidden]);

  const [type, setType] = useState<ReportType>("supplies");
  const [place, setPlace] = useState("");
  const [affected, setAffected] = useState("");
  const [needs, setNeeds] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const { fileRef: fileInputRef, photo, processing: processingPhoto, handleFile, clearPhoto } = usePhotoUpload({ onError: setError });

  const useMyLocation = useCallback(() => {
    trackEvent("report_use_geolocation");
    if (!("geolocation" in navigator)) {
      setGeoError("Tu navegador no soporta geolocalización.");
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onCoordsChange?.({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? "Permiso denegado. Activa la ubicación en los permisos del sitio."
            : "No se pudo obtener tu ubicación. Toca el mapa manualmente.",
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, [onCoordsChange]);

  const copy = copyFor(type);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!coords) {
      setError(
        "Elige la ubicación del reporte: tócala en el mapa o usa tu ubicación.",
      );
      return;
    }
    if (!place.trim()) {
      setError("Indica el nombre o dirección del lugar.");
      return;
    }
    setSubmitting(true);
    try {
      // Token FRESCO de Turnstile para este envío (se resetea tras leerlo).
      const turnstileToken = await turnstileGetToken();
      await onSubmit({
        type,
        place: place.trim(),
        affected: copy.showAffected ? Number(affected) || 0 : 0,
        needs: needs.trim(),
        photo,
        turnstileToken,
      });
      trackEvent("report_created", {
        reportType: type,
        affected: copy.showAffected ? Number(affected) || 0 : 0,
        hasPhoto: Boolean(photo),
        hasNeeds: Boolean(needs.trim()),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al publicar.");
      setSubmitting(false);
    }
  }

  return (
    <div
      className={`fixed inset-0 z-[2000] flex items-end justify-center bg-slate-900/60 p-0 sm:items-center sm:p-4 ${
        hidden ? "hidden" : ""
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="form-title"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-[var(--esurf)] p-5 shadow-xl outline-none sm:rounded-2xl sm:p-6"
      >
        <div className="mb-3 flex items-start justify-between">
          <h2 id="form-title" className="text-lg font-bold text-slate-900">
            🚨 Reportar Información
          </h2>
          <button
            type="button"
            onClick={onCancel}
            data-track="report_modal_close"
            aria-label="Cerrar"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            ×
          </button>
        </div>

        <div
          className={`mb-4 rounded-lg border p-3 ${
            coords
              ? "border-slate-200 bg-slate-50"
              : "border-amber-300 bg-amber-50"
          }`}
        >
          <p className="mb-2 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-700">
            <span aria-hidden>📍</span> Ubicación del reporte
            <span
              className={`font-normal ${coords ? "text-slate-500" : "text-amber-700"}`}
            >
              {coords
                ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`
                : "sin definir — elígela abajo"}
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            {onPickOnMap && (
              <button
                type="button"
                onClick={onPickOnMap}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                🗺️ Elegir en el mapa
              </button>
            )}
            {onCoordsChange && (
              <button
                type="button"
                onClick={useMyLocation}
                data-track="report_use_geolocation_click"
                disabled={locating}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                {locating ? "Localizando…" : "🛰️ Usar mi ubicación"}
              </button>
            )}
            {coords && onClearLocation && (
              <button
                type="button"
                onClick={onClearLocation}
                aria-label="Quitar la ubicación elegida"
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                ✕ Quitar
              </button>
            )}
          </div>
        </div>
        {geoError && (
          <p className="-mt-2 mb-3 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">
            {geoError}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <fieldset>
            <legend className="mb-2 block text-sm font-medium text-slate-700">
              Tipo de marcador
            </legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {MAP_REPORT_TYPE_KEYS.map((key) => {
                const meta = REPORT_TYPES[key];
                const active = type === key;
                return (
                  <label
                    key={key}
                    data-track="report_type_selected"
                    data-report-type={key}
                    className={`relative flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 p-3 text-center text-xs transition ${
                      active
                        ? "border-slate-900 bg-slate-50 shadow-sm"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                    style={
                      active
                        ? { borderColor: meta.color, background: `${meta.color}10` }
                        : undefined
                    }
                  >
                    <input
                      type="radio"
                      name="type"
                      value={key}
                      checked={active}
                      onChange={() => setType(key)}
                      className="sr-only"
                    />
                    <span
                      className="grid h-10 w-10 place-items-center rounded-full text-xl text-white shadow-sm"
                      style={{ background: meta.color }}
                      aria-hidden
                    >
                      {meta.icon}
                    </span>
                    <span className="font-semibold leading-tight text-slate-800">
                      {meta.label}
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {REPORT_TYPES[type].description}
            </p>
          </fieldset>

          <div>
            <label
              htmlFor="place"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              {copy.placeLabel}
            </label>
            <input
              id="place"
              type="text"
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              placeholder={copy.placePlaceholder}
              className="e-input"
              required
            />
          </div>

          {copy.showAffected && (
            <div>
              <label
                htmlFor="affected"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                {copy.affectedLabel}
              </label>
              <input
                id="affected"
                type="number"
                min={0}
                value={affected}
                onChange={(e) => setAffected(e.target.value)}
                placeholder="0"
                className="e-input"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="needs"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              {copy.needsLabel}
            </label>
            <textarea
              id="needs"
              value={needs}
              onChange={(e) => setNeeds(e.target.value)}
              rows={3}
              placeholder={copy.needsPlaceholder}
              className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            />
          </div>

          <div>
            <p className="mb-1 block text-sm font-medium text-slate-700">
              {type === "building"
                ? "Foto del edificio (muy recomendada)"
                : "Foto (opcional)"}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFile}
              className="hidden"
            />
            <div className="flex items-center gap-3">
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photo}
                  alt="Vista previa"
                  className="h-20 w-20 rounded-lg object-cover ring-1 ring-slate-200"
                />
              ) : (
                <div className="grid h-20 w-20 place-items-center rounded-lg bg-slate-100 text-2xl text-slate-400">
                  📷
                </div>
              )}
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={processingPhoto}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {processingPhoto
                    ? "Procesando…"
                    : photo
                      ? "Cambiar foto"
                      : "Subir foto"}
                </button>
                {photo && (
                  <button
                    type="button"
                    onClick={clearPhoto}
                    className="text-xs text-slate-500 hover:text-red-600"
                  >
                    Quitar
                  </button>
                )}
                <p className="text-[11px] text-slate-500">
                  {type === "building"
                    ? "Muestra grietas, inclinaciones, fachadas o columnas. Útil para que ingenieros evalúen."
                    : "Ayuda a los rescatistas a verificar la situación."}
                </p>
              </div>
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <div ref={turnstileMount} className="flex justify-center empty:hidden" />

          <LegalConsentNotice />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || processingPhoto}
              className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              {submitting ? "Publicando…" : "Reportar información"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
