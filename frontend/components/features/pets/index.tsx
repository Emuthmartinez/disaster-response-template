"use client";

/**
 * Experiencia COMPLETA de mascotas, para la ruta dedicada `/mascotas`.
 *
 * Reutiliza `PetsTab` (el mismo directorio que vive en la pestaña de la home) en
 * vez de duplicarlo: si la busqueda, los filtros o las tarjetas cambian, cambian
 * en los dos sitios a la vez. Lo que añade esta pagina alrededor es lo que una
 * pestaña no puede dar — titular propio, contexto, y un CTA de reporte visible
 * sin tener que encontrar primero la pestaña correcta.
 */
import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { useCreatePet, usePetStats } from "@/hooks/pets";
import type { PetPayload, PetReportType } from "@/components/features/pets/types";
import { PetsTab } from "@/components/features/missing-carousel/PetsTab";

const PetForm = dynamic(() => import("@/components/features/pets/PetForm"), {
  ssr: false,
});

export default function PetsPage() {
  const [showForm, setShowForm] = useState(false);
  const [reportType, setReportType] = useState<PetReportType>("missing");
  const [formSessionKey, setFormSessionKey] = useState(0);
  const createPet = useCreatePet();
  const stats = usePetStats();

  const openForm = useCallback((type: PetReportType) => {
    setReportType(type);
    setFormSessionKey((k) => k + 1);
    setShowForm(true);
  }, []);

  const handleSubmit = useCallback(
    async (payload: PetPayload) => {
      await createPet.mutateAsync(payload);
      setShowForm(false);
    },
    [createPet],
  );

  // Nunca se afirma "0" mientras el dato viaja o si fallo: un cero inventado se
  // lee como "no hay ninguna buscandose". Mismo criterio que el resto de la app.
  const unknown = stats.isPending || stats.isError;
  const fmt = (n: number) => (unknown ? "—" : n.toLocaleString("es"));

  return (
    <>
      <section className="e-m-section">
        <div className="e-m-section__inner">
          <header className="e-m-section__head">
            <span className="e-m-kicker">Directorio humanitario</span>
            <h1 className="e-m-section__title">Mascotas perdidas</h1>
            <hr className="e-m-section__rule" />
            <p className="e-m-section__sub">
              Un sismo tambien separa a la gente de sus animales. Publica una
              mascota perdida o reporta una que encontraste para que pueda volver
              a casa.
            </p>
          </header>

          <div className="e-m-directory__header">
            <div className="e-m-person-stats">
              <span className="e-m-person-stats__item">
                <span
                  className="e-m-person-stats__dot e-m-person-stats__dot--missing"
                  aria-hidden
                />
                {fmt(stats.data?.active ?? 0)} perdidas
              </span>
              <span className="e-m-person-stats__item">
                <span
                  className="e-m-person-stats__dot e-m-person-stats__dot--found"
                  aria-hidden
                />
                {fmt(stats.data?.found ?? 0)} reunidas
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openForm("missing")}
                className="e-m-btn e-m-btn--crisis e-m-btn--sm"
              >
                Se me perdio
              </button>
              <button
                type="button"
                onClick={() => openForm("found")}
                className="e-m-btn e-m-btn--sm"
              >
                Encontre una
              </button>
            </div>
          </div>

          <div className="e-m-directory__panel">
            <PetsTab />
          </div>
        </div>
      </section>

      {showForm && (
        <PetForm
          key={`pet-page-${reportType}-${formSessionKey}`}
          initialReportType={reportType}
          onCancel={() => setShowForm(false)}
          onSubmit={handleSubmit}
        />
      )}
    </>
  );
}
