"use client";

import { useMemo, useState } from "react";
import { EMERGENCY_CONTACT_GROUPS } from "@/lib/emergency-contacts";

/** Convierte un número mostrado a un href tel: válido para marcar al tocarlo.
 *  Números cortos (líneas de emergencia) se marcan tal cual; el resto pasa
 *  intacto (ya se espera en formato internacional +CC...). */
function telHref(display: string): string {
  const cleaned = display.replace(/[^\d*+]/g, "");
  if (cleaned.length <= 4) return `tel:${cleaned}`;
  return `tel:${cleaned}`;
}

/** Normaliza para comparar sin distinguir mayúsculas ni acentos. */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export default function EmergencyContacts() {
  const [query, setQuery] = useState("");

  const totalNumbers = EMERGENCY_CONTACT_GROUPS.reduce(
    (acc, g) => acc + g.contacts.reduce((s, c) => s + c.numbers.length, 0),
    0,
  );

  const filteredGroups = useMemo(() => {
    const q = normalize(query);
    if (!q) return EMERGENCY_CONTACT_GROUPS;
    return EMERGENCY_CONTACT_GROUPS.map((group) => {
      // Si la búsqueda coincide con el título del grupo, mostramos todos sus contactos.
      if (normalize(group.title).includes(q)) return group;
      const contacts = group.contacts.filter((c) =>
        normalize(c.name).includes(q),
      );
      return { ...group, contacts };
    }).filter((group) => group.contacts.length > 0);
  }, [query]);

  return (
    <section id="telefonos" className="mx-auto w-full max-w-7xl px-4 py-10">
      <details
        open
        className="group rounded-2xl border border-slate-200 bg-white shadow-sm"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl p-4 sm:p-6">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900">
              📞 Teléfonos de emergencia
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                {totalNumbers}
              </span>
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Toca para ver y llamar directamente.
            </p>
          </div>
          <span
            aria-hidden
            className="shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-180"
          >
            ▼
          </span>
        </summary>

        <div className="border-t border-slate-100 p-3 sm:p-6">
          <div className="relative mb-4">
            <span
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            >
              🔎
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Escribe tu zona o servicio…"
              aria-label="Buscar teléfono por zona o servicio"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-100"
            />
          </div>

          {filteredGroups.length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
              No encontramos teléfonos para{" "}
              <span className="font-semibold text-slate-700">“{query}”</span>.
              Prueba con otra zona o servicio.
            </p>
          ) : (
            <div className="gap-5 md:columns-3 [column-fill:_balance]">
              {filteredGroups.map((group) => (
                <div key={group.title} className="mb-5">
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900 [break-after:avoid]">
                    <span aria-hidden>{group.icon}</span> {group.title}
                  </h3>
                  <ul className="space-y-1.5">
                    {group.contacts.map((contact) => {
                      const single = contact.numbers.length === 1;
                      return (
                        <li
                          key={contact.name}
                          className={
                            single
                              ? "flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 [break-inside:avoid]"
                              : "rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 [break-inside:avoid]"
                          }
                        >
                          <p className="text-sm font-medium text-slate-800">
                            {contact.name}
                          </p>
                          <div
                            className={
                              single
                                ? "shrink-0"
                                : "mt-2 grid grid-cols-2 gap-1.5"
                            }
                          >
                            {contact.numbers.map((number) => (
                              <a
                                key={number}
                                href={telHref(number)}
                                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-bold text-red-700 transition active:scale-95 hover:bg-red-50"
                              >
                                📞 {number}
                              </a>
                            ))}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}

          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Comparte esta información: puede servir a personas que sí necesitan
            ayuda. Si un número no responde, intenta con la línea de emergencia
            general.
          </p>
        </div>
      </details>
    </section>
  );
}
