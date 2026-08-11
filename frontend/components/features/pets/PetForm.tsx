"use client";

/**
 * Formulario de reporte de mascota (perdida o encontrada). Espeja la estructura
 * de MissingPersonForm —mismo modal, mismos primitivos de foto/Turnstile/consent—
 * pero NO es el mismo formulario, y las diferencias son deliberadas:
 *
 *  - El NOMBRE no es obligatorio. Quien encuentra un animal casi nunca lo sabe;
 *    exigirlo produciría fichas llamadas "Perro1" en vez de datos útiles. Lo que
 *    se exige es que haya ALGO con lo que reconocerlo: nombre, descripción o foto.
 *  - El consentimiento es distinto: aquí no se publican datos de un tercero, solo
 *    los del propio animal y el contacto de quien reporta.
 *  - El microchip se pide pero se advierte que NO se publica (el backend solo
 *    expone `hasMicrochip`); es lo que permite verificar a quien la reclame.
 */
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { trackEvent } from "@/lib/openpanel";
import { useTurnstile } from "@/hooks/useTurnstile";
import { usePhotoUpload } from "@/hooks/usePhotoUpload";
import { MISSING_PHOTO_MAX_DIM } from "@/lib/image-resize";
import { usePrivacyConsent } from "@/components/layout/PrivacyConsentGate";
import { useGeocodeSearch } from "@/hooks/geocode";
import { deploymentConfig } from "@/lib/deployment-config";
import { PET_SEX_OPTIONS, PET_SPECIES_OPTIONS } from "@/lib/pets";
import { SearchIcon, PinIcon, UploadIcon } from "@/components/features/missing/form-icons";
import type { PetPayload, PetReportType } from "./types";

export type { PetPayload, PetReportType } from "./types";

interface Props {
  onCancel: () => void;
  onSubmit: (payload: PetPayload) => Promise<void>;
  initialReportType?: PetReportType;
}

/** Compone la zona + el momento en una sola línea, igual que formatLastSeen
 *  hace para personas. Mantiene el dato legible sin añadir columnas. */
