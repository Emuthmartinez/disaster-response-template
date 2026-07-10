import type { Metadata, Viewport } from "next";
import { Nunito, Source_Sans_3 } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";
import PwaRegister from "@/components/layout/PwaRegister";
import PrivacyConsentGate from "@/components/layout/PrivacyConsentGate";
import OpenPanelProduction from "@/components/layout/OpenPanelProduction";
import ThemeProvider from "@/components/layout/ThemeProvider";
import QueryProvider from "@/components/layout/QueryProvider";
import { JsonLd } from "@/components/seo/JsonLd";
import { graph, organizationSchema, ORG_ID, WEBSITE_ID } from "@/lib/jsonld";
import { SITE_URL, SITE_LOGO, SITE_NAME, SITE_PRODUCT_NAME, SITE_BRAND_NAME } from "@/lib/site";
import { deploymentConfig } from "@/lib/deployment-config";

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["800", "900"],
  variable: "--font-display",
  display: "swap",
});

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

const SITE_TITLE = `${SITE_PRODUCT_NAME} · ${SITE_BRAND_NAME}`;
const SITE_DESC =
  "Reporte ciudadano en tiempo real para coordinar rescates, identificar daños estructurales y organizar la entrega de ayuda humanitaria durante la emergencia.";
const OPENPANEL_CLIENT_ID = process.env.NEXT_PUBLIC_OPENPANEL_CLIENT_ID;
// Google Analytics es opcional: sin ID configurado, el componente no se
// renderiza (ni el script se carga) en vez de reportar a una propiedad GA
// hardcodeada del deployment de origen.
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
  icons: {
    icon: [{ url: SITE_LOGO, type: "image/svg+xml" }],
    shortcut: SITE_LOGO,
    apple: SITE_LOGO,
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
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESC,
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
    {
      "@type": "WebSite",
      "@id": WEBSITE_ID,
      name: SITE_NAME,
      url: SITE_URL,
      inLanguage: deploymentConfig.languageTag,
      description: SITE_DESC,
      publisher: { "@id": ORG_ID },
    },
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
