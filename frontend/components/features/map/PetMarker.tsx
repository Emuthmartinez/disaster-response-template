import { memo } from "react";
import L from "leaflet";
import { Marker, Popup } from "react-leaflet";
import { mediaUrl } from "@/lib/api";
import { jitterPosition } from "./icons";

/**
 * Pin propio de mascotas. NO se añade a `markerIcon()` de icons.ts porque esa
 * función se indexa por `ReportType` y las mascotas no son un tipo de reporte de
 * emergencia; meterlas ahí las colaría en los chips del formulario de reportes.
 * Reutiliza las clases CSS del pin de emergencia para verse igual.
 */
let petIconCache: L.DivIcon | null = null;
function petIcon(): L.DivIcon {
	if (petIconCache) return petIconCache;
	petIconCache = L.divIcon({
		className: "emergency-marker",
		html: `<span class="emergency-pin" style="background:#7c3aed"><span class="emergency-pin__icon">🐾</span></span>`,
		iconSize: [34, 34],
		iconAnchor: [17, 34],
		popupAnchor: [0, -30],
	});
	return petIconCache;
}

export interface PetPointProps {
	id: string;
	name: string;
	species: string;
	breed: string;
	lastSeen: string;
	photoUrl: string | null;
}

/** Nombre mostrable. Duplica la lógica de lib/pets.petDisplayName a propósito:
 *  este módulo lo carga Leaflet en el bundle del mapa y se mantiene sin más
 *  dependencias de dominio que las estrictamente necesarias. */
function displayName(p: PetPointProps): string {
	const name = p.name?.trim();
	if (name) return name;
	const species = p.species?.trim();
	if (!species) return "Mascota sin identificar";
	return `${species.charAt(0).toUpperCase()}${species.slice(1)} sin identificar`;
}

/** Pin de mascota perdida (con jitter determinístico + popup). Memoizado: el
 *  cluster layer re-renderiza en cada pan/zoom pero los datos del punto no
 *  cambian, así que evitamos recrear el Marker/Popup. */
function PetMarkerBase({
	point,
	lat,
	lng,
	markerRefs,
}: {
	point: PetPointProps;
	lat: number;
	lng: number;
	markerRefs: React.MutableRefObject<Map<string, L.Marker>>;
}) {
	const p = point;
	const [jLat, jLng] = jitterPosition(p.id, lat, lng);
	const markerId = `pet:${p.id}`;
	const name = displayName(p);
	const photo = mediaUrl(p.photoUrl);
	return (
		<Marker
			position={[jLat, jLng]}
			icon={petIcon()}
			ref={(ref) => {
				if (ref) markerRefs.current.set(markerId, ref);
				else markerRefs.current.delete(markerId);
			}}
		>
			<Popup>
				<div className="min-w-[180px]">
					{photo && (
						// eslint-disable-next-line @next/next/no-img-element
						<img
							src={photo}
							alt={`Foto de ${name}`}
							className="mb-2 h-24 w-full rounded object-cover"
						/>
					)}
					<strong className="block text-sm">{name}</strong>
					{p.breed && <span className="block text-xs text-slate-600">{p.breed}</span>}
					{p.lastSeen && (
						<span className="mt-1 block text-xs text-slate-500">{p.lastSeen}</span>
					)}
					<a
						href="#mascotas"
						className="mt-2 inline-block text-xs font-semibold text-violet-700 underline"
					>
						Ver en el directorio
					</a>
				</div>
			</Popup>
		</Marker>
	);
}

export const PetMarker = memo(PetMarkerBase);
