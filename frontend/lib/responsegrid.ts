/**
 * URLs públicas de la emergencia en ResponseGrid / Global Emergency. El slug
 * y el WhatsApp de donación son específicos de CADA emergencia real — no hay
 * un valor genérico razonable, así que se leen de env y todo lo que depende
 * de ellos degrada con normalidad cuando faltan (ver hooks/acopio.ts y
 * components/features/responsegrid/ResponseGridHub.tsx).
 */
export const RESPONSEGRID_EMERGENCY_SLUG =
  process.env.NEXT_PUBLIC_RESPONSEGRID_SLUG ?? "";

export const RESPONSEGRID_BASE_URL = "https://responsegrid.app";

export const RESPONSEGRID_EMERGENCY_URL = RESPONSEGRID_EMERGENCY_SLUG
  ? `${RESPONSEGRID_BASE_URL}/e/${RESPONSEGRID_EMERGENCY_SLUG}`
  : "";

export const RESPONSEGRID_LOGIN_URL = RESPONSEGRID_EMERGENCY_SLUG
  ? `${RESPONSEGRID_BASE_URL}/login?next=${encodeURIComponent(`/e/${RESPONSEGRID_EMERGENCY_SLUG}`)}`
  : "";

/** Formularios operativos de la emergencia en ResponseGrid. Cadena vacía
 *  cuando no hay slug configurado — los consumidores deben ocultar el CTA. */
export const RESPONSEGRID_DONATE_URL = RESPONSEGRID_EMERGENCY_URL
  ? `${RESPONSEGRID_EMERGENCY_URL}/donar`
  : "";
export const RESPONSEGRID_REQUEST_URL = RESPONSEGRID_EMERGENCY_URL
  ? `${RESPONSEGRID_EMERGENCY_URL}/peticion`
  : "";
export const RESPONSEGRID_VOLUNTEER_URL = RESPONSEGRID_EMERGENCY_URL
  ? `${RESPONSEGRID_EMERGENCY_URL}/voluntario`
  : "";
export const RESPONSEGRID_REGISTER_POINT_URL = RESPONSEGRID_EMERGENCY_URL
  ? `${RESPONSEGRID_EMERGENCY_URL}/registrar`
  : "";
export const RESPONSEGRID_TRANSPORT_URL = RESPONSEGRID_EMERGENCY_URL
  ? `${RESPONSEGRID_EMERGENCY_URL}/ofrecer-transporte`
  : "";

export const RESPONSEGRID_OFFER_HELP_URL = RESPONSEGRID_DONATE_URL;

export const RESPONSEGRID_REQUEST_HELP_URL = RESPONSEGRID_REQUEST_URL;

/** Donaciones monetarias coordinadas por WhatsApp. Vacío por defecto — cada
 *  deployment configura NEXT_PUBLIC_RESPONSEGRID_WHATSAPP_URL con su propio
 *  número/enlace real. */
export const RESPONSEGRID_DONATE_WHATSAPP_URL =
  process.env.NEXT_PUBLIC_RESPONSEGRID_WHATSAPP_URL ?? "";
