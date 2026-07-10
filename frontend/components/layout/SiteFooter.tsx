import Link from "next/link";
import { Mail } from "lucide-react";
import { CONTACT_EMAIL, SITE_BRAND_NAME, SITE_PRODUCT_NAME, contactMailto } from "@/lib/site";

export default function SiteFooter() {
  return (
    <footer className="e-footer">
      <div className="e-footer__inner">
        <section className="e-footer__about" aria-labelledby="footer-about">
          <p className="e-footer__brand">{SITE_PRODUCT_NAME}</p>
          <p className="e-footer__product">Una iniciativa de {SITE_BRAND_NAME}</p>
          <h2 id="footer-about" className="e-footer__heading">Ayuda coordinada, información clara</h2>
          <p className="e-footer__text">
            Plataforma ciudadana, gratuita y de código abierto para conectar
            reportes, recursos y equipos de respuesta durante la emergencia.
          </p>
        </section>

        <section className="e-footer__section" aria-labelledby="footer-community">
          <h3 id="footer-community" className="e-footer__section-title">Contacto</h3>
          <p className="e-footer__text">
            ¿Preguntas, dudas o quieres coordinar ayuda? Escríbenos por correo.
          </p>
          <div className="e-footer__actions">
            <a href={contactMailto()} className="e-footer__email">
              <Mail size={15} strokeWidth={2} aria-hidden />
              {CONTACT_EMAIL}
            </a>
          </div>
        </section>
      </div>

      <div className="e-footer__legal">
        <div className="e-footer__legal-inner">
          <nav aria-label="Documentos legales" className="e-footer__legal-nav">
            <Link href="/privacidad">Política de privacidad</Link>
            <Link href="/terminos">Términos y condiciones</Link>
            <Link href="/contacto">Contacto</Link>
            <Link href="/solicitar-borrado">Solicitar borrado de datos</Link>
          </nav>
          <p className="e-footer__legal-copy">
            Plataforma de reporte ciudadano sin fines de lucro. Datos de mapas ©{" "}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener noreferrer"
            >
              OpenStreetMap
            </a>
            . En caso de peligro inmediato, contacta también a los servicios de
            emergencia oficiales.
          </p>
          <div className="e-footer__legal-meta">
            <Link href="/riesgo-sismico">Riesgo sísmico</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
