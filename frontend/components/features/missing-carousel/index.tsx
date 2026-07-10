"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  type MissingReportType,
  type MissingPersonPayload,
} from "@/components/features/missing/MissingPersonForm";
import { TabNav, type TabDef } from "@/components/ui/TabNav";
import { useCreateMissing } from "@/hooks/missing";
import { PersonsTab, type PersonsTabHandle } from "./PersonsTab";
import { HospitalsTab } from "./HospitalsTab";

// Form de reporte: code-split (pesado, solo al pulsar "Reportar").
const MissingPersonForm = dynamic(
  () => import("@/components/features/missing/MissingPersonForm"),
  { ssr: false },
);

type DirectoryTab = "personas" | "hospitales";

const TABS: ReadonlyArray<TabDef<DirectoryTab>> = [
  {
    id: "personas",
    label: "Personas",
    tabId: "tab-personas",
    panelId: "panel-personas",
  },
  {
    id: "hospitales",
    label: "Hospitales",
    tabId: "tab-hospitales",
    panelId: "panel-hospitales",
  },
];

function tabFromHash(hash: string): DirectoryTab | null {
  const id = hash.replace("#", "");
  if (id === "hospitales") return "hospitales";
  if (
    id === "personas" ||
    id === "desaparecidas" ||
    id === "desaparecidas-preview" ||
    id === "e-directory" ||
    id === "localizados"
  ) {
    return "personas";
  }
  return null;
}

function hashForTab(tab: DirectoryTab): string {
  return tab === "hospitales" ? "#hospitales" : "#e-directory";
}

/**
 * Contenedor del directorio (personas + hospitales). Orquesta: pestañas
 * (TabNav), botones de reporte, el form (code-split) y el sync con el hash de
 * la URL. Los DATOS viven en cada pestaña vía hooks TanStack. UI verbatim del
 * MissingPersonsCarousel original.
 */
export default function MissingCarousel() {
  const [activeTab, setActiveTab] = useState<DirectoryTab>("personas");
  const [showForm, setShowForm] = useState(false);
  const [formReportType, setFormReportType] =
    useState<MissingReportType>("missing");
  const [formSessionKey, setFormSessionKey] = useState(0);
  const personasRef = useRef<PersonsTabHandle>(null);
  const createMissing = useCreateMissing();

  const selectTab = useCallback((tab: DirectoryTab) => {
    setActiveTab(tab);
    window.history.replaceState(null, "", hashForTab(tab));
  }, []);

  const openReportForm = useCallback((reportType: MissingReportType) => {
    setFormReportType(reportType);
    setFormSessionKey((k) => k + 1);
    setShowForm(true);
  }, []);

  const handleFormSubmit = useCallback(
    async (payload: MissingPersonPayload) => {
      await createMissing.mutateAsync(payload);
      setShowForm(false);
      personasRef.current?.refresh();
    },
    [createMissing],
  );

  useEffect(() => {
    const syncFromHash = () => {
      const next = tabFromHash(window.location.hash);
      if (next) setActiveTab(next);
    };
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  return (
    <section id="e-directory" className="e-m-section scroll-mt-20">
      <span
        id="hospitales"
        className="pointer-events-none absolute -top-24"
        aria-hidden
      />
      <span
        id="desaparecidas-preview"
        className="pointer-events-none absolute -top-24"
        aria-hidden
      />
      <div className="e-m-section__inner">
        <header className="e-m-section__head">
          <span className="e-m-kicker">Directorio humanitario</span>
          <h2 className="e-m-section__title">Personas y hospitales</h2>
          <hr className="e-m-section__rule" />
          <p className="e-m-section__sub">
            Consulta reportes de personas desaparecidas, localizadas y registros
            hospitalarios.
          </p>
        </header>

        <div className="e-m-directory__header">
          <TabNav
            tabs={TABS}
            active={activeTab}
            onSelect={selectTab}
            ariaLabel="Directorio de personas y hospitales"
            variant="compact"
          />
          <button
            type="button"
            onClick={() => openReportForm("missing")}
            className="e-m-btn e-m-btn--crisis e-m-btn--sm e-m-directory__report"
          >
            Reportar persona
          </button>
        </div>

        {activeTab === "personas" ? (
          <div
            role="tabpanel"
            id="panel-personas"
            aria-labelledby="tab-personas"
            className="e-m-directory__panel"
          >
            <PersonsTab ref={personasRef} />
          </div>
        ) : (
          <div
            role="tabpanel"
            id="panel-hospitales"
            aria-labelledby="tab-hospitales"
            className="e-m-directory__panel"
          >
            <HospitalsTab />
          </div>
        )}

        {showForm && (
          <MissingPersonForm
            key={`${formReportType}-${formSessionKey}`}
            initialReportType={formReportType}
            initialFoundPlace={null}
            onCancel={() => setShowForm(false)}
            onSubmit={handleFormSubmit}
          />
        )}
      </div>
    </section>
  );
}
