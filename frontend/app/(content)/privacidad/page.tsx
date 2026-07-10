import Link from "next/link";
import type { Metadata } from "next";
import PrivacyPolicyBody from "@/components/content/PrivacyPolicyBody";
import SubPageShell from "@/components/layout/SubPageShell";
import { pageMetadata } from "@/lib/metadata";
import { PRIVACY_COMPANY_NAME, PRIVACY_EFFECTIVE_DATE } from "@/lib/privacy-policy";
import { SITE_PRODUCT_NAME } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Política de privacidad",
  description: `Política de privacidad oficial de ${SITE_PRODUCT_NAME}: recopilación, uso, derechos CCPA/CPRA y contacto.`,
  path: "/privacidad",
});

export default function PrivacidadPage() {
  return (
    <SubPageShell breadcrumb="Política de privacidad" path="/privacidad">
      <article className="e-legal-content mx-auto w-full max-w-3xl px-4 py-10 text-[var(--etext)] sm:px-6 sm:py-14">
        <h1 className="text-3xl font-black tracking-tight text-[var(--etext)] sm:text-4xl">
          Política de Privacidad
        </h1>
        <p className="mt-2 text-sm text-[var(--etext2)]">
          {SITE_PRODUCT_NAME} · {PRIVACY_COMPANY_NAME} · Vigente desde el{" "}
          {PRIVACY_EFFECTIVE_DATE}.
        </p>

        <PrivacyPolicyBody />

        <p className="mt-10 text-xs text-[var(--etext2)]">
          Esta política se complementa con los{" "}
          <Link
            href="/terminos"
            className="font-semibold text-[var(--brand-blue)] hover:underline"
          >
            Términos y Condiciones
          </Link>{" "}
          de uso de la plataforma.
        </p>
      </article>
    </SubPageShell>
  );
}
