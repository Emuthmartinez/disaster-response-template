import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";
import DataDeletionForm from "@/components/features/privacy/DataDeletionForm";
import SubPageShell from "@/components/layout/SubPageShell";
import { CONTACT_EMAIL, SITE_PRODUCT_NAME } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Solicitar eliminación de datos",
  description: `Ejerce tus derechos de privacidad (CCPA/CPRA/GDPR) y solicita la eliminación de tus datos personales de ${SITE_PRODUCT_NAME}.`,
  path: "/solicitar-borrado",
});

export default function SolicitarBorradoPage() {
  return (
    <SubPageShell breadcrumb="Solicitar eliminación de datos">
      <section className="mx-auto w-full max-w-xl px-4 py-10 sm:px-6">
        <h1 className="qi-h1">Solicitar eliminación de datos</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--etext2)]">
          Puedes solicitar la eliminación de tus datos personales de nuestra
          plataforma. Procesaremos tu solicitud en un plazo razonable.
        </p>

        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Importante</p>
          <p className="mt-1 leading-relaxed">
            Esta plataforma es de ayuda humanitaria. Los reportes públicos y
            datos de personas desaparecidas pueden estar visibles para coordinar
            rescates. Procesaremos tu solicitud considerando estas
            circunstancias.
          </p>
        </div>

        <div className="e-card mt-6 p-6">
          <DataDeletionForm />
        </div>

        <p className="mt-4 text-center text-sm text-[var(--etext2)]">
          También puedes escribirnos a{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}?subject=Solicitud de eliminación de datos`}
            className="font-medium text-sky-600 hover:underline"
          >
            {CONTACT_EMAIL}
          </a>
        </p>
      </section>
    </SubPageShell>
  );
}
