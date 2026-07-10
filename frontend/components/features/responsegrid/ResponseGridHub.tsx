"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Building2, FileText, Heart, Package, Truck, UserPlus } from "lucide-react";
import {
  ACOPIO_DEFAULT_FILTERS,
  deriveAcopioOperationalSummary,
  isModuleDisabledError,
  useCollectionCenters,
  type CollectionCenter,
} from "@/hooks/acopio";
import {
  RESPONSEGRID_DONATE_URL,
  RESPONSEGRID_DONATE_WHATSAPP_URL,
  RESPONSEGRID_EMERGENCY_URL,
  RESPONSEGRID_REGISTER_POINT_URL,
  RESPONSEGRID_REQUEST_URL,
  RESPONSEGRID_TRANSPORT_URL,
  RESPONSEGRID_VOLUNTEER_URL,
} from "@/lib/responsegrid";
import { deploymentConfig } from "@/lib/deployment-config";
import AcopioMap from "./AcopioMap";
import ResponseGridHubHeader from "./ResponseGridHubHeader";

const ALL_ACTION_CARDS = [
  {
    icon: Heart,
    title: "Donar ahora",
    href: RESPONSEGRID_DONATE_WHATSAPP_URL,
    external: true,
    desc: "Donaciones monetarias vía WhatsApp",
  },
  {
    icon: Package,
    title: "Donar material",
    href: RESPONSEGRID_DONATE_URL,
    external: true,
    desc: "Ofrécelo o pre-regístralo en un punto",
  },
  {
    icon: FileText,
    title: "Poner una petición",
    href: RESPONSEGRID_REQUEST_URL,
    external: true,
    desc: "Solicitar material validado",
  },
  {
    icon: UserPlus,
    title: "Ser voluntario",
    href: RESPONSEGRID_VOLUNTEER_URL,
    external: true,
    desc: "Disponibilidad y habilidades",
  },
  {
    icon: Building2,
    title: "Registrar un punto",
    href: RESPONSEGRID_REGISTER_POINT_URL,
    external: true,
    desc: "Acopio, almacén o espacio",
  },
  {
    icon: Truck,
    title: "Ofrezco transporte",
    href: RESPONSEGRID_TRANSPORT_URL,
    external: true,
    desc: "Carretera · marítimo · aéreo",
  },
] as const;

// Solo mostramos los CTAs cuyo destino está configurado (env). Sin
// NEXT_PUBLIC_RESPONSEGRID_SLUG / _WHATSAPP_URL, el href queda vacío y el
// card se oculta en vez de enlazar a "".
const ACTION_CARDS = ALL_ACTION_CARDS.filter((card) => card.href);

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="e-m-stat-card">
      <p className="e-m-stat-card__value">{value}</p>
      <p className="e-m-stat-card__label">{label}</p>
    </div>
  );
}

