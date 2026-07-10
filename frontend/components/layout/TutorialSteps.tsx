import Link from "next/link";
import { BookOpen, Heart, Home } from "lucide-react";

export default function TutorialSteps() {
  return (
    <section id="tutorial" className="e-m-section">
      <div className="e-m-section__inner">
        <header className="e-m-section__head">
          <span className="e-m-kicker">Orientación inmediata</span>
          <h2 className="e-m-section__title">¿Necesitas ayuda?</h2>
          <hr className="e-m-section__rule" />
          <p className="e-m-section__sub">
            Tu solicitud llega directo a brigadas activas. En peligro inmediato,
            llama al 911.
          </p>
        </header>

        <div className="e-m-hub-grid">
          <Link href="/guia" className="e-m-hub-card">
            <div className="e-m-hub-card__icon e-m-hub-card__icon--guides">
              <BookOpen size={22} strokeWidth={2} aria-hidden />
            </div>
            <h3 className="e-m-hub-card__title">Guías rápidas</h3>
            <p className="e-m-hub-card__desc">Qué hacer en cada situación</p>
            <span className="e-m-hub-card__cta">Ver guías</span>
          </Link>

          <Link href="/apoyo-disponible" className="e-m-hub-card">
            <div className="e-m-hub-card__icon e-m-hub-card__icon--support">
              <Heart size={22} strokeWidth={2} aria-hidden />
            </div>
            <h3 className="e-m-hub-card__title">Apoyo</h3>
            <p className="e-m-hub-card__desc">Psicológico y Protección Civil</p>
            <span className="e-m-hub-card__cta">Ver apoyo</span>
          </Link>

          <Link href="/acopio" className="e-m-hub-card">
            <div className="e-m-hub-card__icon e-m-hub-card__icon--shelter">
              <Home size={22} strokeWidth={2} aria-hidden />
            </div>
            <h3 className="e-m-hub-card__title">Centros de acopio</h3>
            <p className="e-m-hub-card__desc">Puntos activos de ayuda</p>
            <span className="e-m-hub-card__cta">Ver centros</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
