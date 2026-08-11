import { SITE_URL } from "@/lib/site";

/**
 * Un solo punto de verdad para la ruta de la imagen social (Open Graph /
 * Twitter card), consumido por layout.tsx, lib/metadata.ts y lib/jsonld.ts.
 *
 * Por qué existe esta constante: X/WhatsApp/Telegram cachean la imagen de OG
 * por URL, básicamente para siempre. Si el arte cambia mientras la ruta sigue
 * siendo la misma, esas plataformas jamás refrescan la miniatura.
 *
 * El template genera esta imagen dinámicamente (app/opengraph-image.tsx, vía
 * next/og) a partir de config/deployment.config.json — así cada deployment
 * obtiene su propia tarjeta sin subir un binario editado a mano. Un
 * deployment real que reemplace esto por arte estático versionado (p.ej.
 * "/og-v2.jpg") debe subir el número de versión en el NOMBRE del archivo cada
 * vez que el arte cambie, precisamente por el problema de caché de arriba.
 */
export const OG_IMAGE_PATH = "/opengraph-image";
export const OG_IMAGE_URL = `${SITE_URL}${OG_IMAGE_PATH}`;
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;
export const OG_IMAGE_TYPE = "image/png";

export function ogImageMeta(alt: string) {
  return {
    url: OG_IMAGE_PATH,
    width: OG_IMAGE_WIDTH,
    height: OG_IMAGE_HEIGHT,
    type: OG_IMAGE_TYPE,
    alt,
  };
}
