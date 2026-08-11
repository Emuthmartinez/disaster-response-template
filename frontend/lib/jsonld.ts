import { SITE_URL, SITE_NAME, SITE_LOGO, CONTACT_EMAIL } from "@/lib/site";
import { deploymentConfig } from "@/lib/deployment-config";
import { OG_IMAGE_URL } from "@/lib/og-image";

// Constructores de JSON-LD (schema.org) compartidos. Centralizan el marcado
// estructurado para que buscadores y agentes de IA (ChatGPT, Gemini, Claude,
// Perplexity) reconozcan la entidad y el contenido citable, sin duplicar el
// esquema en cada página. Formato JSON-LD (recomendado por Google / Semrush).

export type JsonLdNode = Record<string, unknown>;

/** Anclas @id estables para que distintos nodos referencien la misma entidad. */
export const ORG_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;

const ORG_DESCRIPTION =
  "Iniciativa ciudadana, independiente y no gubernamental que centraliza " +
  `información útil durante la emergencia (${deploymentConfig.disasterName}): rescates, hospitales, ` +
  "refugios, centros de acopio y ayuda humanitaria.";

/** Organización (ONG) detrás del sitio: permite a buscadores y agentes de IA
 *  reconocer y atribuir la fuente. */
export function organizationSchema(): JsonLdNode {
  return {
    "@type": ["NGO", "Organization"],
    "@id": ORG_ID,
    name: SITE_NAME,
    alternateName: deploymentConfig.productName,
    url: SITE_URL,
    logo: {
      "@type": "ImageObject",
      url: `${SITE_URL}${SITE_LOGO}`,
      width: 512,
      height: 512,
    },
    image: OG_IMAGE_URL,
    email: CONTACT_EMAIL,
    description: ORG_DESCRIPTION,
    areaServed: { "@type": "Place", name: deploymentConfig.regionLabel },
    // CHANGE_ME: sin presencia social/repositorio propios por defecto — un
    // deployment real añade aquí sus URLs reales (redes, repo del fork, etc.)
    // en vez de heredar los enlaces del proyecto de origen.
    sameAs: [] as string[],
    knowsAbout: [
      `${deploymentConfig.disasterType} emergency response`,
      "Humanitarian aid coordination",
      "Hospital and shelter directories",
      `Disaster preparedness ${deploymentConfig.regionLabel}`,
    ],
    contactPoint: {
      "@type": "ContactPoint",
      email: CONTACT_EMAIL,
      contactType: "customer support",
      availableLanguage: [deploymentConfig.languageTag],
    },
  };
}

/** WebSite del despliegue (layout global). */
export function websiteSchema(description: string): JsonLdNode {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: SITE_NAME,
    url: SITE_URL,
    inLanguage: deploymentConfig.languageTag,
    description,
    publisher: { "@id": ORG_ID },
    about: { "@id": ORG_ID },
  };
}

/** Envuelve uno o más nodos en un documento JSON-LD con @context + @graph. */
export function graph(...nodes: JsonLdNode[]): JsonLdNode {
  return { "@context": "https://schema.org", "@graph": nodes };
}

export interface BreadcrumbItem {
  name: string;
  /** Ruta absoluta o relativa al sitio. Si se omite, el item no lleva URL
   *  (válido para el último nivel del breadcrumb). */
  path?: string;
}

/** Migas de pan: ayudan a los agentes a entender la jerarquía de navegación. */
export function breadcrumbSchema(items: BreadcrumbItem[]): JsonLdNode {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      ...(item.path ? { item: absoluteUrl(item.path) } : {}),
    })),
  };
}

export interface ArticleInput {
  title: string;
  description: string;
  path: string;
  datePublished?: string;
  dateModified?: string;
  image?: string;
}

/** Artículo para páginas de contenido de referencia (guía, metodología, etc.).
 *  author/publisher referencian la Organización por @id. */
export function articleSchema({
  title,
  description,
  path,
  datePublished,
  dateModified,
  image = OG_IMAGE_URL,
}: ArticleInput): JsonLdNode {
  const url = absoluteUrl(path);
  return {
    "@type": "Article",
    headline: title,
    description,
    image,
    inLanguage: deploymentConfig.languageTag,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    ...(datePublished ? { datePublished } : {}),
    ...(dateModified ? { dateModified } : {}),
    author: { "@id": ORG_ID },
    publisher: { "@id": ORG_ID },
  };
}

export interface FaqEntry {
  question: string;
  answer: string;
}

/** Preguntas frecuentes: uno de los formatos con mayor tasa de cita por IA.
 *  Debe emparejarse con el mismo contenido visible en la página. */
export function faqSchema(entries: FaqEntry[]): JsonLdNode {
  return {
    "@type": "FAQPage",
    mainEntity: entries.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: { "@type": "Answer", text: entry.answer },
    })),
  };
}

export interface HowToStepInput {
  id: string;
  name: string;
  text: string;
}

/** HowTo para guías paso a paso visibles en la página (p.ej. /guia). */
export function howToSchema({
  name,
  description,
  path,
  steps,
}: {
  name: string;
  description: string;
  path: string;
  steps: HowToStepInput[];
}): JsonLdNode {
  const url = absoluteUrl(path);
  return {
    "@type": "HowTo",
    name,
    description,
    image: OG_IMAGE_URL,
    inLanguage: deploymentConfig.languageTag,
    url,
    step: steps.map((step, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: step.name,
      text: step.text,
      url: `${url}#${step.id}`,
    })),
  };
}

/** ContactPage: página de contacto con email visible. */
export function contactPageSchema({
  path,
  name,
  description,
}: {
  path: string;
  name: string;
  description: string;
}): JsonLdNode {
  const url = absoluteUrl(path);
  return {
    "@type": "ContactPage",
    "@id": url,
    name,
    description,
    url,
    inLanguage: deploymentConfig.languageTag,
    isPartOf: { "@id": WEBSITE_ID },
    about: { "@id": ORG_ID },
    mainEntity: {
      "@type": "Organization",
      "@id": ORG_ID,
      email: CONTACT_EMAIL,
      contactPoint: {
        "@type": "ContactPoint",
        email: CONTACT_EMAIL,
        contactType: "customer support",
        availableLanguage: [deploymentConfig.languageTag],
      },
    },
  };
}

/** WebPage genérica para directorios informativos (donaciones, teléfonos, etc.). */
export function webPageSchema({
  path,
  name,
  description,
}: {
  path: string;
  name: string;
  description: string;
}): JsonLdNode {
  const url = absoluteUrl(path);
  return {
    "@type": "WebPage",
    "@id": url,
    name,
    description,
    url,
    inLanguage: deploymentConfig.languageTag,
    isPartOf: { "@id": WEBSITE_ID },
    about: { "@id": ORG_ID },
    primaryImageOfPage: {
      "@type": "ImageObject",
      url: OG_IMAGE_URL,
    },
  };
}

function absoluteUrl(path: string): string {
  return path.startsWith("http") ? path : `${SITE_URL}${path}`;
}
