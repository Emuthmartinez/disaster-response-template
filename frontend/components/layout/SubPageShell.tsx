import Link from "next/link";
import type { ReactNode } from "react";
import { HeroDesktopNav, MobileStickyNav } from "./SectionNav";
import SiteFooter from "./SiteFooter";
import { JsonLd } from "@/components/seo/JsonLd";
import { articleSchema, breadcrumbSchema, graph } from "@/lib/jsonld";

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
  /** Si la página es contenido de referencia, emite también schema Article. */
  article?: SubPageShellArticle;
  children: ReactNode;
}

export default function SubPageShell({
  breadcrumb,
  path,
  article,
  children,
}: SubPageShellProps) {
  const nodes = [
    breadcrumbSchema([
      { name: "Inicio", path: "/" },
      { name: breadcrumb, ...(path ? { path } : {}) },
    ]),
  ];
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
