"use client";

import { memo } from "react";
import { MapPin, User } from "lucide-react";
import type { MissingPerson } from "@/hooks/missing";
import { mediaUrl } from "@/lib/api";

interface MissingPersonCardProps {
  person: MissingPerson;
  onOpen: () => void;
}

function MissingPersonCardImpl({ person, onOpen }: MissingPersonCardProps) {
  const isFound = person.status === "found";
  const personMeta = [
    person.age !== null ? `${person.age} años` : null,
    person.nationality || null,
  ]
    .filter(Boolean)
    .join(" · ");

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
          {isFound ? "Encontrada" : "Desaparecida"}
        </span>
        {person.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mediaUrl(person.photoUrl)}
            alt={`Foto de ${person.name}`}
            loading="lazy"
            className="e-m-person-card__photo"
          />
        ) : (
          <div className="e-m-person-card__photo e-m-person-card__photo--empty" aria-hidden>
            <User size={40} strokeWidth={1.5} />
          </div>
        )}
      </div>

      <div className="e-m-person-card__body">
        <h3 className="e-m-person-card__name" title={person.name}>
          {person.name}
        </h3>
        {personMeta && <p className="e-m-person-card__meta">{personMeta}</p>}

        {person.lastSeen && (
          <p className="e-m-person-card__row">
            <MapPin size={14} strokeWidth={2} aria-hidden />
            <span>{person.lastSeen}</span>
          </p>
        )}

        <span className="e-m-person-card__cta">Ver detalles</span>
      </div>
    </button>
  );
}

export const MissingPersonCard = memo(MissingPersonCardImpl);
