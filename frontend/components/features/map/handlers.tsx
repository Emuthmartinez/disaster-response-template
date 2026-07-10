import { useEffect, useRef } from "react";
import L from "leaflet";
import { useMap, useMapEvents } from "react-leaflet";
import type { MapBounds } from "./types";

export function FlyToHandler({
	focus,
	getMarker,
}: {
	focus: { lat: number; lng: number; ts: number; id?: string } | null;
	getMarker: (id: string) => L.Marker | undefined;
}) {
	const map = useMap();
	const lastTs = useRef<number | null>(null);
	useEffect(() => {
		if (!focus || focus.ts === lastTs.current) return;
		lastTs.current = focus.ts;
		map.flyTo([focus.lat, focus.lng], Math.max(map.getZoom(), 16), {
			duration: 1,
		});
		if (focus.id) {
			const id = focus.id;
			map.once("moveend", () => {
				getMarker(id)?.openPopup();
			});
		}
	}, [focus, map, getMarker]);
	return null;
}

/** Cierra el popup abierto al presionar Esc o al clicar FUERA del mapa (Leaflet
 * solo lo cierra al clicar dentro de su contenedor). Acotado: no hace nada si
 * hay un modal/diálogo abierto (lo maneja él). */
export function EscClosePopup() {
	const map = useMap();
	useEffect(() => {
		const modalOpen = () =>
			!!document.querySelector(
				'[role="dialog"][aria-modal="true"]:not(.hidden)',
			);
		const popupOpen = () => !!document.querySelector(".leaflet-popup");

		const onKey = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			if (modalOpen()) return;
			if (popupOpen()) {
				map.closePopup();
				event.stopPropagation();
			}
		};
		const onPointerDown = (event: MouseEvent) => {
			if (!popupOpen() || modalOpen()) return;
			// Los clics DENTRO del mapa (marcadores, mapa, popup) los maneja Leaflet;
			// cerramos solo cuando el clic cae FUERA del contenedor del mapa.
			if (map.getContainer().contains(event.target as Node)) return;
			map.closePopup();
		};

		window.addEventListener("keydown", onKey, true);
		document.addEventListener("mousedown", onPointerDown, true);
		return () => {
			window.removeEventListener("keydown", onKey, true);
			document.removeEventListener("mousedown", onPointerDown, true);
		};
	}, [map]);
	return null;
}

/** Centra y hace zoom para que entren en pantalla los pines del filtro activo. */
export function FitToBoundsHandler({
	fitRequest,
}: {
	fitRequest: { points: { lat: number; lng: number }[]; ts: number } | null;
}) {
	const map = useMap();
	const lastTs = useRef<number | null>(null);
	useEffect(() => {
		if (!fitRequest || fitRequest.ts === lastTs.current) return;
		lastTs.current = fitRequest.ts;
		const pts = fitRequest.points;
		if (pts.length === 0) return;
		if (pts.length === 1) {
			map.flyTo([pts[0].lat, pts[0].lng], Math.max(map.getZoom(), 15), {
				duration: 0.6,
			});
			return;
		}
		const bounds = L.latLngBounds(
			pts.map((p) => [p.lat, p.lng] as [number, number]),
		);
		map.flyToBounds(bounds, { padding: [60, 60], maxZoom: 16, duration: 0.6 });
	}, [fitRequest, map]);
	return null;
}

export function ResizeHandler() {
	const map = useMap();
	useEffect(() => {
		const invalidate = () => map.invalidateSize();
		const timeout = setTimeout(invalidate, 200);
		window.addEventListener("resize", invalidate);
		window.addEventListener("orientationchange", invalidate);
		let observer: ResizeObserver | null = null;
		if (typeof ResizeObserver !== "undefined") {
			observer = new ResizeObserver(() => map.invalidateSize());
			observer.observe(map.getContainer());
		}
		return () => {
			clearTimeout(timeout);
			window.removeEventListener("resize", invalidate);
			window.removeEventListener("orientationchange", invalidate);
			observer?.disconnect();
		};
	}, [map]);
	return null;
}

export function ClickHandler({
	onPick,
}: {
	onPick: (lat: number, lng: number) => void;
}) {
	useMapEvents({
		click(event) {
			onPick(event.latlng.lat, event.latlng.lng);
		},
	});
	return null;
}

const BOUNDS_DEBOUNCE_MS = 350;

export function BoundsHandler({
	onBoundsChange,
}: {
	onBoundsChange?: (bounds: MapBounds) => void;
}) {
	const map = useMap();
	useEffect(() => {
		if (!onBoundsChange) return;
		let timer: ReturnType<typeof setTimeout> | null = null;
		const read = () => {
			const b = map.getBounds();
			onBoundsChange({
				north: b.getNorth(),
				south: b.getSouth(),
				east: b.getEast(),
				west: b.getWest(),
			});
		};
		// Primer encuadre inmediato; pans/zooms posteriores con debounce (~350ms)
		// para no disparar un request por cada frame de movimiento.
		read();
		const emit = () => {
			if (timer) clearTimeout(timer);
			timer = setTimeout(read, BOUNDS_DEBOUNCE_MS);
		};
		map.on("moveend", emit);
		map.on("zoomend", emit);
		return () => {
			if (timer) clearTimeout(timer);
			map.off("moveend", emit);
			map.off("zoomend", emit);
		};
	}, [map, onBoundsChange]);
	return null;
}
