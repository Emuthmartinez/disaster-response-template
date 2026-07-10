/**
 * Helpers de normalización compartidos por el motor de sync y los adaptadores.
 * Mantienen los mismos límites que `lib/missing.ts` / `scripts/import-missing.mjs`.
 */

import { MAX_NAME, MAX_DESCRIPTION, MAX_LAST_SEEN, MAX_CONTACT } from "../../src/services/missing";

export { MAX_NAME, MAX_DESCRIPTION, MAX_LAST_SEEN, MAX_CONTACT };

/** Recorta a `max` caracteres; null/undefined -> "" (la columna es NOT NULL). */
export function clip(value: unknown, max: number): string {
  if (value === null || value === undefined) return "";
  const s = String(value).trim();
  return s.length > max ? s.slice(0, max) : s;
}

/** Edad válida [0,130] o null. */
export function normalizeAge(age: unknown): number | null {
  if (age === null || age === undefined || age === "") return null;
  const n = Math.trunc(Number(age));
  if (!Number.isFinite(n) || n < 0 || n > 130) return null;
  return n;
}

/** Parsea un valor a epoch-ms: acepta número (ms) o string de fecha. */
export function toEpochMs(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const t = Date.parse(String(value));
  return Number.isFinite(t) ? t : null;
}

/** URL http(s) absoluta recortada, o null. */
export function httpUrlOrNull(value: unknown, max = 600): string | null {
  if (typeof value !== "string") return null;
  return /^https?:\/\//i.test(value) ? value.slice(0, max) : null;
}
