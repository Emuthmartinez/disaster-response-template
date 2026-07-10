import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Crawlers de *entrenamiento* de IA: se bloquean a propósito. Política de
// privacidad humanitaria — los datos de la crisis no deben alimentar el
// entrenamiento de modelos. Los agentes de *recuperación en vivo* (OAI-SearchBot,
// ChatGPT-User, PerplexityBot, Perplexity-User, Claude-User, Claude-Web,
// Googlebot → Google AI Overviews) NO están aquí: caen en la regla "*" y SÍ
// pueden leer el sitio para responder a las personas en tiempo real.
// Mantener alineado con la configuración de Cloudflare (managed bots / content
// signals), que es la otra fuente de verdad en producción.
const AI_TRAINING_BOTS = [
  "GPTBot",
  "ClaudeBot",
  "anthropic-ai",
  "CCBot",
  "Google-Extended",
  "Bytespider",
  "Amazonbot",
  "Applebot-Extended",
  "meta-externalagent",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        // Buscadores y agentes de recuperación de IA: acceso permitido.
        // Los endpoints de API no se rastrean. NO listamos /admin a propósito:
        // ya es noindex y enumerarlo solo revelaría la ruta del panel.
        userAgent: "*",
        allow: "/",
        disallow: ["/api/"],
      },
      ...AI_TRAINING_BOTS.map((userAgent) => ({
        userAgent,
        disallow: "/",
      })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
