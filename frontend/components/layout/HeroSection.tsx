"use client";

import { useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  HeartHandshake,
  LifeBuoy,
  Megaphone,
  UserSearch,
  type LucideIcon,
} from "lucide-react";
import {
  SITE_LOGO,
  SITE_BRAND_NAME,
  SITE_PRODUCT_NAME,
  CONTACT_EMAIL,
  contactMailto,
} from "@/lib/site";
import { toggleTheme } from "./ThemeProvider";

const OPEN_EMERGENCY_REPORT_EVENT = "open-emergency-report";

function scrollToSection(id: string) {
  const target = document.getElementById(id);
  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.replaceState(null, "", `#${id}`);
  } else {
    window.location.hash = id;
  }
}

interface HeroAccessCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  onClick: () => void;
}

function HeroAccessCard({ icon: Icon, title, description, onClick }: HeroAccessCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="e-hero__access-card"
    >
      <span className="e-hero__card-icon" aria-hidden>
        <Icon strokeWidth={1.5} />
      </span>
      <div className="e-hero__card-title">{title}</div>
      <div className="e-hero__card-desc">{description}</div>
    </button>
  );
}

export default function HeroSection() {
  const goMissing = useCallback(() => scrollToSection("e-directory"), []);
  const goHelp = useCallback(() => scrollToSection("tutorial"), []);
  const goVolunteer = useCallback(() => scrollToSection("equipo"), []);
  const openEmergencyReport = useCallback(() => {
    scrollToSection("mapa");
    window.dispatchEvent(new CustomEvent(OPEN_EMERGENCY_REPORT_EVENT));
  }, []);

  return (
    <header className="e-hero">
      <div className="e-hero__gradient">
        <div className="e-hero__bg-image" aria-hidden />
        <div className="e-hero__bg-overlay" aria-hidden />

        <div className="e-hero__inner">
          <p className="e-hero__eyebrow">
            {SITE_PRODUCT_NAME} · una iniciativa de {SITE_BRAND_NAME}
          </p>
          <h1 className="e-hero__title">
            Estamos contigo. ¿Qué necesitas hacer?
          </h1>
          <p className="e-hero__subtitle">
            Da clic en una opción para recibir o brindar ayuda.
          </p>

          <div className="e-hero__card-grid">
            <HeroAccessCard
              icon={UserSearch}
              title="Buscar personas"
              description="No encuentro a alguien que conozco."
              onClick={goMissing}
            />
            <HeroAccessCard
              icon={Megaphone}
              title="Reportar Información"
              description="Reporta emergencias, refugios, suministros, personas desaparecidas y más."
              onClick={openEmergencyReport}
            />
            <HeroAccessCard
              icon={LifeBuoy}
              title="Necesito Ayuda"
              description="Estoy en peligro o necesito insumos."
              onClick={goHelp}
            />
            <HeroAccessCard
              icon={HeartHandshake}
              title="Puedo Ayudar"
              description="Siendo voluntario, donando o apoyando."
              onClick={goVolunteer}
            />
          </div>

          <p className="e-hero__contact-line">
            ¿Necesitas escribirnos?{" "}
            <a href={contactMailto()} className="e-hero__contact-link">
              {CONTACT_EMAIL}
            </a>
          </p>
        </div>
      </div>
    </header>
  );
}

/** Logo + marca para la barra de navegación sticky. */
export function SiteBrand({ onClick }: { onClick?: () => void }) {
  const inner = (
    <>
      <Image
        src={SITE_LOGO}
        alt=""
        width={44}
        height={44}
        unoptimized
        className="e-hero__brand-logo"
        aria-hidden
      />
      <span className="e-hero__brand-lockup">
        <span className="e-hero__brand-name">{SITE_BRAND_NAME}</span>
        <span className="e-hero__product-name">{SITE_PRODUCT_NAME}</span>
      </span>
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="e-hero__brand-link">
        {inner}
      </button>
    );
  }

  return (
    <Link href="/" prefetch={false} className="e-hero__brand-link">
      {inner}
    </Link>
  );
}

/** Botón para alternar tema claro/oscuro en la nav. */
export function ThemeToggleButton() {
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Cambiar tema claro/oscuro"
      className="e-hero__theme-btn"
    >
      🌓
    </button>
  );
}
