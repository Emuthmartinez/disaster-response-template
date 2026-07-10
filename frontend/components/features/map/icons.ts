import L from "leaflet";
import { REPORT_TYPES, type ReportType } from "@/lib/types";

/** Desplaza determinísticamente un pin para que dos reportes en la misma
 * coordenada no se solapen (mismo id => mismo offset, estable entre renders). */
export function jitterPosition(
	id: string,
	lat: number,
	lng: number,
): [number, number] {
	let h = 0;
	for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
	const angle = ((h % 360) * Math.PI) / 180;
	const radius = 0.00025 * ((Math.abs(h) % 8) + 1);
	return [lat + radius * Math.cos(angle), lng + radius * Math.sin(angle)];
}

const iconCache = new Map<ReportType, L.DivIcon>();

export function markerIcon(type: ReportType): L.DivIcon {
	const cached = iconCache.get(type);
	if (cached) return cached;
	const meta = REPORT_TYPES[type];
	const icon = L.divIcon({
		className: "emergency-marker",
		html: `<span class="emergency-pin" style="background:${meta.color}"><span class="emergency-pin__icon">${meta.icon}</span></span>`,
		iconSize: [34, 34],
		iconAnchor: [17, 34],
		popupAnchor: [0, -30],
	});
	iconCache.set(type, icon);
	return icon;
}

/** Devuelve bg sólido, anillo exterior y tamaño del cluster según el número de puntos. */
function clusterVisual(count: number): {
	bg: string;
	ring: string;
	size: number;
} {
	const size =
		count >= 500
			? 72
			: count >= 100
				? 60
				: count >= 50
					? 52
					: count >= 20
						? 44
						: count >= 10
							? 38
							: 32;

	if (count >= 50) return { bg: "#dc2626", ring: "rgba(220,38,38,0.28)", size };
	if (count >= 10) return { bg: "#d97706", ring: "rgba(217,119,6,0.28)", size };
	return { bg: "#2563eb", ring: "rgba(37,99,235,0.28)", size };
}

export function clusterIcon(count: number): L.DivIcon {
	const { bg, ring, size } = clusterVisual(count);
	const inner = Math.round(size * 0.72);
	const label = count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count);
	const fs = inner < 36 ? 11 : 13;
	return L.divIcon({
		className: "",
		html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${ring};display:flex;align-items:center;justify-content:center;"><div style="width:${inner}px;height:${inner}px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;color:#fff;font-size:${fs}px;font-weight:700;font-family:system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.35);">${label}</div></div>`,
		iconSize: [size, size],
		iconAnchor: [size / 2, size / 2],
	});
}

/** Icono del pin "borrador" mientras el usuario elige ubicación en el mapa. */
export function draftIcon(): L.DivIcon {
	return L.divIcon({
		className: "emergency-marker",
		html: `<span class="emergency-pin emergency-pin--draft"></span>`,
		iconSize: [34, 34],
		iconAnchor: [17, 34],
	});
}
