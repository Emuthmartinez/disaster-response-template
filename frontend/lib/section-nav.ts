export interface SectionLink {
  href: string;
  label: string;
  shortLabel: string;
  icon: string;
  tone?: "default" | "primary" | "purple" | "emerald" | "sky";
  badge?: "missing" | "found";
  /** Visible en la barra inferior móvil (máx. 3 + botón Menú). */
  mobileBar?: boolean;
}

export const PRIMARY_MAP_LINK: SectionLink = {
  href: "#mapa",
  label: "Reportar emergencia",
  shortLabel: "Mapa",
  icon: "🗺️",
  tone: "primary",
  mobileBar: true,
};

export const SECTION_LINKS: SectionLink[] = [
  {
    href: "#e-directory",
    label: "Personas desaparecidas",
    shortLabel: "Desaparecidas",
    icon: "🧍",
    tone: "purple",
    badge: "missing",
    mobileBar: true,
  },
  {
    href: "/hospitales",
    label: "Hospitales y pacientes",
    shortLabel: "Hospitales",
    icon: "🏥",
    tone: "default",
  },
  {
    href: "/telefonos",
    label: "Teléfonos de emergencia",
    shortLabel: "Teléfonos",
    icon: "📞",
    tone: "default",
    mobileBar: true,
  },
  {
    href: "/guia",
    label: "Guía rápida",
    shortLabel: "Guía",
    icon: "🧭",
  },
  {
    href: "/acopio",
    label: "Centros de acopio",
    shortLabel: "Acopio",
    icon: "🟢",
    tone: "emerald",
  },
  {
    href: "/publicar-necesidad",
    label: "Publicar una necesidad",
    shortLabel: "Necesidad",
    icon: "🆘",
  },
  {
    href: "/chat",
    label: "Voluntarios",
    shortLabel: "Chat",
    icon: "🤝",
  },
];

export const MOBILE_BAR_LINKS: SectionLink[] = [
  PRIMARY_MAP_LINK,
  ...SECTION_LINKS.filter((link) => link.mobileBar),
];
