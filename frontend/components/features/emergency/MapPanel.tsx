"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import AddressSearch, {
	type GeocodeResult,
} from "@/components/features/emergency/AddressSearch";
import type { MapBounds } from "@/components/features/map";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import type { MissingMapMarker } from "@/hooks/missing";
import type { EmergencyReport, ReportType } from "@/lib/types";
import { deploymentConfig } from "@/lib/deployment-config";
import FilterChips from "./FilterChips";

// Mapa Leaflet: pesado + depende de window. next/dynamic ssr:false lo saca del
// bundle inicial y lo carga en cliente solo cuando esta vista se monta.
const MapView = dynamic(() => import("@/components/features/map"), {
	ssr: false,
	loading: () => (
		<div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-500">
			Cargando mapa…
		</div>
	),
});

export interface MapPanelProps {
	mapReports: EmergencyReport[];
	missingMapMarkers: MissingMapMarker[];
	showMissingOnMap: boolean;
	draft: { lat: number; lng: number } | null;
	confirmed: Set<string>;
	isAdmin: boolean;
	focus: { lat: number; lng: number; ts: number; id?: string } | null;
	fitRequest: { points: { lat: number; lng: number }[]; ts: number } | null;
	center: [number, number];
	selectedTypes: Set<ReportType>;
	counts: Record<ReportType, number>;
	addressBias: { lat: number; lng: number };
	placing: boolean;
	shareCopied: boolean;
	onBoundsChange: (bounds: MapBounds) => void;
	onPick: (lat: number, lng: number) => void;
	onResolve: (id: string) => void;
	onConfirm: (id: string) => void;
	onAddressSelect: (result: GeocodeResult) => void;
	onChipClick: (type: ReportType) => void;
	onCancelPlacing: () => void;
	onShare: () => void;
	onStartReport: () => void;
}

export default function MapPanel({
	mapReports,
	missingMapMarkers,
	showMissingOnMap,
	draft,
	confirmed,
	isAdmin,
	focus,
	fitRequest,
	center,
	selectedTypes,
	counts,
	addressBias,
	placing,
	shareCopied,
	onBoundsChange,
	onPick,
	onResolve,
	onConfirm,
	onAddressSelect,
	onChipClick,
	onCancelPlacing,
	onShare,
	onStartReport,
}: MapPanelProps) {
	const [showRain, setShowRain] = useState(false);
	const [showClouds, setShowClouds] = useState(false);
	return (
		<div
			className={`map-shell e-leaflet-wrap relative h-full min-h-[360px] w-full overflow-hidden md:min-h-[560px] ${
				placing ? "is-placing" : ""
			}`}
		>
			<ErrorBoundary
				fallback={
					<div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-100 p-6 text-center text-sm text-slate-600">
						<span className="text-2xl" aria-hidden>
							🗺️
						</span>
						<p className="font-semibold">No se pudo cargar el mapa</p>
						<p>Recarga la página para volver a intentarlo.</p>
					</div>
				}
			>
				<MapView
					reports={mapReports}
					missingMarkers={missingMapMarkers}
					showMissingOnMap={showMissingOnMap}
					onBoundsChange={onBoundsChange}
					draft={draft}
					onPick={onPick}
					onResolve={onResolve}
					onConfirm={onConfirm}
					confirmed={confirmed}
					isAdmin={isAdmin}
					focus={focus}
					center={center}
					zoom={deploymentConfig.mapZoom}
					fitRequest={fitRequest}
					showRain={showRain}
					showClouds={showClouds}
				/>
			</ErrorBoundary>

			{/* Buscador + filtros por tipo sobre el mapa (referencia QiHealth). */}
			<div className="map-overlay pointer-events-none absolute inset-x-0 top-0 z-[1000] flex flex-col gap-2 p-3 sm:pr-14">
				<div className="pointer-events-auto flex min-w-0 flex-col gap-2 xl:flex-row xl:items-stretch">
					<div className="w-full shrink-0 xl:max-w-xs">
						<AddressSearch onSelect={onAddressSelect} bias={addressBias} />
					</div>
					<FilterChips
						selectedTypes={selectedTypes}
						counts={counts}
						onChipClick={onChipClick}
					/>
				</div>
			</div>

			<div className="map-overlay pointer-events-auto absolute right-3 top-20 z-[1000] flex flex-col gap-1.5 rounded-lg bg-white/95 p-1.5 shadow-lg ring-1 ring-black/5 backdrop-blur">
				<button
					type="button"
					onClick={() => setShowRain((v) => !v)}
					aria-pressed={showRain}
					aria-label="Mostrar lluvia en el mapa"
					title="Radar de lluvia (RainViewer)"
					className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${
						showRain
							? "bg-blue-600 text-white"
							: "text-slate-600 hover:bg-slate-100"
					}`}
				>
					<span aria-hidden>🌧️</span>
					<span>Lluvia</span>
				</button>
				<button
					type="button"
					onClick={() => setShowClouds((v) => !v)}
					aria-pressed={showClouds}
					aria-label="Mostrar nubes en el mapa"
					title="Nubes globales (EUMETSAT)"
					className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${
						showClouds
							? "bg-slate-600 text-white"
							: "text-slate-600 hover:bg-slate-100"
					}`}
				>
					<span aria-hidden>☁️</span>
					<span>Nubes</span>
				</button>
			</div>

			{/* Modo "elegir en el mapa": atenúa el mapa y muestra una instrucción
          prominente. El modal queda oculto pero montado (no se pierde lo escrito). */}
			{placing && (
				<>
					<div
						className="pointer-events-none absolute inset-0 z-[1150] bg-slate-900/25"
						aria-hidden
					/>
					<div className="pointer-events-auto absolute inset-x-0 top-0 z-[1200] flex items-center justify-between gap-3 bg-slate-900 px-4 py-3 text-white shadow-lg">
						<span className="flex items-center gap-2 text-sm font-semibold">
							<span aria-hidden className="text-base">
								📍
							</span>
							Toca el mapa para ubicar el reporte
						</span>
						<button
							type="button"
							onClick={onCancelPlacing}
							className="shrink-0 rounded-md border border-white/40 px-3 py-1.5 text-xs font-semibold transition hover:bg-white/10"
						>
							Volver
						</button>
					</div>
				</>
			)}

			{/* Barra de acción flotante abajo: reportar + compartir */}
			<div className="map-overlay pointer-events-none absolute inset-x-0 bottom-3 z-[1000] flex justify-center px-3">
				<div className="pointer-events-auto flex items-center gap-2 rounded-full bg-white/95 p-1.5 shadow-lg ring-1 ring-black/5 backdrop-blur">
					<button
						type="button"
						onClick={onShare}
						aria-label="Compartir el mapa"
						title="Compartir el mapa"
						className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
					>
						<span aria-hidden>{shareCopied ? "✓" : "🔗"}</span>
						<span>{shareCopied ? "Copiado" : "Compartir"}</span>
					</button>
					<button
						type="button"
						onClick={onStartReport}
						className="shrink-0 rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
					>
						Reportar Información
					</button>
				</div>
			</div>
		</div>
	);
}
