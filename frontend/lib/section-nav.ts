export interface SectionLink {
  href: string;
  label: string;
  shortLabel: string;
  icon: string;
  tone?: "default" | "primary" | "purple" | "emerald" | "sky";
  badge?: "missing" | "found";
  /** Visible en la barra inferior móvil (máx. 3 + botón Menú). */
  mobileBar?: boolean;
  /**
   * Visible en el header de escritorio (SectionNav#DESKTOP_HEADER_LINKS lo
   * deriva de aquí — única fuente de verdad, ver SectionNav.tsx). El header
   * de escritorio solo tiene sitio para destinos de primer nivel; no todo lo
   * que aparece en el menú móvil (SECTION_LINKS completo) debería marcar esto.
   */
  desktopHeader?: boolean;
  /** Etiqueta a usar en el header de escritorio si difiere de `shortLabel`
   *  (p.ej. "Personas" en vez de "Desaparecidas", que es más apropiado para
   *  el badge de la barra móvil). Por defecto usa `shortLabel`. */
  desktopLabel?: string;
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
    desktopHeader: true,
    desktopLabel: "Personas",
  },
  {
    // Ruta propia, no el ancla `#mascotas` de la home: desde una subpagina
    // (/hospitales, /guia…) un enlace a un ancla no lleva a ningun sitio.
    href: "/mascotas",
    label: "Mascotas perdidas",
    shortLabel: "Mascotas",
    icon: "🐾",
    tone: "purple",
    desktopHeader: true,
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
    desktopHeader: true,
  },
  {
    href: "/acopio",
    label: "Centros de acopio",
    shortLabel: "Acopio",
    icon: "🟢",
    tone: "emerald",
    desktopHeader: true,
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
