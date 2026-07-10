import type { CollectionCenter } from "./collection-center";

export interface CollectionCenterCriteria {
  readonly country: string | null;
  readonly category: string | null;
  readonly text: string | null;
}

export function createCriteria(input: {
  country?: string | null;
  category?: string | null;
  text?: string | null;
}): CollectionCenterCriteria {
  return {
    country: blankToNull(input.country),
    category: blankToNull(input.category),
    text: blankToNull(input.text),
  };
}

export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}

export function satisfiesCriteria(
  center: CollectionCenter,
  criteria: CollectionCenterCriteria,
): boolean {
  if (criteria.country && center.country !== criteria.country) return false;
  if (criteria.category && !center.accepts.includes(criteria.category)) return false;
  if (!criteria.text) return true;
  return normalizeText(searchableText(center)).includes(normalizeText(criteria.text));
}

function searchableText(center: CollectionCenter): string {
  return [
    center.name,
    center.manager,
    center.location.address,
    center.city,
    center.country,
    center.accepts.join(" "),
  ]
    .filter(Boolean)
    .join(" ");
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length ? trimmed : null;
}
