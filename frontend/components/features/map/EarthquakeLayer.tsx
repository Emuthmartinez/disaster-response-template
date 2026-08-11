import { Fragment, memo, useMemo } from "react";
import { CircleMarker, Popup } from "react-leaflet";
import type { Earthquake } from "@/lib/types";
import { timeAgo } from "@/lib/format";

/**
 * Capa de sismos del catalogo USGS sobre el mapa principal.
 *
 * Dos cosas distintas dibujadas con el mismo dato:
 *
 *  - Cada sismo: un circulo cuyo radio crece con la magnitud.
 *  - El EPICENTRO (el sismo de mayor magnitud del catalogo, que es el evento
 *    principal): ademas dos anillos concentricos, para que se lea de un vistazo
 *    donde fue. Es la pregunta que trae a la gente al sitio.
 *
 * Se usa CircleMarker (no un divIcon con CSS) a proposito: el radio va en
 * pixeles y se mantiene legible en cualquier zoom, no hace falta CSS nueva, y
 * no compite con los pines de reportes ni con los clusters de personas.
 */

/** Radio en px segun magnitud. Escala suave: un M7 no puede tapar el mapa. */
function radiusFor(mag: number | null): number {
  const m = mag ?? 2.5;
  return Math.max(5, Math.min(26, 4 + (m - 2) * 3.4));
}

/** Color por magnitud. Rojo = fuerte, ambar = moderado, gris azulado = leve. */
function colorFor(mag: number | null): string {
  const m = mag ?? 0;
  if (m >= 6) return "#b3121f";
  if (m >= 5) return "#e0562a";
  if (m >= 4) return "#e2a13c";
  return "#7b8aa6";
}

function magLabel(mag: number | null): string {
  return mag === null ? "M?" : `M${mag.toFixed(1)}`;
}

function EarthquakeLayerBase({ earthquakes = [] }: { earthquakes?: Earthquake[] }) {
  // El epicentro es el de mayor magnitud, no el mas reciente: las replicas son
  // posteriores pero el evento principal es el que la gente busca.
  const epicentroId = useMemo(() => {
    let best: Earthquake | null = null;
    for (const q of earthquakes) {
      if (!best || (q.magnitude ?? 0) > (best.magnitude ?? 0)) best = q;
    }
    return best?.id ?? null;
  }, [earthquakes]);

  if (earthquakes.length === 0) return null;

  return (
    <>
      {earthquakes.map((q) => {
        const isEpicentro = q.id === epicentroId;
        const color = colorFor(q.magnitude);
        const r = radiusFor(q.magnitude);

        return (
          <Fragment key={q.id}>
            {/* Anillos del epicentro: por debajo del circulo, sin interaccion
                para no robarle el click al popup. */}
            {isEpicentro && (
              <>
                <CircleMarker
                  center={[q.lat, q.lng]}
                  radius={r * 2.6}
                  interactive={false}
                  pathOptions={{
                    color,
                    weight: 1,
                    opacity: 0.35,
                    fillColor: color,
                    fillOpacity: 0.06,
                  }}
                />
                <CircleMarker
                  center={[q.lat, q.lng]}
                  radius={r * 1.7}
                  interactive={false}
                  pathOptions={{
                    color,
                    weight: 1.5,
                    opacity: 0.55,
                    fillColor: color,
                    fillOpacity: 0.1,
                  }}
                />
              </>
            )}

            <CircleMarker
              center={[q.lat, q.lng]}
              radius={r}
              pathOptions={{
                color: "#ffffff",
                weight: isEpicentro ? 2.5 : 1.5,
                opacity: 0.95,
                fillColor: color,
                fillOpacity: isEpicentro ? 0.95 : 0.75,
              }}
            >
              <Popup>
                <div className="text-sm">
                  <p className="font-semibold">
                    {isEpicentro && <>Epicentro · </>}
                    {magLabel(q.magnitude)}
                  </p>
                  <p>{q.place}</p>
                  <p className="mt-1 opacity-80">
                    {q.depthKm !== null && <>Profundidad {Math.round(q.depthKm)} km · </>}
                    {timeAgo(q.occurredAt)}
                  </p>
                  {q.tsunami && (
                    <p className="mt-1 font-semibold">Aviso de tsunami del USGS</p>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          </Fragment>
        );
      })}
    </>
  );
}

/** Memoizado: el mapa re-renderiza al mover/zoom, y el catalogo casi nunca
 * cambia (se refresca cada minuto). */
export const EarthquakeLayer = memo(EarthquakeLayerBase);
