import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";
import SubPageShell from "@/components/layout/SubPageShell";

export const metadata: Metadata = pageMetadata({
  title: "Registrarme como voluntario",
  description: "Ofrece tu tiempo en labores de rescate, apoyo logístico o asistencia médica. Iniciativa ciudadana, independiente y no gubernamental.",
  path: "/voluntario",
});

export default function VoluntarioPage() {
  return (
    <SubPageShell breadcrumb="Inicio">
      <section className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <div className="e-card rounded-[24px] bg-white p-6 sm:p-10">
          <h1 className="mb-2 text-[22px] font-bold text-slate-900 sm:text-2xl">
            Registrarme como voluntario
          </h1>
          <p className="mb-8 text-sm text-slate-600 sm:text-[15px]">
            El equipo de coordinación se pondrá en contacto contigo en las próximas horas.
          </p>

          <form className="space-y-6">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label htmlFor="name" className="mb-2 block text-sm font-semibold text-slate-900">
                  Tu nombre
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  placeholder="Nombre completo"
                  className="e-input w-full"
                  required
                />
              </div>
              <div>
                <label htmlFor="phone" className="mb-2 block text-sm font-semibold text-slate-900">
                  Teléfono de contacto
                </label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  placeholder="0414-XXX-XXXX"
                  className="e-input w-full"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="offer" className="mb-2 block text-sm font-semibold text-slate-900">
                ¿Qué puedes ofrecer?
              </label>
              <textarea
                id="offer"
                name="offer"
                rows={3}
                placeholder="Ej. Tengo camioneta disponible, soy médico, puedo llevar víveres, manejo de grúas..."
                className="e-input w-full resize-y"
                required
              />
            </div>

            <div>
              <label htmlFor="zone" className="mb-2 block text-sm font-semibold text-slate-900">
                Zona desde donde puedes ayudar
              </label>
              <input
                type="text"
                id="zone"
                name="zone"
                placeholder="Ej. Nombre del sector, ciudad"
                className="e-input w-full"
                required
              />
            </div>

            {/* Espacio reservado para la sección adicional */}

            <button
              type="submit"
              className="e-m-btn e-m-btn--crisis e-m-btn--block mt-8"
            >
              Enviar registro
            </button>
          </form>
        </div>
      </section>
    </SubPageShell>
  );
}
