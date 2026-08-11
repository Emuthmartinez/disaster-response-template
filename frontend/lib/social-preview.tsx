import { ImageResponse } from "next/og";
import { deploymentConfig } from "@/lib/deployment-config";
import { BRAND_LOGO_DATA_URI, BRAND_LOGO_ASPECT } from "@/lib/generated/brand-logo";

export const SOCIAL_IMAGE_SIZE = { width: 1200, height: 630 } as const;
export const SOCIAL_IMAGE_TYPE = "image/png";

const LOGO_HEIGHT = 96;

/**
 * Open Graph / Twitter card, generada en runtime a partir de
 * config/deployment.config.json — cada deployment obtiene su propia tarjeta
 * sin subir un binario editado a mano.
 */
export async function createSocialPreviewImage(): Promise<ImageResponse> {
  // El logo va incrustado como data URI (generado en prebuild desde
  // app/icon.svg). NO leer aqui de disco con node:fs: en el Worker de
  // Cloudflare esos archivos no existen en tiempo de peticion y la ruta
  // devuelve 500. Ver scripts/generate-brand-logo.mjs.
  const logoSrc = BRAND_LOGO_DATA_URI;
  const logoWidth = Math.round(LOGO_HEIGHT * BRAND_LOGO_ASPECT);
  const domain = deploymentConfig.domains.web;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(135deg, #102a43 0%, #183b56 45%, #1e40af 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        {/* next/og ImageResponse requires <img>; next/image is not supported here */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoSrc}
          width={logoWidth}
          height={LOGO_HEIGHT}
          alt=""
          style={{
            display: "flex",
            objectFit: "contain",
            marginBottom: 32,
          }}
        />
        <div
          style={{
            display: "flex",
            fontSize: 56,
            fontWeight: 800,
            textAlign: "center",
          }}
        >
          {deploymentConfig.productName}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 16,
            fontSize: 28,
            opacity: 0.8,
            textAlign: "center",
          }}
        >
          {deploymentConfig.orgName}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 20,
            color: "#7fa8ff",
            fontWeight: 600,
          }}
        >
          {domain}
        </div>
      </div>
    ),
    { ...SOCIAL_IMAGE_SIZE },
  );
}
