import { deploymentConfig } from "@/lib/deployment-config";

export const TRANSLATE_LANGS = [
  { code: "en", label: "English", flag: "🇺🇸" },
  { code: "pt", label: "Português", flag: "🇧🇷" },
  { code: "es", label: "Español", flag: "🇪🇸" },
] as const;

export type TranslateLangCode = (typeof TRANSLATE_LANGS)[number]["code"];

const GOOGTRANS_COOKIE = "googtrans";

export function isTranslateLangCode(value: string): value is TranslateLangCode {
  return TRANSLATE_LANGS.some((lang) => lang.code === value);
}

/** Idioma fuente del sitio: la parte de idioma del languageTag configurado
 *  (config/deployment.config.json → languageTag, p.ej. "es" de "es-MX").
 *  Cae a "es" si el languageTag configurado no es uno de los idiomas
 *  soportados por el widget de traducción. */
const configuredSourceLang = deploymentConfig.languageTag.split("-")[0];
export const TRANSLATE_SOURCE_LANG: TranslateLangCode = isTranslateLangCode(
  configuredSourceLang,
)
  ? configuredSourceLang
  : "es";

/** Valor del cookie googtrans para un idioma destino (incl. `/es/es` = original). */
export function googTransCookieValue(targetLang: TranslateLangCode): string {
  return `/${TRANSLATE_SOURCE_LANG}/${targetLang}`;
}

/** Lee el idioma destino desde document.cookie (solo en browser). */
export function readGoogTransTarget(cookie: string): TranslateLangCode {
  const raw = cookie.match(/(?:^|;\s*)googtrans=([^;]*)/)?.[1]?.trim();
  if (!raw) return TRANSLATE_SOURCE_LANG;
  const decoded = decodeURIComponent(raw);
  if (!decoded || decoded === `/${TRANSLATE_SOURCE_LANG}/${TRANSLATE_SOURCE_LANG}`) {
    return TRANSLATE_SOURCE_LANG;
  }
  const match = decoded.match(
    new RegExp(`/${TRANSLATE_SOURCE_LANG}/(\\w{2})`),
  );
  const code = match?.[1];
  return code && isTranslateLangCode(code) ? code : TRANSLATE_SOURCE_LANG;
}

/** Dominio apex para el cookie (evita `.www.ejemplo.com`, inválido). */
export function apexCookieDomain(hostname: string): string | null {
  if (
    hostname === "localhost" ||
    /^\d+\.\d+\.\d+\.\d+$/.test(hostname) ||
    !hostname.includes(".")
  ) {
    return null;
  }
  const parts = hostname.split(".");
  if (parts.length < 2) return null;
  return `.${parts.slice(-2).join(".")}`;
}

export function googTransCookieAssignments(
  value: string,
  hostname: string,
): string[] {
  const base = `${GOOGTRANS_COOKIE}=${value};max-age=31536000;path=/`;
  const domain = apexCookieDomain(hostname);
  return domain ? [base, `${base};domain=${domain}`] : [base];
}

/** Interpreta el value del combo GT como idioma de la app. */
export function comboValueToLang(value: string): TranslateLangCode {
  if (!value || value === TRANSLATE_SOURCE_LANG) return TRANSLATE_SOURCE_LANG;
  return isTranslateLangCode(value) ? value : TRANSLATE_SOURCE_LANG;
}
