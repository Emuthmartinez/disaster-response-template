import { ImageResponse } from "next/og";
import { deploymentConfig } from "@/lib/deployment-config";

// Imagen social (Open Graph) generada en runtime con next/og en vez de un
// binario estático versionado: cada deployment obtiene su propia imagen de
// vista previa a partir de config/deployment.config.json, sin necesidad de
// subir un asset editado a mano por evento/organización.

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function TwitterImage() {
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
        <div
          style={{
            display: "flex",
            width: 96,
            height: 96,
            borderRadius: 24,
            background: "#ffffff",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 32,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: "#1e40af",
            }}
          />
        </div>
        <div style={{ fontSize: 56, fontWeight: 800, textAlign: "center" }}>
          {deploymentConfig.productName}
        </div>
        <div
          style={{
            marginTop: 16,
            fontSize: 28,
            opacity: 0.8,
            textAlign: "center",
          }}
        >
          {deploymentConfig.orgName}
        </div>
      </div>
    ),
    { ...size },
  );
}
