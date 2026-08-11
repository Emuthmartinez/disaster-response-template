import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";
import PwaRegister from "@/components/layout/PwaRegister";
import PrivacyConsentGate from "@/components/layout/PrivacyConsentGate";
import OpenPanelProduction from "@/components/layout/OpenPanelProduction";
import ThemeProvider from "@/components/layout/ThemeProvider";
import QueryProvider from "@/components/layout/QueryProvider";
import { JsonLd } from "@/components/seo/JsonLd";
import {
  graph,
  organizationSchema,
  websiteSchema,
  ORG_ID,
} from "@/lib/jsonld";
import { SITE_URL, SITE_NAME, SITE_PRODUCT_NAME, SITE_BRAND_NAME } from "@/lib/site";
import { deploymentConfig } from "@/lib/deployment-config";
import { ogImageMeta } from "@/lib/og-image";

// Tipografías AUTO-ALOJADAS (ver app/fonts/README.md).
//
// Antes esto era `next/font/google`, que descarga los .woff2 desde Google en
// tiempo de BUILD. Un fallo de red transitorio rompe el build entero: pasó de
// verdad en un deployment real de este template (un run de CI falló con un
// error de módulo apuntando a la fuente de Google Fonts, y el mismo commit
// re-ejecutado sin tocar una línea pasó limpio). Si tu pipeline despliega a
// producción en cada push a `main` (el target por defecto en Cloudflare
// Workers, ver wrangler.jsonc), ese parpadeo de red tumba un despliegue de
// producción con una traza que parece un error de código. Con los ficheros
// versionados en app/fonts/, `next build` no habla con la red.
//
// Los nombres de las variables CSS (--font-display/--font-body) NO cambian:
// globals.css los consume y no hace falta tocar nada allí.
//
// `adjustFontFallback: "Arial"` es la capa anti-CLS: Next lee las métricas
// del fichero y genera un @font-face de fallback con ascent/descent/size-adjust
// ajustados, igual que hacía la versión de Google.
const nunito = localFont({
  // Variable (tiene tabla `fvar`): UN fichero cubre todo el rango de pesos,
  // por eso `weight` es un rango y no una lista.
  src: "./fonts/nunito-latin-variable.woff2",
  weight: "800 900",
  style: "normal",
  variable: "--font-display",
  display: "swap",
  adjustFontFallback: "Arial",
});

const sourceSans = localFont({
  src: "./fonts/source-sans-3-latin-variable.woff2",
  weight: "400 700",
  style: "normal",
  variable: "--font-body",
  display: "swap",
  adjustFontFallback: "Arial",
});

const SITE_TITLE = `${SITE_PRODUCT_NAME} · ${SITE_BRAND_NAME}`;
const SITE_DESC =
  "Reporte ciudadano en tiempo real para coordinar rescates, identificar daños estructurales y organizar la entrega de ayuda humanitaria durante la emergencia.";
const OPENPANEL_CLIENT_ID = process.env.NEXT_PUBLIC_OPENPANEL_CLIENT_ID;
// Google Analytics es opcional: sin ID configurado, el componente no se
// renderiza (ni el script se carga) en vez de reportar a una propiedad GA
// hardcodeada del deployment de origen. NUNCA pongas un ID real de fallback
// aquí — un fork que olvide configurar la env var reportaría su tráfico a la
// propiedad de otro deployment.
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

// Orígenes cross-origin que el navegador SIEMPRE golpea: el backend (datos de
// emergencia, vía fetch con credenciales) y el CDN R2 (fotos). Preconectar
// adelanta DNS+TCP+TLS para que el primer request no pague el handshake. Solo el
// origin (esquema+host), no la ruta. Guardado por si el env viene vacío/inválido.
function safeOrigin(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}
const API_ORIGIN = safeOrigin(process.env.NEXT_PUBLIC_API_URL);
const R2_ORIGIN = safeOrigin(process.env.NEXT_PUBLIC_R2_PUBLIC_BASE);

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: "/" },
  title: {
    default: SITE_TITLE,
    template: `%s · ${SITE_BRAND_NAME}`,
  },
  description: SITE_DESC,
  applicationName: SITE_NAME,
  manifest: "/manifest.webmanifest",
  // Set completo de rasters (favicon.ico/32/64, apple-touch-icon, icon-192/512)
  // ademas del SVG: iOS "añadir a inicio", varios launchers de Android y
  // algunos crawlers/previews sociales no leen SVG de forma fiable.
  // scripts/generate-icons.mjs genera este set a partir de app/icon.svg — si
  // no se ha corrido todavía, estas entradas apuntan a ficheros ausentes y el
  // navegador cae al siguiente icono declarado (o al SVG de abajo).
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-64.png", sizes: "64x64", type: "image/png" },
    ],
    shortcut: [{ url: "/favicon.ico", sizes: "any" }],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  keywords: [
    "emergencia",
    "desastre",
    "ayuda humanitaria",
    "rescate",
    "mapa de emergencia",
    "reporte ciudadano",
    "personas desaparecidas",
    "ONG",
  ],
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESC,
    locale: deploymentConfig.languageTag.replace("-", "_"),
    url: SITE_URL,
    images: [ogImageMeta(`${SITE_PRODUCT_NAME} · ${SITE_BRAND_NAME} — mapa y reportes ciudadanos`)],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESC,
    images: [
      ogImageMeta(`${SITE_PRODUCT_NAME} · ${SITE_BRAND_NAME} — mapa y reportes ciudadanos`).url,
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#EEF2F7" },
    { media: "(prefers-color-scheme: dark)", color: "#0B1526" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = graph(
    organizationSchema(),
    websiteSchema(SITE_DESC),
    {
      "@type": "EmergencyService",
      name: "Plataforma ciudadana de coordinación de rescate",
      areaServed: { "@type": "Place", name: deploymentConfig.regionLabel },
      url: SITE_URL,
      provider: { "@id": ORG_ID },
    },
  );
  return (
    <html
      lang={deploymentConfig.languageTag}
      data-dark="false"
      className={`${nunito.variable} ${sourceSans.variable} e-shell-html`}
      suppressHydrationWarning
    >
      <head>
        {/* Preconexión a los orígenes cross-origin críticos. El backend va con
            credenciales (cookies) → use-credentials; el CDN R2 es anónimo. */}
        {API_ORIGIN && (
          <link
            rel="preconnect"
            href={API_ORIGIN}
            crossOrigin="use-credentials"
          />
        )}
        {R2_ORIGIN && (
          <link rel="preconnect" href={R2_ORIGIN} crossOrigin="anonymous" />
        )}
      </head>
      <body className="e-shell-body">
        <ThemeProvider />
        <a href="#main" className="e-shell-skip-link">
          Saltar al contenido
        </a>
        <div aria-hidden className="e-shell-flag-bar" />

        {OPENPANEL_CLIENT_ID && (
          <OpenPanelProduction clientId={OPENPANEL_CLIENT_ID} />
        )}

        <QueryProvider>
          <PrivacyConsentGate>{children}</PrivacyConsentGate>
        </QueryProvider>
        <PwaRegister />
        <JsonLd data={jsonLd} />
      </body>
      {GA_MEASUREMENT_ID && <GoogleAnalytics gaId={GA_MEASUREMENT_ID} />}
    </html>
  );
}
