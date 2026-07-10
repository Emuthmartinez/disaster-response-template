"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import { deploymentConfig } from "@/lib/deployment-config";
import {
  SEISMIC_RISK_AOIS,
  SEISMIC_RISK_CITIES,
  type SeismicRiskLevel,
} from "@/lib/seismic-risk";
import { formatLocaleNumber } from "@/lib/format";

const levelColor: Record<SeismicRiskLevel, string> = {
  critical: "#dc2626",
  high: "#d97706",
};

const levelLabel: Record<SeismicRiskLevel, string> = {
  critical: "Crítico",
  high: "Alto",
};

// Filtro de área: "all" recentra en el mapCenter configurado; el resto son las
// AOIs (áreas de interés) definidas en lib/event-data.ts. Un deployment real
// puede añadir más AOIs sin tocar este componente.
type AreaFilter = "all" | number;

const DEFAULT_ZOOM = deploymentConfig.mapZoom;
const ALL_FOCUS: { center: [number, number]; zoom: number } = {
  center: deploymentConfig.mapCenter,
  zoom: Math.max(DEFAULT_ZOOM - 4, 5),
};

function focusFor(area: AreaFilter): { center: [number, number]; zoom: number } {
  if (area === "all") return ALL_FOCUS;
  const aoi = SEISMIC_RISK_AOIS[area];
  if (!aoi) return ALL_FOCUS;
  return { center: aoi.center, zoom: DEFAULT_ZOOM };
}

function MapFocus({ selectedArea }: { selectedArea: AreaFilter }) {
  const map = useMap();

  useEffect(() => {
    const next = focusFor(selectedArea);
    map.flyTo(next.center, next.zoom, { duration: 0.45 });
  }, [map, selectedArea]);

  return null;
}

export default function SeismicRiskLeafletMap() {
  const [selectedArea, setSelectedArea] = useState<AreaFilter>(
    SEISMIC_RISK_AOIS.length > 0 ? 0 : "all",
  );

  const initialFocus = useMemo(() => focusFor(selectedArea), [selectedArea]);

  return (
    <div className="relative h-full min-h-[360px] w-full">
      <div className="absolute bottom-8 right-3 z-[650] flex max-w-[calc(100%-1.5rem)] flex-wrap justify-end gap-1.5 rounded-xl bg-white/95 p-1.5 text-xs font-semibold shadow-sm ring-1 ring-slate-200 backdrop-blur">
        {SEISMIC_RISK_AOIS.map((area, index) => (
          <button
            key={area.name}
            type="button"
            onClick={() => setSelectedArea(index)}
            className={`rounded-lg px-2.5 py-1.5 ${
              selectedArea === index
                ? "bg-slate-950 text-white"
                : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            {area.area}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setSelectedArea("all")}
          className={`rounded-lg px-2.5 py-1.5 ${
            selectedArea === "all"
              ? "bg-slate-950 text-white"
              : "text-slate-700 hover:bg-slate-100"
          }`}
        >
          Todo
        </button>
      </div>

      <MapContainer
        center={initialFocus.center}
        zoom={initialFocus.zoom}
        minZoom={4}
        preferCanvas
        scrollWheelZoom={false}
        className="h-full min-h-[360px] w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapFocus selectedArea={selectedArea} />

        {SEISMIC_RISK_AOIS.map((area) => (
          <Circle
            key={area.name}
            center={area.center}
            radius={area.radiusKm * 1000}
            pathOptions={{
              color: "#b91c1c",
              fillColor: "#ef4444",
              fillOpacity: 0.1,
              opacity: 0.5,
              weight: 1.5,
            }}
          >
            <Popup>
              <div className="space-y-1 text-sm">
                <p className="font-semibold">{area.name}</p>
                <p>
                  {formatLocaleNumber(area.criticalBuildings)} edificios OSM
                  priorizados
                </p>
                <p className="text-xs text-slate-500">{area.basis}</p>
              </div>
            </Popup>
          </Circle>
        ))}

        {SEISMIC_RISK_CITIES.map((city) => (
          <CircleMarker
            key={city.city}
            center={[city.lat, city.lng]}
            radius={city.level === "critical" ? 9 : 7}
            pathOptions={{
              color: "#ffffff",
              fillColor: levelColor[city.level],
              fillOpacity: 0.92,
              opacity: 1,
              weight: 2,
            }}
          >
            <Popup>
              <div className="space-y-1 text-sm">
                <p className="font-semibold">
                  #{city.rank} {city.city}
                </p>
                <p>{city.state}</p>
                <p>
                  Nivel: <strong>{levelLabel[city.level]}</strong>
                </p>
                <p>MMI estimado: {city.mmi.toFixed(2)}</p>
                <p>Población: {formatLocaleNumber(city.population)}</p>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
