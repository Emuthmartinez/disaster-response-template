"use client";

/**
 * Ficha completa de una mascota, en modal. Espeja MissingPersonDetail (navegación
 * con flechas, compartir, zoom de foto, marcar como resuelta) con copy propio.
 */
import { useCallback, useEffect, useState } from "react";
import PetFoundForm, { type PetFoundPayload } from "./PetFoundForm";
import ImageZoomLightbox from "@/components/ui/ImageZoomLightbox";
import { mediaUrl } from "@/lib/api";
import { SITE_URL } from "@/lib/site";
import { petDisplayName, type Pet } from "@/lib/pets";

function extractPhone(contact: string): string | null {
  const digits = contact.replace(/[^\d+]/g, "");
  return digits.replace(/\D/g, "").length >= 7 ? digits : null;
}

interface Props {
  pet: Pet;
  onClose: () => void;
  pets?: Pet[];
  onNavigate?: (pet: Pet) => void;
  onMarkFound?: (payload: PetFoundPayload) => Promise<void>;
}

function shareUrl(): string {
  if (typeof window === "undefined") return `${SITE_URL}/`;
  return `${window.location.origin}/#mascotas`;
}

function shareText(pet: Pet): string {
  const name = petDisplayName(pet);
  if (pet.status === "found") {
    return `✅ ¡Buenas noticias! ${name} ya volvió a casa. Gracias por ayudar a difundir 🙏`;
  }
  return [
    `🐾 Se perdió ${name}`,
    pet.breed ? `${pet.breed}.` : null,
    pet.color ? `Color: ${pet.color}.` : null,
    pet.lastSeen ? `Vista por última vez en ${pet.lastSeen}.` : null,
    "Si la ves, ayuda a difundir 🙏",
  ]
    .filter(Boolean)
    .join(" ");
}

export default function PetDetail({
  pet,
  onClose,
  pets,
  onNavigate,
  onMarkFound,
}: Props) {
  const phone = extractPhone(pet.contact);
  const [showFoundForm, setShowFoundForm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);

  const displayName = petDisplayName(pet);
  const isFound = pet.status === "found";
  // mediaUrl devuelve `string | undefined`; se resuelve una vez para que tanto la
  // miniatura como el lightbox usen exactamente la misma URL ya normalizada.
  const photoSrc = mediaUrl(pet.photoUrl);

  const currentIndex = pets?.findIndex((entry) => entry.id === pet.id) ?? -1;
  const hasNav = Boolean(pets && pets.length > 1 && onNavigate && currentIndex >= 0);
  const hasPrev = hasNav && currentIndex > 0;
  const hasNext = hasNav && pets != null && currentIndex < pets.length - 1;

  const goPrev = useCallback(() => {
    if (!hasPrev || !pets || !onNavigate) return;
    onNavigate(pets[currentIndex - 1]);
  }, [currentIndex, hasPrev, onNavigate, pets]);

  const goNext = useCallback(() => {
    if (!hasNext || !pets || !onNavigate) return;
    onNavigate(pets[currentIndex + 1]);
  }, [currentIndex, hasNext, onNavigate, pets]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setShowFoundForm(false);
      setCopied(false);
      setZoomOpen(false);
    });
    return () => cancelAnimationFrame(id);
  }, [pet.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (showFoundForm) return;
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [goNext, goPrev, onClose, showFoundForm]);

  const handleShare = useCallback(async () => {
    const text = shareText(pet);
    const url = shareUrl();
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: displayName, text, url });
        return;
      } catch {
        // El usuario canceló el diálogo nativo: se cae al copiado silenciosamente.
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [displayName, pet]);

  const facts: { label: string; value: string }[] = [
    pet.species ? { label: "Especie", value: pet.species } : null,
    pet.breed ? { label: "Raza", value: pet.breed } : null,
    pet.color ? { label: "Color", value: pet.color } : null,
    pet.sex && pet.sex !== "desconocido"
      ? { label: "Sexo", value: pet.sex === "macho" ? "Macho" : "Hembra" }
      : null,
    pet.age !== null
      ? { label: "Edad", value: `${pet.age} ${pet.age === 1 ? "año" : "años"}` }
      : null,
    pet.lastSeen ? { label: "Zona", value: pet.lastSeen } : null,
  ].filter((f): f is { label: string; value: string } => f !== null);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pet-detail-title"
      onClick={onClose}
      className="fixed inset-0 z-[2000] flex items-end justify-center bg-slate-900/60 sm:items-center sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="pet-detail-title" className="text-lg font-bold text-slate-900">
              {displayName}
            </h3>
            <p className="mt-0.5 text-sm text-slate-500">
              {isFound ? "Ya volvió a casa" : "Reportada como perdida"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            ×
          </button>
        </div>

        {photoSrc && (
          <button
            type="button"
            onClick={() => setZoomOpen(true)}
            className="mt-4 block w-full"
            aria-label={`Ampliar la foto de ${displayName}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoSrc}
              alt={`Foto de ${displayName}`}
              className="max-h-72 w-full rounded-xl object-cover ring-1 ring-slate-200"
            />
          </button>
        )}

        {facts.length > 0 && (
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {facts.map((fact) => (
              <div key={fact.label}>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  {fact.label}
                </dt>
                <dd className="text-slate-800">{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {pet.hasMicrochip && (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
            Tiene <strong>microchip</strong> registrado. El número no se publica:
            pídeselo a quien la reporta para confirmar que es la misma mascota.
          </p>
        )}

        {pet.description && (
          <p className="mt-3 whitespace-pre-line text-sm text-slate-700">
            {pet.description}
          </p>
        )}

        {isFound && pet.resolutionNote && (
          <div className="mt-4 rounded-xl bg-emerald-50 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
              Cómo apareció
            </p>
            <p className="mt-1 whitespace-pre-line text-sm text-emerald-950">
              {pet.resolutionNote}
            </p>
          </div>
        )}

        {!isFound && pet.contact && (
          <div className="mt-4 rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Contacto
            </p>
            <p className="mt-1 text-sm text-slate-800">{pet.contact}</p>
            {phone && (
              <a
                href={`tel:${phone}`}
                className="mt-2 inline-flex rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
              >
                Llamar
              </a>
            )}
          </div>
        )}

        <div className="mt-5 flex flex-wrap justify-between gap-2">
          <div className="flex gap-2">
            {hasNav && (
              <>
                <button
                  type="button"
                  onClick={goPrev}
                  disabled={!hasPrev}
                  aria-label="Anterior"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 disabled:opacity-40"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  disabled={!hasNext}
                  aria-label="Siguiente"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 disabled:opacity-40"
                >
                  →
                </button>
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleShare}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {copied ? "¡Copiado!" : "Compartir"}
            </button>
            {!isFound && onMarkFound && (
              <button
                type="button"
                onClick={() => setShowFoundForm(true)}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Ya apareció
              </button>
            )}
          </div>
        </div>
      </div>

      {showFoundForm && onMarkFound && (
        <PetFoundForm
          petName={displayName}
          onCancel={() => setShowFoundForm(false)}
          onSubmit={onMarkFound}
        />
      )}

      {zoomOpen && photoSrc && (
        <ImageZoomLightbox
          src={photoSrc}
          alt={`Foto de ${displayName}`}
          isOpen={zoomOpen}
          onClose={() => setZoomOpen(false)}
        />
      )}
    </div>
  );
}
