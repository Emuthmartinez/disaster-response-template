"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import MissingFoundForm, {
  type MissingFoundPayload,
} from "@/components/features/missing/MissingFoundForm";
import ImageZoomLightbox from "@/components/ui/ImageZoomLightbox";
import { mediaUrl } from "@/lib/api";
import { SITE_URL } from "@/lib/site";
import type { MissingPerson } from "@/lib/types";

function extractPhone(contact: string): string | null {
  const digits = contact.replace(/[^\d+]/g, "");
  return digits.replace(/\D/g, "").length >= 7 ? digits : null;
}

interface Props {
  person: MissingPerson;
  onClose: () => void;
  people?: MissingPerson[];
  onNavigate?: (person: MissingPerson) => void;
  onMarkFound?: (payload: MissingFoundPayload) => Promise<void>;
}

function shareUrl(_person: MissingPerson): string {
  if (typeof window === "undefined") return `${SITE_URL}/`;
  return `${window.location.origin}/#e-directory`;
}

function shareTitle(person: MissingPerson): string {
  return person.status === "found"
    ? `Ya encontraron a ${person.name}`
    : `Buscamos a ${person.name}`;
}

function shareText(person: MissingPerson): string {
  // Ya encontrada: el texto de búsqueda no aplica, se comparte la buena noticia.
  // Fraseo neutro en género ("encontraron a") porque la persona puede ser
  // hombre o mujer.
  if (person.status === "found") {
    return [
      `✅ ¡Buenas noticias! Ya encontraron a ${person.name}, está a salvo.`,
      "Gracias a todos por ayudar a difundir 🙏",
    ].join(" ");
  }
  const parts = [
    `🚨 Buscamos a ${person.name}`,
    person.age !== null ? `${person.age} años.` : null,
    person.nationality ? `Nacionalidad: ${person.nationality}.` : null,
    person.lastSeen ? `Visto por última vez en ${person.lastSeen}.` : null,
    "Si tienes información, ayuda a difundir 🙏",
  ].filter(Boolean);
  return parts.join(" ");
}

