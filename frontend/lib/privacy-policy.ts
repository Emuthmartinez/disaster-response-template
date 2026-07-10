/** Datos legales de la Política de Privacidad. Placeholders — reemplaza
 *  PRIVACY_CONTACT_PHONE y PRIVACY_COMPANY_ADDRESS con los datos reales del
 *  operador antes de publicar (no hay un valor genérico razonable para una
 *  dirección postal o teléfono legal). */
import { deploymentConfig } from "@/lib/deployment-config";

export const PRIVACY_EFFECTIVE_DATE = "1 de enero de 2026";
export const PRIVACY_CONTACT_EMAIL = deploymentConfig.contactEmail;
export const PRIVACY_CONTACT_PHONE = "[YOUR-ORG-PHONE]";
export const PRIVACY_COMPANY_NAME = deploymentConfig.orgName;
export const PRIVACY_COMPANY_ALIASES = deploymentConfig.domains.web;
export const PRIVACY_COMPANY_ADDRESS = "[YOUR-ORG-ADDRESS]";

export function privacyMailto(subject?: string): string {
  if (!subject) return `mailto:${PRIVACY_CONTACT_EMAIL}`;
  return `mailto:${PRIVACY_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

/** Clave en localStorage cuando el usuario acepta la política en el modal inicial. */
export const PRIVACY_CONSENT_STORAGE_KEY = "disaster-response-privacy-consent-v1";
