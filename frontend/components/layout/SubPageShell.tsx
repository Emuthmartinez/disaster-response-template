import Link from "next/link";
import type { ReactNode } from "react";
import { HeroDesktopNav, MobileStickyNav } from "./SectionNav";
import SiteFooter from "./SiteFooter";
import { JsonLd } from "@/components/seo/JsonLd";
import {
  articleSchema,
  breadcrumbSchema,
  graph,
  type BreadcrumbItem,
  type JsonLdNode,
} from "@/lib/jsonld";

// Re-export type used by pages that pass custom crumb trails.
export type { BreadcrumbItem };

interface SubPageShellArticle {
  /** Titular real de la página (suele ser más descriptivo que el breadcrumb). */
  headline: string;
  description: string;
  datePublished?: string;
  dateModified?: string;
}

interface SubPageShellProps {
  /** Texto del último item del breadcrumb. */
  breadcrumb: string;
  /** Ruta de la página (p.ej. "/guia"). Habilita la URL del último breadcrumb
   *  y el marcado Article. */
  path?: string;
  /** Trail completo opcional (p.ej. Inicio > Hospitales > Nombre). */
  breadcrumbs?: BreadcrumbItem[];
  /** Si la página es contenido de referencia, emite también schema Article. */
  article?: SubPageShellArticle;
  /** Nodos JSON-LD extra (HowTo, ContactPage, WebPage, …) en el mismo @graph. */
  extraSchema?: JsonLdNode[];
  children: ReactNode;
}

export default function SubPageShell({
  breadcrumb,
  path,
  breadcrumbs,
  article,
  extraSchema = [],
  children,
}: SubPageShellProps) {
  const crumbItems: BreadcrumbItem[] = breadcrumbs ?? [
    { name: "Inicio", path: "/" },
    { name: breadcrumb, ...(path ? { path } : {}) },
  ];
  const nodes: JsonLdNode[] = [breadcrumbSchema(crumbItems)];
  if (article && path) {
    nodes.push(
      articleSchema({
        title: article.headline,
        description: article.description,
        path,
        datePublished: article.datePublished,
        dateModified: article.dateModified,
      }),
    );
  }
  nodes.push(...extraSchema);
  return (
    <>
      <JsonLd data={graph(...nodes)} />
      <HeroDesktopNav />
      <main id="main" className="e-subpage">
        <div className="e-subpage__breadcrumb-bar">
          <nav
            aria-label="Migas de pan"
            className="e-subpage__breadcrumb"
          >
            <Link href="/">← Inicio</Link>
            <span aria-hidden>/</span>
            <span aria-current="page" className="truncate">
              {breadcrumb}
            </span>
          </nav>
        </div>

        <div className="e-subpage__content">{children}</div>
      </main>

      <SiteFooter />
      <MobileStickyNav />
    </>
  );
}
