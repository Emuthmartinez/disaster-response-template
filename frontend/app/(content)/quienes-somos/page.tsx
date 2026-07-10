import type { Metadata } from "next";
import Link from "next/link";
import SubPageShell from "@/components/layout/SubPageShell";
import { JsonLd } from "@/components/seo/JsonLd";
import { faqSchema, graph } from "@/lib/jsonld";
import { pageMetadata } from "@/lib/metadata";
import { CONTACT_EMAIL, contactMailto, SITE_PRODUCT_NAME } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Quiénes somos",
  description: `${SITE_PRODUCT_NAME} es una iniciativa ciudadana, independiente y no gubernamental que centraliza información útil durante la emergencia. Conoce su misión, sus fuentes y cómo participar.`,
  path: "/quienes-somos",
});

// Mismas preguntas/respuestas que se muestran y que se emiten como FAQPage:
// el contenido del schema debe coincidir con el visible en la página.
const FAQS = [
  {
    question: `¿Qué es ${SITE_PRODUCT_NAME}?`,
    answer:
      "Es una plataforma ciudadana que centraliza, en un solo lugar, información útil durante la emergencia: directorio de hospitales, centros de acopio y refugios, teléfonos de emergencia, una guía de supervivencia y la coordinación de ayuda humanitaria.",
  },
  {
    question: "¿Es un canal oficial de emergencia?",
    answer:
      "No. No somos un organismo oficial ni un servicio de emergencia. En una emergencia real llama de inmediato a los números de emergencia locales. La plataforma es un apoyo informativo y no reemplaza a las autoridades.",
  },
  {
    question: "¿De dónde provienen los datos?",
    answer:
      "De fuentes abiertas verificables y de reportes ciudadanos voluntarios. La información se actualiza periódicamente, pero puede estar incompleta o no verificada; confírmala con fuentes oficiales antes de tomar decisiones críticas.",
  },
  {
    question: "¿Quién está detrás del proyecto?",
    answer:
      "Una iniciativa ciudadana, independiente y no gubernamental, mantenida por voluntarios. No representa a ningún gobierno, partido ni empresa.",
  },
  {
    question: "¿Cómo cuidan los datos de las personas afectadas?",
    answer:
      "Tratamos la información de personas (desaparecidos, pacientes) como sensible. No publicamos datos personales innecesarios y aplicamos los criterios descritos en la política de privacidad del sitio.",
  },
  {
    question: "¿Cómo puedo ayudar?",
    answer:
      "Puedes reportar información en el mapa, sumarte como voluntario o apoyar con donaciones a las organizaciones listadas. Cada aporte ayuda a coordinar mejor la respuesta.",
  },
];

export default function QuienesSomosPage() {
  return (
    <SubPageShell breadcrumb="Quiénes somos" path="/quienes-somos">
      <JsonLd data={graph(faqSchema(FAQS))} />
      <section className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
        <h1 className="qi-h1">Quiénes somos</h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--etext2)]">
          <strong>{SITE_PRODUCT_NAME}</strong> es una iniciativa
          ciudadana, <strong>independiente y no gubernamental</strong>, creada
          para centralizar información útil durante la emergencia y
          ayudar a coordinar rescates, ayuda humanitaria y la búsqueda de
          personas.
        </p>

        <h2 className="qi-h2 mt-8">Nuestra misión</h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--etext2)]">
          Reunir en un solo lugar, de forma clara y accesible desde el móvil, la
          información que las personas necesitan en una emergencia: hospitales,
          refugios y centros de acopio, teléfonos de emergencia, una{" "}
          <Link href="/guia" className="text-sky-600 hover:underline">
            guía de supervivencia
          </Link>{" "}
          y canales para pedir y ofrecer ayuda.
        </p>

        <h2 className="qi-h2 mt-8">Independencia y fuentes</h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--etext2)]">
          No representamos a ningún gobierno, partido ni empresa. Los datos
          provienen de fuentes abiertas verificables y de reportes ciudadanos
          voluntarios; puedes revisar cómo los procesamos en nuestra{" "}
          <Link href="/privacidad" className="text-sky-600 hover:underline">
            política de privacidad
          </Link>
          . No somos un canal oficial de emergencia.
        </p>

        <h2 className="qi-h2 mt-8">Contacto</h2>
        <ul className="mt-2 space-y-1 text-sm text-[var(--etext2)]">
          <li>
            Correo:{" "}
            <a href={contactMailto()} className="text-sky-600 hover:underline">
              {CONTACT_EMAIL}
            </a>
          </li>
        </ul>

        <h2 className="qi-h2 mt-8" id="faq">
          Preguntas frecuentes
        </h2>
        <dl className="mt-4 space-y-4">
          {FAQS.map((faq) => (
            <div key={faq.question} className="e-card p-5">
              <dt className="text-sm font-semibold text-[var(--etext)]">
                {faq.question}
              </dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-[var(--etext2)]">
                {faq.answer}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </SubPageShell>
  );
}