export default function MissingPersonDetail({
  person,
  onClose,
  people,
  onNavigate,
  onMarkFound,
}: Props) {
  const phone = extractPhone(person.contact);
  const [showFoundForm, setShowFoundForm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [zoomOpen, setZoomOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const currentIndex =
    people?.findIndex((entry) => entry.id === person.id) ?? -1;
  const hasNav =
    Boolean(people && people.length > 1 && onNavigate && currentIndex >= 0);
  const hasPrev = hasNav && currentIndex > 0;
  const hasNext = hasNav && people != null && currentIndex < people.length - 1;

  const goPrev = useCallback(() => {
    if (!hasPrev || !people || !onNavigate) return;
    onNavigate(people[currentIndex - 1]);
  }, [currentIndex, hasPrev, onNavigate, people]);

  const goNext = useCallback(() => {
    if (!hasNext || !people || !onNavigate) return;
    onNavigate(people[currentIndex + 1]);
  }, [currentIndex, hasNext, onNavigate, people]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setShowFoundForm(false);
      setCopied(false);
      setShareError(null);
      setZoomOpen(false);
    });
    return () => cancelAnimationFrame(id);
  }, [person.id]);

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

  const isFound = person.status === "found";
  const url = shareUrl(person);
  const text = shareText(person);
  const personMeta = [
    person.age !== null ? `${person.age} años` : null,
    person.nationality || null,
  ]
    .filter(Boolean)
    .join(" · ");

  const copyShare = useCallback(async () => {
    setShareError(null);
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setShareError("No se pudo copiar al portapapeles.");
    }
  }, [text, url]);

  const nativeShare = useCallback(async () => {
    if (!navigator.share) {
      copyShare();
      return;
    }
    try {
      await navigator.share({ title: shareTitle(person), text, url });
    } catch {
      /* el usuario canceló */
    }
  }, [copyShare, person, text, url]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartX.current === null || !hasNav) return;
      const endX = e.changedTouches[0]?.clientX;
      if (endX == null) return;
      const delta = endX - touchStartX.current;
      touchStartX.current = null;
      if (Math.abs(delta) < 48) return;
      if (delta > 0) goPrev();
      else goNext();
    },
    [goNext, goPrev, hasNav],
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="missing-detail-title"
      className="e-person-modal-backdrop"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="e-person-modal"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="e-person-modal__close"
        >
          ×
        </button>

        <div className="e-person-modal__hero">
          <div className="e-person-modal__photo-wrap">
            {!isFound ? (
              <span className="e-person-modal__status">DESAPARECIDA</span>
            ) : (
              <span className="e-person-modal__status !bg-blue-100 !text-blue-800">
                ENCONTRADA
              </span>
            )}

            {person.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={mediaUrl(person.photoUrl)}
                alt={`Foto de ${person.name}`}
                loading="lazy"
                decoding="async"
                className="e-person-modal__photo"
                onClick={() => setZoomOpen(true)}
              />
            ) : (
              <div
                className="e-person-modal__photo e-person-modal__photo--empty"
                aria-hidden
              >
                👤
              </div>
            )}
          </div>

          <h3 id="missing-detail-title" className="e-person-modal__title">
            {person.name}
          </h3>
          {personMeta && (
            <p className="e-person-modal__age">{personMeta}</p>
          )}
        </div>

        <div className="e-person-modal__body">
          <div className="e-person-modal__share">
            <button
              type="button"
              onClick={nativeShare}
              className="e-person-modal__share-btn"
            >
              <span aria-hidden>↗</span>
              {copied ? "Copiado" : "Compartir"}
            </button>
          </div>
          {shareError && (
            <p className="mt-1 text-center text-xs text-red-600">{shareError}</p>
          )}

          <div className="e-person-modal__details">
            {person.lastSeen && (
              <p className="e-person-modal__detail">
                <span aria-hidden>📍</span>
                <span>{person.lastSeen}</span>
              </p>
            )}
            {person.contact && !isFound && (
              <p className="e-person-modal__detail">
                <span aria-hidden>📞</span>
                {phone ? (
                  <a href={`tel:${phone}`}>{person.contact}</a>
                ) : (
                  <span>{person.contact}</span>
                )}
              </p>
            )}
          </div>

          {person.description && (
            <p className="e-person-modal__desc">{person.description}</p>
          )}

          {isFound ? (
            <div className="e-person-modal__found">
              <p>✓ Reportada como encontrada</p>
              {person.resolvedAt && (
                <p>El {new Date(person.resolvedAt).toLocaleString("es")}</p>
              )}
              {person.resolutionNote && (
                <p className="mt-2 whitespace-pre-wrap">{person.resolutionNote}</p>
              )}
              {person.resolutionPhotoUrl && (
                <a
                  href={mediaUrl(person.resolutionPhotoUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={mediaUrl(person.resolutionPhotoUrl)}
                    alt="Prueba de contacto"
                    loading="lazy"
                    decoding="async"
                    className="mt-2 max-h-48 w-full rounded-lg object-cover ring-1 ring-blue-200"
                  />
                </a>
              )}
            </div>
          ) : (
            onMarkFound && (
              <div className="e-person-modal__found">
                <p>¿Ya lograste comunicarte?</p>
                <p>
                  Márcala como encontrada y su familia podrá respirar tranquila.
                </p>
                <button
                  type="button"
                  onClick={() => setShowFoundForm(true)}
                  className="e-person-modal__found-btn"
                >
                  ✓ Marcar como encontrada
                </button>
              </div>
            )
          )}

          {hasNav && people && (
            <p
              className="mt-4 text-center text-[11px] text-[var(--etext3)]"
              aria-live="polite"
            >
              {currentIndex + 1} de {people.length}
              <span className="mx-2">·</span>
              Usa ← → para navegar
            </p>
          )}
        </div>
      </div>

      {showFoundForm && onMarkFound && (
        <MissingFoundForm
          personName={person.name}
          onCancel={() => setShowFoundForm(false)}
          onSubmit={async (payload) => {
            await onMarkFound(payload);
            setShowFoundForm(false);
          }}
        />
      )}

      {person.photoUrl && (
        <ImageZoomLightbox
          src={mediaUrl(person.photoUrl)!}
          alt={`Foto de ${person.name}`}
          isOpen={zoomOpen}
          onClose={() => setZoomOpen(false)}
        />
      )}
    </div>
  );
}
