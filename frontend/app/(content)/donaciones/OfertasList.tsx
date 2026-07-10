"use client";

import { useState } from "react";
import { ArrowRight, HeartHandshake, Search } from "lucide-react";

type Oferta = {
  name: string;
  description: string;
  action: string;
  url: string;
};

/**
 * EXAMPLE donation partner directory. Every entry below is synthetic
 * placeholder data — replace this list with the real, verified organizations
 * for this deployment before going live (disaster-configure does not
 * populate this automatically, since partner vetting is a manual, per-event
 * decision).
 */
const OFERTAS: { category: string; items: Oferta[] }[] = [
  {
    category: "Fundaciones",
    items: [
      {
        name: "Fundación Ejemplo de Ayuda Humanitaria",
        description:
          "Atención médica, rescate y ayuda humanitaria en la zona afectada. (Ejemplo — reemplazar con una organización verificada.)",
        action: "Donar",
        url: "#",
      },
      {
        name: "Banco de Alimentos Ejemplo",
        description:
          "Distribución de alimentos a familias en situación de vulnerabilidad. (Ejemplo — reemplazar con una organización verificada.)",
        action: "Donar",
        url: "#",
      },
    ],
  },
  {
    category: "Envío de dinero",
    items: [
      {
        name: "Plataforma de envíos Ejemplo",
        description:
          "Envía dinero de forma segura a personas afectadas. (Ejemplo — reemplazar con un proveedor verificado.)",
        action: "Enviar dinero",
        url: "#",
      },
    ],
  },
  {
    category: "Salud",
    items: [
      {
        name: "Banco de Sangre Ejemplo",
        description:
          "Consulta horarios y requisitos de donación en el centro de salud más cercano. (Ejemplo — reemplazar con datos reales.)",
        action: "Ver detalles",
        url: "#",
      },
    ],
  },
];

function OfertaCard({ name, description, action, url }: Oferta) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="e-card group flex flex-col rounded-2xl bg-white p-4 transition-shadow hover:shadow-md"
    >
      <div className="flex h-9 items-center justify-between gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-[#c41a1a]">
          <HeartHandshake size={20} strokeWidth={2} />
        </span>
        <h3 className="truncate text-[13px] font-semibold text-slate-400">{name}</h3>
      </div>
      <p className="mt-3 line-clamp-3 flex-1 text-[12.5px] leading-snug text-slate-600">{description}</p>
      <span className="mt-4 inline-flex items-center gap-1.5 self-start rounded-full bg-red-50 px-3.5 py-1.5 text-[13px] font-bold text-[#c41a1a] ring-1 ring-red-100 transition-all duration-200 group-hover:bg-[#c41a1a] group-hover:text-white group-hover:ring-[#c41a1a]">
        {action}
        <ArrowRight
          size={15}
          strokeWidth={2.5}
          className="transition-transform duration-200 group-hover:translate-x-0.5"
        />
      </span>
    </a>
  );
}

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 whitespace-nowrap ${active ? "e-m-chip e-m-chip--active" : "e-m-chip"}`}
    >
      {label}
    </button>
  );
}

export default function OfertasList() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const categories = OFERTAS.map((group) => group.category);

  // Lista estática y pequeña: filtrar en cada render es trivial y deja que el
  // React Compiler maneje la memoización (evita preserve-manual-memoization).
  const q = query.trim().toLowerCase();
  const groups = OFERTAS.filter(
    (group) => !activeCategory || group.category === activeCategory,
  )
    .map((group) => ({
      ...group,
      items: q
        ? group.items.filter(
            (item) =>
              item.name.toLowerCase().includes(q) ||
              item.description.toLowerCase().includes(q) ||
              group.category.toLowerCase().includes(q),
          )
        : group.items,
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div>
      <div className="sticky top-[62px] z-30 -mx-4 mb-4 border-b border-[var(--eborder)] bg-[var(--ebg)] px-4 pt-3 pb-3 sm:-mx-6 sm:px-6 md:static md:z-auto md:mx-0 md:mb-0 md:border-0 md:bg-transparent md:p-0">
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] md:flex-wrap md:overflow-visible md:pb-0 [&::-webkit-scrollbar]:hidden">
          <FilterPill
            label="Todas"
            active={activeCategory === null}
            onClick={() => setActiveCategory(null)}
          />
          {categories.map((category) => (
            <FilterPill
              key={category}
              label={category}
              active={activeCategory === category}
              onClick={() => setActiveCategory(category)}
            />
          ))}
        </div>

        <div className="relative">
          <Search
            size={18}
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar organización o servicio…"
            aria-label="Buscar organización o servicio"
            className="w-full rounded-full border border-slate-200 bg-white py-3 pr-4 pl-11 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#c41a1a] focus:ring-2 focus:ring-red-100 focus:outline-none"
          />
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">
          No se encontraron resultados para “{query}”.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-7 md:mt-6">
          {groups.map((group) => (
            <div key={group.category}>
              <h3 className="sticky top-[190px] z-20 -mx-4 bg-[var(--ebg)] px-4 py-2 text-[13px] font-bold text-slate-700 sm:-mx-6 sm:px-6 md:static md:z-auto md:mx-0 md:mb-2.5 md:bg-transparent md:px-0 md:py-0">
                {group.category}
              </h3>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {group.items.map((item) => (
                  <OfertaCard key={item.name} {...item} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
