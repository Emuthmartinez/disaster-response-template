import { memo } from "react";
import L from "leaflet";
import { Marker, Popup } from "react-leaflet";
import { REPORT_TYPES } from "@/lib/types";
import { mediaUrl } from "@/lib/api";
import { jitterPosition, markerIcon } from "./icons";

export interface MissingPointProps {
	id: string;
	name: string;
	age: number | null;
	nationality: string;
	lastSeen: string;
	photoUrl: string | null;
}

/** Pin de persona desaparecida (con jitter determinístico + popup). Memoizado:
 * el cluster layer re-renderiza en cada pan/zoom pero los datos del punto no
 * cambian, así que evitamos recrear el Marker/Popup. */
function MissingMarkerBase({
	point,
	lat,
	lng,
	markerRefs,
}: {
	point: MissingPointProps;
	lat: number;
	lng: number;
	markerRefs: React.MutableRefObject<Map<string, L.Marker>>;
}) {
	const p = point;
	const [jLat, jLng] = jitterPosition(p.id, lat, lng);
	const markerId = `missing:${p.id}`;
	const personMeta = [
		p.age !== null ? `${p.age} años` : null,
		p.nationality || null,
	]
		.filter(Boolean)
		.join(" · ");
	return (
		<Marker
			key={markerId}
			position={[jLat, jLng]}
			icon={markerIcon("missing")}
			ref={(marker) => {
				if (marker) markerRefs.current.set(markerId, marker);
				else markerRefs.current.delete(markerId);
			}}
		>
			<Popup>
				<div className="space-y-1.5 text-sm">
					<p className="font-semibold">
						{REPORT_TYPES.missing.emoji} Se busca
					</p>
					{p.photoUrl && (
						// eslint-disable-next-line @next/next/no-img-element
						<img
							src={mediaUrl(p.photoUrl)}
							alt={`Foto de ${p.name}`}
							loading="lazy"
							className="my-1 max-h-52 w-full rounded-lg bg-slate-100 object-contain"
						/>
					)}
					<p className="font-medium">{p.name}</p>
					{personMeta && (
						<p className="text-xs text-slate-600">{personMeta}</p>
					)}
					{p.lastSeen && <p className="text-slate-600">📍 {p.lastSeen}</p>}
					<a
						href="#e-directory"
						className="mt-1 inline-block text-xs font-medium text-purple-700 underline"
					>
						Ver ficha completa →
					</a>
				</div>
			</Popup>
		</Marker>
	);
}

export const MissingMarker = memo(MissingMarkerBase);
