import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";
import ContactForm from "@/components/features/contacts/ContactForm";
import SubPageShell from "@/components/layout/SubPageShell";
import { CONTACT_EMAIL, contactMailto } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Contacto",
  description: `Escríbenos en ${CONTACT_EMAIL} o usa el formulario de contacto. Iniciativa ciudadana, independiente y no gubernamental.`,
  path: "/contacto",
});

export default function ContactoPage() {
  return (
    <SubPageShell breadcrumb="Contacto">
      <section className="mx-auto w-full max-w-xl px-4 py-10 sm:px-6">
        <h1 className="qi-h1">Contacto</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--etext2)]">
          ¿Prensa, colaboración técnica o dudas sobre la plataforma? Escríbenos.
        </p>

        <div className="e-card mt-6 p-6">
          <ContactForm />
        </div>

        <p className="mt-4 text-center text-sm text-[var(--etext2)]">
          También puedes usar tu cliente de correo:{" "}
          <a
            href={contactMailto()}
            className="font-medium text-sky-600 hover:underline"
          >
            {CONTACT_EMAIL}
          </a>
        </p>
      </section>
    </SubPageShell>
  );
}