function formatLastSeen(
  location: string,
  when: string,
  reportType: PetReportType,
): string {
  const place = location.trim();
  if (!place) return "";
  if (!when) return place;
  const date = new Date(when);
  if (Number.isNaN(date.getTime())) return place;
  const stamp = date.toLocaleString("es", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return reportType === "missing"
    ? `${place} · vista por última vez ${stamp}`
    : `${place} · encontrada ${stamp}`;
}

export default function PetForm({
  onCancel,
  onSubmit,
  initialReportType = "missing",
}: Props) {
  const { ensureConsent } = usePrivacyConsent();
  const [mounted, setMounted] = useState(false);
  const geocode = useGeocodeSearch();
  const { mountRef: turnstileMount, getToken: turnstileGetToken } = useTurnstile();
  const [reportType, setReportType] = useState<PetReportType>(initialReportType);
  const [name, setName] = useState("");
  const [species, setSpecies] = useState<string>("perro");
  const [breed, setBreed] = useState("");
  const [color, setColor] = useState("");
  const [sex, setSex] = useState<string | null>(null);
  const [age, setAge] = useState("");
  const [location, setLocation] = useState("");
  const [when, setWhen] = useState("");
  const [description, setDescription] = useState("");
  const [contact, setContact] = useState("");
  const [microchip, setMicrochip] = useState("");
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

      // Consentimiento ANTES de enviar nada. Ver PrivacyConsentGate.
      if (!(await ensureConsent())) return;
      setError(null);

      // La regla que importa: la ficha tiene que servir para RECONOCER al animal.
      // Un registro sin nombre, sin descripción y sin foto es ruido en el
      // directorio, así que se exige al menos uno de los tres (mismo criterio que
      // aplica el backend, repetido aquí para dar el error sin ida y vuelta).
      if (!name.trim() && !description.trim() && !photo) {
        setError(
          "Añade al menos un nombre, una descripción o una foto: sin eso nadie puede reconocerla.",
        );
        return;
      }
      if (!location.trim()) {
        setError(
          isMissing
            ? "Indica dónde se perdió."
            : "Indica dónde la encontraste.",
        );
        return;
      }
      if (!contact.trim()) {
        setError("Deja un contacto: sin él nadie puede avisarte si la ve.");
        return;
      }
      if (!consent) {
        setError("Confirma que aceptas publicar este reporte.");
        return;
      }

      setSubmitting(true);
      try {
        // Geocodificación BEST-EFFORT de la zona escrita, para que la mascota
        // salga también en el mapa. Si falla (sin red, sin resultados, servicio
        // caído) se envía sin coordenadas: perder el reporte por no poder poner
        // un pin sería mucho peor que no ponerlo.
        let coords: { lat: number; lng: number } | null = null;
        try {
          const [biasLat, biasLng] = deploymentConfig.mapCenter;
          const geo = await geocode.mutateAsync({
            q: location.trim(),
            bias: { lat: biasLat, lng: biasLng },
          });
          const hit = geo.results?.[0];
          if (hit) coords = { lat: hit.lat, lng: hit.lng };
        } catch {
          coords = null;
        }

        // Token FRESCO de Turnstile para este envío (se resetea tras leerlo).
        const turnstileToken = await turnstileGetToken();
        await onSubmit({
          name: name.trim(),
          species,
          breed: breed.trim(),
          color: color.trim(),
          sex,
          age: age.trim(),
          lastSeen: formatLastSeen(location, when, reportType),
          description: description.trim(),
          contact: contact.trim(),
          microchip: microchip.trim() || null,
          photo,
          reportType,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
          turnstileToken,
        });
        trackEvent("pet_report_created", {
          reportType,
          species,
          hasName: Boolean(name.trim()),
          hasBreed: Boolean(breed.trim()),
          hasColor: Boolean(color.trim()),
          hasAge: Boolean(age.trim()),
          hasDescription: Boolean(description.trim()),
          hasMicrochip: Boolean(microchip.trim()),
          hasPhoto: Boolean(photo),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar.");
        setSubmitting(false);
      }
    },
    [
      name,
      species,
      breed,
      color,
      sex,
      age,
      location,
      when,
      description,
      contact,
      microchip,
      photo,
      consent,
      reportType,
      isMissing,
      onSubmit,
      turnstileGetToken,
      ensureConsent,
      geocode,
    ],
  );

  if (!mounted) return null;

  return createPortal(
    <div
      className="e-report-modal-backdrop fixed inset-0 z-[2000] flex items-start justify-center overflow-y-auto bg-black/55 p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pet-modal-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="e-report-modal w-full max-w-[560px] max-h-[calc(100vh-3rem)] overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <header className="e-report-modal__header flex items-start justify-between gap-4 border-b border-[var(--eborder)] px-6 pb-4 pt-5">
          <div>
            <h2
              id="pet-modal-title"
              className="e-report-modal__title text-lg font-extrabold text-[var(--etext)]"
            >
              Reportar mascota perdida o encontrada
            </h2>
            <p className="e-report-modal__subtitle mt-1.5 text-[13px] leading-snug text-[var(--etext2)]">
              Comparte los datos para que alguien pueda reconocerla y devolverla
              a su casa.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            data-track="pet_form_close"
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
                  <span className="e-report-modal__type-title">Se me perdió</span>
                  <span className="e-report-modal__type-hint">No sé dónde está</span>
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
                  <span className="e-report-modal__type-title">Encontré una</span>
                  <span className="e-report-modal__type-hint">
                    Está conmigo o la vi
                  </span>
                </span>
              </button>
            </div>
          </fieldset>

          <div>
            <span className="e-report-modal__label mb-1.5 block text-[13px] font-bold text-[var(--etext)]">
              Foto de la mascota
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
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-50 text-[#ce1126]">
                  <UploadIcon className="h-5 w-5" />
                </span>
              )}
              <span className="flex flex-col gap-0.5">
                <strong className="text-sm font-bold text-[var(--etext)]">
                  {processing ? "Procesando…" : photo ? "Cambiar foto" : "Cargar una foto"}
                </strong>
                <span className="text-xs text-[var(--etext2)]">
                  JPG o PNG · es lo que más ayuda a reconocerla
                </span>
              </span>
            </button>
          </div>

          <fieldset className="border-0 p-0">
            <legend className="e-report-modal__label mb-1.5 block text-[13px] font-bold text-[var(--etext)]">
              Especie <span className="text-red-600">*</span>
            </legend>
            <div className="grid grid-cols-4 gap-2">
              {PET_SPECIES_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSpecies(option.value)}
                  aria-pressed={species === option.value}
                  className={`flex flex-col items-center gap-1 rounded-xl border-[1.5px] px-2 py-2.5 text-xs font-semibold transition ${
                    species === option.value
                      ? "border-[var(--m-blue-500)] bg-[var(--m-blue-50)] text-[var(--m-blue-700)]"
                      : "border-[var(--eborder)] bg-white text-[var(--etext)]"
                  }`}
                >
                  <span aria-hidden className="text-base">
                    {option.icon}
                  </span>
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="e-report-modal__grid grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div>
              <label
                htmlFor="pet-name"
                className="e-report-modal__label mb-1.5 block text-[13px] font-bold text-[var(--etext)]"
              >
                Nombre
              </label>
              <input
                id="pet-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                placeholder={isMissing ? "Ej. Firulais" : "Si lo sabes"}
                className="e-input"
              />
            </div>
            <div>
              <label
                htmlFor="pet-age"
                className="e-report-modal__label mb-1.5 block text-[13px] font-bold text-[var(--etext)]"
              >
                Edad aproximada
              </label>
              <input
                id="pet-age"
                type="number"
                inputMode="numeric"
                min={0}
                max={120}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="Años"
                className="e-input"
              />
            </div>
            <div>
              <label
                htmlFor="pet-breed"
                className="e-report-modal__label mb-1.5 block text-[13px] font-bold text-[var(--etext)]"
              >
                Raza
              </label>
              <input
                id="pet-breed"
                type="text"
                value={breed}
                onChange={(e) => setBreed(e.target.value)}
                maxLength={80}
                placeholder="Ej. Criollo, mestizo…"
                className="e-input"
              />
            </div>
            <div>
              <label
                htmlFor="pet-color"
                className="e-report-modal__label mb-1.5 block text-[13px] font-bold text-[var(--etext)]"
              >
                Color
              </label>
              <input
                id="pet-color"
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                maxLength={80}
                placeholder="Ej. Marrón con blanco"
                className="e-input"
              />
            </div>
          </div>

          <fieldset className="border-0 p-0">
            <legend className="e-report-modal__label mb-1.5 block text-[13px] font-bold text-[var(--etext)]">
              Sexo
            </legend>
            <div className="grid grid-cols-3 gap-2">
              {PET_SEX_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSex(sex === option.value ? null : option.value)}
                  aria-pressed={sex === option.value}
                  className={`rounded-xl border-[1.5px] px-3 py-2.5 text-sm font-semibold transition ${
                    sex === option.value
                      ? "border-[var(--m-blue-500)] bg-[var(--m-blue-50)] text-[var(--m-blue-700)]"
                      : "border-[var(--eborder)] bg-white text-[var(--etext)]"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="e-report-modal__grid grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div>
              <label
                htmlFor="pet-location"
                className="e-report-modal__label mb-1.5 block text-[13px] font-bold text-[var(--etext)]"
              >
                {isMissing ? "Dónde se perdió" : "Dónde la encontraste"}{" "}
                <span className="text-red-600">*</span>
              </label>
              <input
                id="pet-location"
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
              <label
                htmlFor="pet-when"
                className="e-report-modal__label mb-1.5 block text-[13px] font-bold text-[var(--etext)]"
              >
                {isMissing ? "Desde cuándo" : "Cuándo la encontraste"}
              </label>
              <input
                id="pet-when"
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                className="e-input"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="pet-desc"
              className="e-report-modal__label mb-1.5 block text-[13px] font-bold text-[var(--etext)]"
            >
              Descripción y señas particulares
            </label>
            <textarea
              id="pet-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={600}
              rows={4}
              placeholder="Tamaño, collar, manchas, cicatrices, si es miedosa, si necesita medicación…"
              className="e-input resize-none"
            />
          </div>

          <div>
            <label
              htmlFor="pet-microchip"
              className="e-report-modal__label mb-1.5 block text-[13px] font-bold text-[var(--etext)]"
            >
              Número de microchip
            </label>
            <input
              id="pet-microchip"
              type="text"
              value={microchip}
              onChange={(e) => setMicrochip(e.target.value)}
              maxLength={40}
              placeholder="Si lo tiene"
              className="e-input"
            />
            <p className="mt-1.5 text-xs text-[var(--m-gray-500)]">
              No se publica. Solo se muestra que la mascota tiene chip, para poder
              verificar a quien la reclame.
            </p>
          </div>

          <div className="e-report-modal__contact rounded-xl bg-[#eef2f7] p-4">
            <label
              htmlFor="pet-contact"
              className="e-report-modal__label mb-1.5 block text-[13px] font-bold text-[var(--etext)]"
            >
              ¿Cómo te contactan si alguien la ve?{" "}
              <span className="text-red-600">*</span>
            </label>
            <input
              id="pet-contact"
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
              Este reporte —incluido el contacto que dejes— será{" "}
              <strong>visible públicamente</strong> y puede ser indexado por
              buscadores.
            </p>
            <label className="e-report-modal__consent flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 accent-red-600"
              />
              <span>
                Acepto publicar este reporte y mi contacto, y acepto los{" "}
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
