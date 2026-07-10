import type {
  CollectionCenter,
  PublicStatus,
  VerificationLevel,
} from "../../domain/collection-center";
import type { ResponseGridResource } from "./responsegrid-client";

const COLLECTION_POINT_TYPE = "collection_point";
const PUBLIC_STATUSES: readonly PublicStatus[] = [
  "active",
  "saturated",
  "paused",
  "closed",
];
const VERIFICATION_LEVELS: readonly VerificationLevel[] = [
  "verified",
  "official",
];

/** Excluye venues/destinos (hospitales): solo puntos donde se DEJAN donaciones. */
export function isCollectionPoint(resource: ResponseGridResource): boolean {
  return (resource.type ?? "") === COLLECTION_POINT_TYPE;
}

export function toCollectionCenter(
  resource: ResponseGridResource,
): CollectionCenter {
  const location = resource.location ?? {};
  return {
    id: resource.id,
    name: trimToNull(resource.name) ?? "Centro de acopio",
    manager: trimToNull(resource.manager),
    location: {
      address: trimToNull(location.address),
      latitude: numberOrNull(location.latitude),
      longitude: numberOrNull(location.longitude),
    },
    city: trimToNull(resource.city),
    country: toCanonicalCountry(resource.country),
    accepts: toStringArray(resource.accepts),
    contact: trimToNull(resource.contact),
    schedule: trimToNull(resource.schedule),
    status: toAllowedValue(resource.publicStatus, PUBLIC_STATUSES, "active"),
    verificationLevel: toAllowedValue(
      resource.verificationLevel,
      VERIFICATION_LEVELS,
      "verified",
    ),
    disputed: Boolean(resource.disputed),
    description: trimToNull(resource.description),
  };
}

function trimToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length ? trimmed : null;
}

function numberOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" ? value : null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );
}

function toAllowedValue<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  const candidate = (value ?? "").trim() as T;
  return allowed.includes(candidate) ? candidate : fallback;
}

/** Title Case para fusionar duplicados por mayúsculas ("example country" → "Example Country"). */
function toCanonicalCountry(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  return trimmed
    .toLocaleLowerCase("es")
    .split(/\s+/)
    .map((word) => word.charAt(0).toLocaleUpperCase("es") + word.slice(1))
    .join(" ");
}
