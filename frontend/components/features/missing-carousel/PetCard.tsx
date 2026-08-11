"use client";

import { memo } from "react";
import { MapPin, PawPrint, BadgeCheck } from "lucide-react";
import { petDisplayName, type Pet } from "@/lib/pets";
import { mediaUrl } from "@/lib/api";

interface PetCardProps {
  pet: Pet;
  onOpen: () => void;
}

/** Reutiliza las clases `e-m-person-card*` a propósito: es la MISMA rejilla del
 *  directorio, así que compartir el estilo mantiene ambas pestañas coherentes sin
 *  duplicar CSS. Lo que cambia es el contenido, no la caja. */
function PetCardImpl({ pet, onOpen }: PetCardProps) {
  const isFound = pet.status === "found";
  const meta = [
    pet.breed || null,
    pet.color || null,
    pet.age !== null ? `${pet.age} ${pet.age === 1 ? "año" : "años"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const displayName = petDisplayName(pet);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`e-m-person-card${isFound ? " e-m-person-card--found" : ""}`}
      role="listitem"
    >
      <div className="e-m-person-card__media">
        <span
          className={`e-m-person-card__badge${isFound ? " e-m-person-card__badge--found" : ""}`}
        >
          {isFound ? "Reunida" : "Perdida"}
        </span>
        {pet.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mediaUrl(pet.photoUrl)}
            alt={`Foto de ${displayName}`}
            loading="lazy"
            className="e-m-person-card__photo"
          />
        ) : (
          <div className="e-m-person-card__photo e-m-person-card__photo--empty" aria-hidden>
            <PawPrint size={40} strokeWidth={1.5} />
          </div>
        )}
      </div>

      <div className="e-m-person-card__body">
        <h3 className="e-m-person-card__name" title={displayName}>
          {displayName}
        </h3>
        {meta && <p className="e-m-person-card__meta">{meta}</p>}

        {pet.lastSeen && (
          <p className="e-m-person-card__row">
            <MapPin size={14} strokeWidth={2} aria-hidden />
            <span>{pet.lastSeen}</span>
          </p>
        )}

        {/* El NÚMERO no se publica nunca; que exista chip sí, porque es lo que
            permite verificar a quien la reclame. Ver services/pets.ts. */}
        {pet.hasMicrochip && (
          <p className="e-m-person-card__row">
            <BadgeCheck size={14} strokeWidth={2} aria-hidden />
            <span>Tiene microchip</span>
          </p>
        )}

        <span className="e-m-person-card__cta">Ver detalles</span>
      </div>
    </button>
  );
}

export const PetCard = memo(PetCardImpl);