export default function ResponseGridHub() {
  const hubFilters = ACOPIO_DEFAULT_FILTERS;
  const { data, isLoading, isError, error, refetch } =
    useCollectionCenters(hubFilters);
  const [highlight, setHighlight] = useState<CollectionCenter | null>(null);

  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const summary = useMemo(
    () => (data ? deriveAcopioOperationalSummary(data) : null),
    [data],
  );
  const preview = items.slice(0, 6);
  const activeLabel = hubFilters.country
    ? `Activos (${hubFilters.country})`
    : "Activos en operación";

  // El módulo de acopio/ResponseGrid es opcional (ENABLE_RESPONSEGRID en el
  // backend). Si el backend responde 404, ocultamos toda la sección en vez
  // de mostrar un estado de error.
  if (isModuleDisabledError(error)) return null;

  return (
    <section
      id="responsegrid"
      aria-label={`ResponseGrid: ${deploymentConfig.disasterName}`}
      className="e-m-section e-m-section--wash e-m-section--rg-hub"
    >
      <ResponseGridHubHeader />

      <div className="e-m-section__inner">
        <div className="e-m-rg-grid">
          <div className="e-m-rg-map-wrap">
            <div className="e-m-rg-map">
              <AcopioMap centers={items} onSelect={setHighlight} />
            </div>
          </div>

          <div className="e-m-rg-content">
            <div>
              <div className="e-m-rg-head-row">
                <span className="e-m-eyebrow">Operativo activo</span>
                {highlight && (
                  <span className="e-m-rg-head-row__pin">📍 {highlight.name}</span>
                )}
              </div>
              <div className="e-m-section__head">
                <span className="e-m-kicker">Acopio y logística</span>
                <h2 className="e-m-section__title">Es hora de ayudar</h2>
                <p className="e-m-section__sub">{deploymentConfig.disasterName}</p>
                <hr className="e-m-section__rule" />
              </div>
              <p className="e-m-rg-intro">
                Esta es la página oficial de {deploymentConfig.disasterName}
                {RESPONSEGRID_EMERGENCY_URL ? (
                  <>
                    {" "}
                    en{" "}
                    <a
                      href={RESPONSEGRID_EMERGENCY_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="e-m-link"
                    >
                      ResponseGrid
                    </a>
                  </>
                ) : null}
                . Aquí encuentras los puntos de acopio verificados, las
                necesidades de material validadas por coordinación y qué{" "}
                <strong>no</strong> llevar, actualizado en tiempo real. Confirma
                por teléfono antes de ir y evita desplazamientos que saturan la
                logística.
              </p>
              <p className="e-m-rg-meta">
                Información coordinada y verificada · proyecto open source de
                Global Emergency
              </p>
            </div>

            <div>
              <h3 className="e-m-rg-block-title">Resumen del operativo</h3>
              <div className="e-m-stat-grid">
                {isError ? (
                  <div className="e-m-alert-error">
                    No pudimos cargar el resumen del operativo.{" "}
                    <button
                      type="button"
                      onClick={() => refetch()}
                      className="e-m-link"
                    >
                      Reintentar
                    </button>
                  </div>
                ) : (
                  <>
                    <StatCard
                      label="Puntos en mapa"
                      value={
                        isLoading || !summary
                          ? "…"
                          : summary.pointsOnMap.toLocaleString("es")
                      }
                    />
                    <StatCard
                      label={activeLabel}
                      value={
                        isLoading || !summary
                          ? "…"
                          : summary.operationalCount.toLocaleString("es")
                      }
                    />
                    <StatCard
                      label="Países en red"
                      value={
                        isLoading || !summary
                          ? "…"
                          : String(summary.networkCountryCount)
                      }
                    />
                  </>
                )}
              </div>
            </div>

            <div>
              <h3 className="e-m-rg-block-title-lg">¿Cómo quieres colaborar?</h3>
              <ul className="e-m-action-grid">
                {ACTION_CARDS.map((card) => (
                  <li key={card.title} className="flex">
                    <a
                      href={card.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="e-m-action-card"
                    >
                      <card.icon
                        strokeWidth={1.5}
                        className="e-m-action-card__icon"
                        aria-hidden
                      />
                      <span>
                        <span className="e-m-action-card__title">{card.title}</span>
                        <span className="e-m-action-card__desc">{card.desc}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div className="e-m-rg-list-head">
                <h3 className="e-m-rg-block-title-lg">En el mapa</h3>
                <Link href="/acopio" className="e-m-link">
                  Ver todos →
                </Link>
              </div>
              {isLoading ? (
                <ul className="e-m-rg-list" aria-hidden>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <li key={i} className="e-m-skeleton" />
                  ))}
                </ul>
              ) : preview.length === 0 ? (
                <p className="e-m-rg-meta">
                  No hay puntos cargados.{" "}
                  {RESPONSEGRID_EMERGENCY_URL && (
                    <a
                      href={RESPONSEGRID_EMERGENCY_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="e-m-link"
                    >
                      Ver en ResponseGrid
                    </a>
                  )}
                </p>
              ) : (
                <ul className="e-m-rg-list">
                  {preview.map((center) => (
                    <li key={center.id} className="e-m-rg-list-item">
                      <p className="e-m-rg-list-item__name">{center.name}</p>
                      <p className="e-m-rg-list-item__meta">
                        {[center.city, center.country].filter(Boolean).join(" · ")}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <p className="e-m-rg-foot">
              {RESPONSEGRID_EMERGENCY_URL && (
                <>
                  <a
                    href={RESPONSEGRID_EMERGENCY_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="e-m-link"
                  >
                    Abrir hub completo en ResponseGrid
                  </a>
                  {" · "}
                </>
              )}
              <a
                href="https://creativecommons.org/licenses/by-sa/4.0/"
                target="_blank"
                rel="noopener noreferrer"
                className="e-m-link"
              >
                CC BY-SA 4.0
              </a>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
