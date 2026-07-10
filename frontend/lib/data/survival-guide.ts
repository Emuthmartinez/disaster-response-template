/**
 * Contenido genérico de la "guía rápida de supervivencia" (sección /guia y
 * home). No depende del evento ni de la organización: son consejos generales
 * de seguridad tras un sismo, reutilizables por cualquier deployment de este
 * template. Cada tarjeta lleva un ícono + color de acento en vez de una foto
 * (el template no versiona binarios de imagen).
 */

export interface GuideBullet {
  text: string;
  important?: boolean;
}

export interface GuideCard {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  accentColor: string; // Tailwind bg class
  accentText: string; // Tailwind text class
  accentBorder: string; // Tailwind border class
  accentRing: string; // Tailwind ring class
  bullets: GuideBullet[];
  tip?: string;
}

export const CARDS: GuideCard[] = [
  {
    id: "comunidad",
    icon: "🧑🏻‍🤝‍🧑🏾",
    title: "Revisa a tus vecinos",
    subtitle: "Primero lo más urgente",
    accentColor: "bg-red-600",
    accentText: "text-red-700",
    accentBorder: "border-red-400",
    accentRing: "focus-visible:ring-red-400",
    bullets: [
      { text: "¿Alguien está herido o atrapado?", important: true },
      { text: "Revisa a los adultos mayores primero." },
      { text: "Confirma que ningún niño esté solo." },
      { text: "Habla en voz alta para que te escuchen si están atrapados." },
    ],
    tip: "Llama a los bomberos si alguien está atrapado: no muevas escombros grandes solo.",
  },
  {
    id: "suministros",
    icon: "💧",
    title: "Guarda agua y lo esencial",
    subtitle: "Para los próximos días",
    accentColor: "bg-sky-600",
    accentText: "text-sky-700",
    accentBorder: "border-sky-400",
    accentRing: "focus-visible:ring-sky-400",
    bullets: [
      {
        text: "Guarda agua potable: 2 litros por persona por día.",
        important: true,
      },
      { text: "Ten a mano tus medicamentos esenciales." },
      { text: "Linterna, radio y documentos en una bolsa lista." },
      { text: "Comida que no necesite cocción ni refrigeración." },
    ],
    tip: "No uses el agua del grifo hasta confirmar que es segura.",
  },
  {
    id: "atrapados",
    icon: "🆘",
    title: "Si hay personas atrapadas",
    subtitle: "Actúa con calma",
    accentColor: "bg-amber-600",
    accentText: "text-amber-700",
    accentBorder: "border-amber-400",
    accentRing: "focus-visible:ring-amber-400",
    bullets: [
      {
        text: "Habla con la persona: mantenerla consciente es vital.",
        important: true,
      },
      { text: "NO muevas escombros grandes sin evaluar el riesgo." },
      { text: "Marca el lugar con tela o señal visible para los rescatistas." },
      { text: "Llama a los servicios de emergencia y no cuelgues." },
    ],
    tip: "Los rescatistas profesionales tienen el equipo necesario. Tu trabajo es señalizar y mantener la calma.",
  },
  {
    id: "punto-encuentro",
    icon: "🏘️",
    title: "Punto de encuentro seguro",
    subtitle: "Organización comunitaria",
    accentColor: "bg-emerald-600",
    accentText: "text-emerald-700",
    accentBorder: "border-emerald-400",
    accentRing: "focus-visible:ring-emerald-400",
    bullets: [
      {
        text: "Reúnete con tu familia en un espacio abierto, lejos de edificios.",
        important: true,
      },
      { text: "Define un punto de encuentro que todos conozcan." },
      { text: "Ayuda a los más vulnerables a llegar al punto seguro." },
      {
        text: "No regreses a un edificio dañado hasta que sea declarado seguro.",
      },
    ],
    tip: "Escoge un parque o plaza como punto de encuentro. Comparte la ubicación con todos los miembros de tu familia.",
  },
  {
    id: "comunicacion",
    icon: "📡",
    title: "Mantente comunicado",
    subtitle: "Información verificada",
    accentColor: "bg-violet-600",
    accentText: "text-violet-700",
    accentBorder: "border-violet-400",
    accentRing: "focus-visible:ring-violet-400",
    bullets: [
      { text: "Usa el radio si no hay señal de celular.", important: true },
      { text: "Comparte solo información verificada con tus vecinos." },
      { text: "Carga tu teléfono al mínimo posible para durar más." },
      { text: "Envía un mensaje de texto si las llamadas fallan." },
    ],
    tip: "No difundas rumores. Confía en fuentes oficiales y en esta plataforma.",
  },
];
