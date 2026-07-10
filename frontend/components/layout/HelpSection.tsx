import Link from "next/link";
import { Heart, Users } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";
import { RESPONSEGRID_DONATE_WHATSAPP_URL } from "@/lib/responsegrid";

export default function HelpSection() {
  return (
    <section id="equipo" className="e-m-section e-m-section--wash">
      <div className="e-m-section__inner">
        <div className="e-m-section__head">
          <h2 className="e-m-section__title">¿Quieres ayudar?</h2>
          <hr className="e-m-section__rule" />
          <p className="e-m-section__sub">
            Elige cómo contribuir a los esfuerzos de rescate y recuperación.
          </p>
        </div>

        <div className="e-m-hub-grid">
          <Link href="/voluntario" className="e-m-hub-card">
            <div className="e-m-hub-card__icon e-m-hub-card__icon--shelter">
              <Users size={22} strokeWidth={2} aria-hidden />
            </div>
            <h3 className="e-m-hub-card__title">Voluntario</h3>
            <p className="e-m-hub-card__desc">
              Rescate, logística o asistencia médica
            </p>
            <span className="e-m-hub-card__cta">Inscribirme</span>
          </Link>

          {RESPONSEGRID_DONATE_WHATSAPP_URL && (
            <a
              href={RESPONSEGRID_DONATE_WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="e-m-hub-card"
            >
              <div className="e-m-hub-card__icon e-m-hub-card__icon--donate">
                <WhatsAppIcon className="h-[22px] w-[22px]" />
              </div>
              <h3 className="e-m-hub-card__title">Donaciones</h3>
              <p className="e-m-hub-card__desc">
                Donaciones monetarias coordinadas por WhatsApp
              </p>
              <span className="e-m-hub-card__cta">Donar ahora</span>
            </a>
          )}

          <Link href="/donaciones" className="e-m-hub-card">
            <div className="e-m-hub-card__icon e-m-hub-card__icon--support">
              <Heart size={22} strokeWidth={2} aria-hidden />
            </div>
            <h3 className="e-m-hub-card__title">Donaciones</h3>
            <p className="e-m-hub-card__desc">
              Directorio de organizaciones para donar
            </p>
            <span className="e-m-hub-card__cta">Ver donaciones</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
