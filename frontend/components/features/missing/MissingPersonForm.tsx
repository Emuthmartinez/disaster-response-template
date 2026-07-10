"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { trackEvent } from "@/lib/openpanel";
import { useTurnstile } from "@/hooks/useTurnstile";
import {
  SearchIcon,
  PinIcon,
  UploadIcon,
  HospitalIcon,
  StreetIcon,
} from "./form-icons";
import {
  NATIONALITY_OPTIONS,
  formatLastSeen,
  buildDescription,
} from "./missing-form-helpers";
import { usePhotoUpload } from "@/hooks/usePhotoUpload";
import { MISSING_PHOTO_MAX_DIM } from "@/lib/image-resize";
import type {
  MissingReportType,
  FoundPlace,
  PersonStatus,
  MissingPersonPayload,
} from "./types";

export type {
  MissingReportType,
  FoundPlace,
  MissingPersonPayload,
} from "./types";


interface Props {
  onCancel: () => void;
  onSubmit: (payload: MissingPersonPayload) => Promise<void>;
  initialReportType?: MissingReportType;
  initialFoundPlace?: FoundPlace | null;
}

export default function MissingPersonForm({
  onCancel,
  onSubmit,
  initialReportType = "missing",
  initialFoundPlace = null,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const { mountRef: turnstileMount, getToken: turnstileGetToken } = useTurnstile();
  const [reportType, setReportType] =
    useState<MissingReportType>(initialReportType);
  const [foundPlace, setFoundPlace] = useState<FoundPlace | null>(
    initialFoundPlace,
  );
  const [personStatus, setPersonStatus] = useState<PersonStatus | null>(null);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [nationality, setNationality] = useState("");
  const [location, setLocation] = useState("");
  const [lastContactAt, setLastContactAt] = useState("");
  const [description, setDescription] = useState("");
  const [contact, setContact] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { fileRef: fileInputRef, photo, processing, handleFile } = usePhotoUpload({
    maxDim: MISSING_PHOTO_MAX_DIM,
    onError: setError,
  });

  const isMissing = reportType === "missing";

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [onCancel]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setError(null);
      if (!name.trim()) {
        setError("Indica el nombre de la persona.");
        return;
      }
      if (isMissing && !location.trim()) {
        setError("Indica la última ubicación vista.");
        return;
      }
      if (!isMissing) {
        if (!foundPlace) {
          setError("Indica dónde fue encontrada.");
          return;
        }
        if (!location.trim()) {
          setError("Indica el hospital o la zona donde la viste.");
          return;
        }
        if (!personStatus) {
          setError("Indica cuál es su estado actual.");
          return;
        }
      }
      if (!consent) {
        setError(
          "Debes confirmar que un familiar autoriza publicar estos datos.",
        );
        return;
      }
      setSubmitting(true);
      try {
        // Token FRESCO de Turnstile para este envío (se resetea tras leerlo).
        const turnstileToken = await turnstileGetToken();
        await onSubmit({
          name: name.trim(),
          age: age.trim(),
          nationality: nationality.trim(),
          lastSeen: formatLastSeen(
            location,
            lastContactAt,
            reportType,
            foundPlace ?? undefined,
          ),
          description: buildDescription(
            description,
            reportType,
            personStatus ?? undefined,
          ),
          contact: contact.trim(),
          photo,
          reportType,
          turnstileToken,
        });
        trackEvent("missing_person_created", {
          reportType,
          foundPlace: foundPlace ?? undefined,
          personStatus: personStatus ?? undefined,
          hasAge: Boolean(age.trim()),
          hasNationality: Boolean(nationality.trim()),
          hasLastSeen: Boolean(location.trim()),
          hasLastContactAt: Boolean(lastContactAt.trim()),
          hasDescription: Boolean(description.trim()),
          hasContact: Boolean(contact.trim()),
          hasPhoto: Boolean(photo),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar.");
        setSubmitting(false);
      }
    },
    [
      name,
      age,
      nationality,
      location,
      lastContactAt,
      description,
      contact,
      photo,
      consent,
      reportType,
      isMissing,
      foundPlace,
      personStatus,
      onSubmit,
      turnstileGetToken,
    ],
  );

  if (!mounted) return null;

  return createPortal(
    <div
      className="e-report-modal-backdrop fixed inset-0 z-[2000] flex items-start justify-center overflow-y-auto bg-black/55 p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="e-report-modal w-full max-w-[560px] max-h-[calc(100vh-3rem)] overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <header className="e-report-modal__header flex items-start justify-between gap-4 border-b border-[var(--eborder)] px-6 pb-4 pt-5">
          <div>
            <h2
              id="report-modal-title"
              className="e-report-modal__title text-lg font-extrabold text-[var(--etext)]"
            >
              Reportar persona desaparecida o encontrada
            </h2>
            <p className="e-report-modal__subtitle mt-1.5 text-[13px] leading-snug text-[var(--etext2)]">
              Comparte los datos para que alguien pueda ayudar a ubicarla o
              reunirla con su familia.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            data-track="missing_form_close"
            aria-label="Cerrar"
            className="e-report-modal__close grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--eborder)] bg-[var(--esurf2)] text-[var(--etext2)] hover:bg-[var(--einput)]"
          >
            ×
          </button>
        </header>

        <form
          onSubmit={handleSubmit}
          className="e-report-modal__form flex flex-col gap-4 px-6 py-5"
        >
          <fieldset className="e-report-modal__type border-0 p-0">
            <legend className="e-report-modal__label mb-1.5 block text-[13px] font-bold text-[var(--etext)]">
              ¿Qué quieres reportar? <span className="text-red-600">*</span>
            </legend>
            <div className="e-report-modal__type-grid grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setReportType("missing")}
                aria-pressed={isMissing}
                className={`e-report-modal__type-btn transition ${
                  isMissing
                    ? "is-active border-red-600 bg-red-600 text-white"
                    : "border-[var(--eborder)] bg-white text-[var(--etext)] hover:border-[var(--etext3)]"
                }`}
              >
                <SearchIcon className="e-report-modal__type-icon" />
                <span className="e-report-modal__type-copy">
                  <span className="e-report-modal__type-title">
                    Persona desaparecida
                  </span>
                  <span className="e-report-modal__type-hint">
                    No sé dónde está
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setReportType("found")}
                aria-pressed={!isMissing}
                className={`e-report-modal__type-btn transition ${
                  !isMissing
                    ? "is-active is-found border-indigo-600 bg-indigo-600 text-white"
                    : "border-[var(--eborder)] bg-white text-[var(--etext)] hover:border-[var(--etext3)]"
                }`}
              >
                <PinIcon className="e-report-modal__type-icon" />
                <span className="e-report-modal__type-copy">
                  <span className="e-report-modal__type-title">
                    Persona encontrada
                  </span>
                  <span className="e-report-modal__type-hint">
                    Sé dónde está o la vi
                  </span>
                </span>
              </button>
            </div>
          </fieldset>

          <div>
            <span className="e-report-modal__label mb-1.5 block text-[13px] font-bold text-[var(--etext)]">
              Foto de la persona
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFile}
              className="sr-only"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={processing}
              className="e-report-modal__upload flex w-full items-center gap-3.5 rounded-xl border-[1.5px] border-dashed border-[var(--eborder)] bg-[var(--esurf2)] p-4 text-left disabled:opacity-60"
            >
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photo}
                  alt="Vista previa"
                  className="h-10 w-10 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-50 text-[#c41a1a]">
                  <UploadIcon className="h-5 w-5" />
                </span>
              )}
              <span className="flex flex-col gap-0.5">
                <strong className="text-sm font-bold text-[var(--etext)]">
                  {processing
                    ? "Procesando…"
                    : photo
                      ? "Cambiar foto"
                      : "Cargar una foto"}
                </strong>
                <span className="text-xs text-[var(--etext2)]">
                  JPG o PNG · opcional pero muy útil
                </span>
              </span>
            </button>
          </div>

          <div className="e-report-modal__grid grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div>
              <label htmlFor="report-name" className="e-report-modal__label mb-1.5 block text-[13px] font-bold text-[var(--etext)]">
                Nombre y apellido <span className="text-red-600">*</span>
              </label>
              <input
                id="report-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                required
                placeholder="Ej. María Fernanda Rangel"
                className="e-input"
              />
            </div>
            <div>
              <label htmlFor="report-age" className="e-report-modal__label mb-1.5 block text-[13px] font-bold text-[var(--etext)]">
                Edad
              </label>
              <input
                id="report-age"
                type="number"
                inputMode="numeric"
                min={0}
                max={130}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="Años"
                className="e-input"
              />
            </div>
            <div className="e-report-modal__field--wide">
              <label htmlFor="report-nationality" className="e-report-modal__label mb-1.5 block text-[13px] font-bold text-[var(--etext)]">
                Nacionalidad
              </label>
              <input
                id="report-nationality"
                type="text"
                list="report-nationality-options"
                value={nationality}
                onChange={(e) => setNationality(e.target.value)}
                maxLength={80}
                placeholder="Ej. Venezolana"
                className="e-input"
              />
              <datalist id="report-nationality-options">
                {NATIONALITY_OPTIONS.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </div>
          </div>

          {isMissing ? (
            <div className="e-report-modal__grid grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div>
                <label htmlFor="report-location" className="e-report-modal__label mb-1.5 block text-[13px] font-bold text-[var(--etext)]">
                  Última ubicación vista{" "}
                  <span className="text-red-600">*</span>
                </label>
                <input
                  id="report-location"
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  maxLength={200}
                  required
                  placeholder="Ej. Nombre del sector, ciudad"
                  className="e-input"
                />
              </div>
              <div>
                <label htmlFor="report-when" className="e-report-modal__label mb-1.5 block text-[13px] font-bold text-[var(--etext)]">
                  Desde cuándo sin contacto
                </label>
                <input
                  id="report-when"
                  type="datetime-local"
                  value={lastContactAt}
                  onChange={(e) => setLastContactAt(e.target.value)}
                  className="e-input"
                />
              </div>
            </div>
          ) : (
            <>
              <fieldset className="border-0 p-0">
                <legend className="e-report-modal__label mb-1.5 block text-[13px] font-bold text-[var(--etext)]">
                  ¿Dónde fue encontrada?{" "}
                  <span className="text-red-600">*</span>
                </legend>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setFoundPlace("hospital")}
                    aria-pressed={foundPlace === "hospital"}
                    className={`flex items-center gap-2 rounded-xl border-[1.5px] px-3 py-2.5 text-left text-sm font-semibold transition ${
                      foundPlace === "hospital"
                        ? "border-[var(--m-blue-500)] bg-[var(--m-blue-50)] text-[var(--m-blue-700)]"
                        : "border-[var(--eborder)] bg-white text-[var(--etext)]"
                    }`}
                  >
                    <HospitalIcon className="h-4 w-4 shrink-0" />
                    En un hospital
                  </button>
                  <button
                    type="button"
                    onClick={() => setFoundPlace("street")}
                    aria-pressed={foundPlace === "street"}
                    className={`flex items-center gap-2 rounded-xl border-[1.5px] px-3 py-2.5 text-left text-sm font-semibold transition ${
                      foundPlace === "street"
                        ? "border-[var(--m-blue-500)] bg-[var(--m-blue-50)] text-[var(--m-blue-700)]"
                        : "border-[var(--eborder)] bg-white text-[var(--etext)]"
                    }`}
                  >
                    <StreetIcon className="h-4 w-4 shrink-0" />
                    En la calle
                  </button>
                </div>
              </fieldset>

              <div>
                <label htmlFor="report-found-location" className="e-report-modal__label mb-1.5 block text-[13px] font-bold text-[var(--etext)]">
                  {foundPlace === "hospital"
                    ? "Nombre del hospital o clínica"
                    : "Zona o referencia"}{" "}
                  <span className="text-red-600">*</span>
                </label>
                <input
                  id="report-found-location"
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  maxLength={200}
                  placeholder={
                    foundPlace === "hospital"
                      ? "Ej. Hospital Central"
                      : "Ej. Nombre del sector, cerca de…"
                  }
                  className="e-input"
                />
              </div>

              <div>
                <label htmlFor="report-found-when" className="e-report-modal__label mb-1.5 block text-[13px] font-bold text-[var(--etext)]">
                  Cuándo fue encontrada
                </label>
                <input
                  id="report-found-when"
                  type="datetime-local"
                  value={lastContactAt}
                  onChange={(e) => setLastContactAt(e.target.value)}
                  className="e-input"
                />
              </div>

              <fieldset className="border-0 p-0">
                <legend className="e-report-modal__label mb-1.5 block text-[13px] font-bold text-[var(--etext)]">
                  ¿Cuál es su estado actual?{" "}
                  <span className="text-red-600">*</span>
                </legend>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setPersonStatus("safe")}
                    aria-pressed={personStatus === "safe"}
                    className={`flex items-center gap-2 rounded-xl border-[1.5px] px-3 py-2.5 text-left text-sm font-semibold transition ${
                      personStatus === "safe"
                        ? "border-[var(--m-blue-500)] bg-[var(--m-blue-50)] text-[var(--m-blue-700)]"
                        : "border-[var(--eborder)] bg-white text-[var(--etext)]"
                    }`}
                  >
                    <span className="h-2.5 w-2.5 rounded-full bg-[var(--m-green-600)]" />
                    A salvo
                  </button>
                  <button
                    type="button"
                    onClick={() => setPersonStatus("deceased")}
                    aria-pressed={personStatus === "deceased"}
                    className={`flex items-center gap-2 rounded-xl border-[1.5px] px-3 py-2.5 text-left text-sm font-semibold transition ${
                      personStatus === "deceased"
                        ? "border-red-300 bg-red-50 text-red-800"
                        : "border-[var(--eborder)] bg-white text-[var(--etext)]"
                    }`}
                  >
                    <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                    Fallecida
                  </button>
                </div>
              </fieldset>
            </>
          )}

          <div>
            <label htmlFor="report-desc" className="e-report-modal__label mb-1.5 block text-[13px] font-bold text-[var(--etext)]">
              Descripción y señas particulares
            </label>
            <textarea
              id="report-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={600}
              rows={4}
              placeholder="Estatura, contextura, ropa que vestía, cicatrices, lentes, condición médica…"
              className="e-input resize-none"
            />
          </div>

          <div className="e-report-modal__contact rounded-xl bg-[#eef2f7] p-4">
            <label htmlFor="report-contact" className="e-report-modal__label mb-1.5 block text-[13px] font-bold text-[var(--etext)]">
              ¿Cómo te contactan si alguien la reconoce?
            </label>
            <input
              id="report-contact"
              type="text"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              maxLength={120}
              placeholder="Tu nombre y un teléfono o correo"
              className="e-input bg-white"
            />
          </div>

          <div className="e-report-modal__warning rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-950">
            <p className="e-report-modal__warning-title mb-3 flex items-center gap-1.5 font-extrabold text-amber-700">
              <span aria-hidden>⚠</span> Antes de publicar
            </p>
            <p className="mb-2">
              Esta información será <strong>visible públicamente</strong> y
              puede ser indexada por buscadores y replicada por plataformas
              aliadas con fines humanitarios.
            </p>
            <label className="e-report-modal__consent flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 accent-red-600"
              />
              <span>
                Confirmo que un familiar o allegado autoriza publicar estos
                datos para ayudar a localizar a la persona, y acepto los{" "}
                <a
                  href="/terminos"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-amber-900 underline hover:text-amber-950"
                >
                  Términos
                </a>{" "}
                y la{" "}
                <a
                  href="/privacidad"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-amber-900 underline hover:text-amber-950"
                >
                  Política de Privacidad
                </a>{" "}
                de Malla Net.
              </span>
            </label>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          {/* Turnstile (managed/invisible). Solo aparece si CF pide interacción. */}
          <div ref={turnstileMount} className="flex justify-center empty:hidden" />

          <footer className="e-report-modal__footer flex justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="e-btn e-btn-secondary min-h-0 px-5 py-2.5"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || processing || !consent}
              className="e-report-modal__submit inline-flex min-h-[42px] items-center gap-1.5 rounded-full bg-slate-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {submitting ? "Publicando…" : "Publicar reporte"}
              {!submitting && <span aria-hidden>→</span>}
            </button>
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  );
}
