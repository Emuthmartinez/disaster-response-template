import { SITE_URL, SITE_NAME, CONTACT_EMAIL } from "@/lib/site";
import { deploymentConfig } from "@/lib/deployment-config";

// Constructores de JSON-LD (schema.org) compartidos. Centralizan el marcado
// estructurado para que buscadores y agentes de IA (ChatGPT, Gemini, Claude,
// Perplexity) reconozcan la entidad y el contenido citable, sin duplicar el
// esquema en cada página.

type JsonLdNode = Record<string, unknown>;

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
    logo: `${SITE_URL}/icon.svg`,
    image: `${SITE_URL}/opengraph-image`,
    email: CONTACT_EMAIL,
    description: ORG_DESCRIPTION,
    areaServed: { "@type": "Place", name: deploymentConfig.regionLabel },
    contactPoint: {
      "@type": "ContactPoint",
      email: CONTACT_EMAIL,
      contactType: "customer support",
      availableLanguage: [deploymentConfig.languageTag],
    },
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
}

/** Artículo para páginas de contenido de referencia (guía, metodología, etc.).
 *  author/publisher referencian la Organización por @id. */
export function articleSchema({
  title,
  description,
  path,
  datePublished,
  dateModified,
}: ArticleInput): JsonLdNode {
  const url = absoluteUrl(path);
  return {
    "@type": "Article",
    headline: title,
    description,
    inLanguage: deploymentConfig.languageTag,
    url,
    mainEntityOfPage: url,
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

function absoluteUrl(path: string): string {
  return path.startsWith("http") ? path : `${SITE_URL}${path}`;
}
