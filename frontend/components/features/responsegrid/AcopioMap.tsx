"use client";

import { useMemo } from "react";
import L from "leaflet";
import { useClientMount } from "@/hooks/useClientMount";
import { MapContainer, Marker, Popup, TileLayer, ZoomControl } from "react-leaflet";
import type { CollectionCenter } from "@/hooks/acopio";
import { ResizeHandler } from "@/components/features/map/handlers";
import { deploymentConfig } from "@/lib/deployment-config";

const DEFAULT_CENTER: L.LatLngExpression = deploymentConfig.mapCenter;
const DEFAULT_ZOOM = 7;

function acopioIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<span style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:9999px;background:#1f8a5b;color:#fff;font-size:11px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.25)">●</span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

interface AcopioMapProps {
  centers: CollectionCenter[];
  onSelect?: (center: CollectionCenter) => void;
}

function AcopioMapInner({ centers, onSelect }: AcopioMapProps) {
  const icon = useMemo(() => acopioIcon(), []);
  const mappable = useMemo(
    () => centers.filter((c) => c.lat != null && c.lng != null),
    [centers],
  );

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      scrollWheelZoom
      zoomControl={false}
      className="h-full w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ZoomControl position="topright" />
      <ResizeHandler />
      {mappable.map((center) => (
        <Marker
          key={center.id}
          position={[center.lat!, center.lng!]}
          icon={icon}
          eventHandlers={{
            click: () => onSelect?.(center),
          }}
        >
          <Popup>
            <strong>{center.name}</strong>
            {center.city && (
              <p className="mt-1 text-xs text-slate-600">{center.city}</p>
            )}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

export default function AcopioMap(props: AcopioMapProps) {
  const mounted = useClientMount();
  if (!mounted) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-100 text-sm text-slate-500">
        Cargando mapa…
      </div>
    );
  }
  return <AcopioMapInner {...props} />;
}
