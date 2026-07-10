export const NEED_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type Priority = (typeof NEED_PRIORITIES)[number];

export const NEED_CATEGORIES = [
  "hygiene",
  "water",
  "food",
  "clothing",
  "shelter",
  "medical",
  "tools",
  "other",
  "medicines",
  "medical_equipment",
  "medical_supplies",
  "medical_personnel",
] as const;
export type NeedCategory = (typeof NEED_CATEGORIES)[number];

export interface NeedItem {
  readonly name: string;
  readonly quantity: number;
  readonly unit: string | null;
  readonly category: NeedCategory;
}

/**
 * Contacto de quien origina la necesidad (publicación on-behalf-of). Auto-reportado
 * y sin verificar (`verified: false`); ResponseGrid lo trata como dato restringido,
 * no público. Solo viaja con consentimiento explícito del usuario.
 */
export interface Author {
  readonly name: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly note: string | null;
  readonly verified: boolean;
  readonly source: string;
}

/** Necesidad tal como llega del usuario: la dirección es texto sin geocodificar. */
export interface NewNeed {
  readonly title: string;
  readonly description: string | null;
  readonly priority: Priority;
  readonly address: string;
  readonly items: readonly NeedItem[];
  readonly author: Author | null;
}

export interface ResolvedLocation {
  readonly address: string;
  readonly latitude: number;
  readonly longitude: number;
}

export interface PublishedNeedRef {
  readonly id: string;
  readonly status: string;
}
