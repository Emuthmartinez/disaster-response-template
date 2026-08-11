import type { MissingMapMarker } from "@/hooks/missing";
import type { PetMapMarker } from "@/lib/pets";
import type { EmergencyReport, Earthquake } from "@/lib/types";

export type MapBounds = {
	north: number;
	south: number;
	east: number;
	west: number;
};

export interface MapViewProps {
	reports: EmergencyReport[];
	missingMarkers?: MissingMapMarker[];
	/** Mascotas perdidas con coordenadas. Capa APARTE de missingMarkers. */
	petMarkers?: PetMapMarker[];
	/** Catalogo USGS: circulos por magnitud + anillos en el epicentro. */
	earthquakes?: Earthquake[];
	showMissingOnMap?: boolean;
	showPetsOnMap?: boolean;
	onBoundsChange?: (bounds: MapBounds) => void;
	draft: { lat: number; lng: number } | null;
	onPick: (lat: number, lng: number) => void;
	onResolve: (id: string) => void;
	onConfirm: (id: string) => void;
	confirmed: Set<string>;
	isAdmin: boolean;
	focus: { lat: number; lng: number; ts: number; id?: string } | null;
	center: [number, number];
	zoom: number;
	/**
	 * Encuadre inicial opcional (config/deployment.config.json → mapBbox),
	 * como [[south, west], [north, east]]. Cuando está presente, Leaflet
	 * encuadra el mapa a esta caja en el PRIMER montaje (p.ej. epicentro +
	 * su área de impacto) en vez de solo center/zoom — útil cuando el radio
	 * relevante no es circular. Solo se lee al montar (react-leaflet no
	 * reacciona a cambios posteriores de `bounds`).
	 */
	initialBounds?: [[number, number], [number, number]];
	/** Pedido para encuadrar el mapa a un conjunto de pines (al filtrar por tipo). */
	fitRequest?: { points: { lat: number; lng: number }[]; ts: number } | null;
	/** Overlay meteorologico: radar de lluvia (RainViewer, sin API key). */
	showRain?: boolean;
	/** Overlay meteorologico: nubes globales (matteason/live-cloud-maps, sin API key). */
	showClouds?: boolean;
}
