import Link from "next/link";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";
import SubPageShell from "@/components/layout/SubPageShell";
import SeismicRiskMap from "@/components/features/seismic/SeismicRiskMap";
import { formatLocaleNumber } from "@/lib/format";
import {
  OSM_URL,
  OVERPASS_URL,
  SEISMIC_RISK_AOIS,
  SEISMIC_RISK_CITIES,
  SEISMIC_RISK_EVENT,
  SEISMIC_RISK_TOTALS,
  USGS_EVENT_URL,
  type SeismicRiskLevel,
} from "@/lib/seismic-risk";

export const metadata: Metadata = pageMetadata({
  title: "Riesgo sísmico de inspección",
  description:
    "Vista de priorización para inspección sísmica basada en sacudida estimada por USGS, exposición poblacional y huellas de edificios de OpenStreetMap.",
  path: "/riesgo-sismico",
});

const levelLabel: Record<SeismicRiskLevel, string> = {
  critical: "Crítico",
  high: "Alto",
};

const levelClass: Record<SeismicRiskLevel, string> = {
  critical: "bg-red-50 text-red-700 ring-red-200",
  high: "bg-amber-50 text-amber-700 ring-amber-200",
};

export default function RiesgoSismicoPage() {
  return (
    <SubPageShell
      breadcrumb="Riesgo sísmico"
      path="/riesgo-sismico"
      article={{
        headline: "Riesgo sísmico para inspección",
        description:
          "Vista de priorización para inspección sísmica basada en sacudida estimada por USGS, exposición poblacional y huellas de edificios de OpenStreetMap.",
      }}
    >
      <section className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="p-5 md:p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="max-w-3xl">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-700">
                    Priorización operativa
                  </p>
                  <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 md:text-4xl">
                    Riesgo sísmico para inspección
                  </h1>
                  <p className="mt-3 text-sm leading-6 text-slate-600 md:text-base">
                    Esta pantalla ayuda a decidir dónde revisar primero. No marca
                    colapsos confirmados ni reemplaza reportes activos, peritaje
                    en sitio o imágenes aéreas antes/después.
                  </p>
                </div>
                <Link
                  href="/#mapa"
                  className="inline-flex shrink-0 items-center justify-center rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                >
                  Volver al mapa
                </Link>
              </div>

              <div className="mt-5 flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-white px-3 py-1 font-semibold text-slate-950 ring-1 ring-slate-200">
                    1. Toca una ciudad
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 font-semibold text-slate-950 ring-1 ring-slate-200">
                    2. Revisa la zona
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 font-semibold text-slate-950 ring-1 ring-slate-200">
                    3. Confirma en sitio
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-600">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-600" />
                    Crítico
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-600" />
                    Alto
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-red-700/70" />
                    Edificios
                  </span>
                  <a
                    href="#prioridades-ciudad"
                    className="text-red-700 hover:text-red-800 hover:underline"
                  >
                    Ver tabla
                  </a>
                </div>
              </div>
            </div>

            <div className="relative h-[340px] border-y border-slate-200 md:h-[520px]">
              <SeismicRiskMap />
              <div className="pointer-events-none absolute left-16 right-3 top-3 z-[500] max-w-[320px] rounded-xl bg-white/95 px-3 py-2 text-xs leading-5 text-slate-700 shadow-sm ring-1 ring-slate-200 backdrop-blur">
                <strong className="text-slate-950">No son daños confirmados.</strong>{" "}
                Los puntos son edificios OSM priorizados para inspección.
              </div>
            </div>

            <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                label="Zonas críticas"
                value={formatLocaleNumber(SEISMIC_RISK_TOTALS.criticalCities)}
              />
              <Metric
                label="Edificios OSM priorizados"
                value={formatLocaleNumber(SEISMIC_RISK_TOTALS.criticalBuildings)}
              />
              <Metric
                label="Evento base"
                value={SEISMIC_RISK_EVENT.source}
                detail={SEISMIC_RISK_EVENT.eventId}
              />
              <Metric label="Estado" value="No confirmado" detail="Modelo" />
            </div>
          </section>

          <section
            id="prioridades-ciudad"
            className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-3xl">
                <h2 className="text-lg font-bold text-slate-950">
                  Prioridades por ciudad
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Orden preliminar por sacudida estimada, exposición y cercanía
                  al evento.
                </p>
              </div>
              <a
                href={USGS_EVENT_URL}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-semibold text-red-700 hover:text-red-800 hover:underline"
              >
                Fuente: USGS
              </a>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="border-b border-slate-200 py-2 pr-3">
                      #
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2">
                      Ciudad
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2">
                      Estado
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2">
                      MMI
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2">
                      Población
                    </th>
                    <th className="border-b border-slate-200 py-2 pl-3">
                      Nivel
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {SEISMIC_RISK_CITIES.map((city) => (
                    <tr key={city.city} className="text-slate-700">
                      <td className="border-b border-slate-100 py-3 pr-3 font-semibold text-slate-950">
                        {city.rank}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3 font-semibold text-slate-950">
                        {city.city}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3">
                        {city.state}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3">
                        {city.mmi.toFixed(2)}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3">
                        {formatLocaleNumber(city.population)}
                      </td>
                      <td className="border-b border-slate-100 py-3 pl-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${levelClass[city.level]}`}
                        >
                          {levelLabel[city.level]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <h2 className="text-lg font-bold text-slate-950">
              Edificios priorizados
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Estos conteos vienen de huellas de edificios disponibles en OSM
              dentro de áreas de sacudida crítica. Sirven para planificar
              inspección, no para declarar daños.
            </p>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {SEISMIC_RISK_AOIS.map((area) => (
                <div
                  key={area.name}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {area.area}
                  </div>
                  <h3 className="mt-1 font-bold text-slate-950">
                    {area.name}
                  </h3>
                  <div className="mt-3 text-3xl font-bold text-red-700">
                    {formatLocaleNumber(area.criticalBuildings)}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {area.basis}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-red-200 bg-red-50 p-5">
            <h2 className="text-base font-bold text-red-950">
              Cómo usar esta vista
            </h2>
            <ol className="mt-3 space-y-2 text-sm leading-6 text-red-950">
              <li>1. Priorizar llamadas, brigadas e inspecciones iniciales.</li>
              <li>2. Cruzar con reportes activos, hospitales y desaparecidos.</li>
              <li>3. Confirmar en sitio antes de publicar daño estructural.</li>
            </ol>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-slate-950">
              Qué significa
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Riesgo sísmico es una prioridad de inspección derivada de
              sacudida estimada y exposición. No es detección automática de
              edificios afectados ni reporte ciudadano verificado.
            </p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-slate-950">
              Fuentes y límites
            </h2>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
              <li>
                Fuente sísmica:{" "}
                <a
                  href={USGS_EVENT_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-red-700 hover:underline"
                >
                  USGS event {SEISMIC_RISK_EVENT.eventId}
                </a>
              </li>
              <li>
                Huellas de edificios:{" "}
                <a
                  href={OSM_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-red-700 hover:underline"
                >
                  OpenStreetMap
                </a>{" "}
                vía{" "}
                <a
                  href={OVERPASS_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-red-700 hover:underline"
                >
                  Overpass
                </a>
              </li>
              <li>
                No hay confirmación de alta resolución antes/después integrada
                en esta vista.
              </li>
              <li>
                Se evita mostrar todos los candidatos en el mapa para no tapar
                reportes activos.
              </li>
            </ul>
          </section>
        </aside>
      </section>
    </SubPageShell>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold text-slate-950">{value}</div>
      {detail && <div className="mt-1 text-xs text-slate-500">{detail}</div>}
    </div>
  );
}
