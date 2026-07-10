"use client";

import type L from "leaflet";
import { useEffect, useState } from "react";
import { ImageOverlay, TileLayer } from "react-leaflet";

const RAINVIEWER_API_URL =
	"https://api.rainviewer.com/public/weather-maps.json";
const CLOUD_OVERLAY_URL =
	"https://clouds.matteason.co.uk/images/4096x2048/clouds-alpha.png";
const CLOUD_OVERLAY_BOUNDS: L.LatLngBoundsExpression = [
	[-90, -180],
	[90, 180],
];
const RADAR_COLOR_UNIVERSAL_BLUE = 2;
const RADAR_TILE_SIZE = 512;
const RADAR_MAX_NATIVE_ZOOM = 7;
const GIBS_MAX_NATIVE_ZOOM = 6;
const RADAR_OPACITY = 0.7;
const GIBS_OPACITY = 0.6;
const CLOUD_OPACITY = 0.65;
const RADAR_REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const GIBS_IMERG_LAG_DAYS = 2;
// ponytail: GIBS date frozen at module load; upgrade path = midnight refresh or interval in useEffect
const GIBS_DATE = new Date(Date.now() - GIBS_IMERG_LAG_DAYS * MS_PER_DAY)
	.toISOString()
	.slice(0, 10);
const GIBS_URL = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/IMERG_Precipitation_Rate/default/${GIBS_DATE}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`;

interface RainViewerFrame {
	time: number;
	path: string;
}

interface RainViewerApiResponse {
	host: string;
	radar: {
		past: RainViewerFrame[];
		nowcast: RainViewerFrame[];
	};
}

export interface WeatherLayerProps {
	showRain: boolean;
	showClouds: boolean;
}

export default function WeatherLayer({
	showRain,
	showClouds,
}: WeatherLayerProps) {
	const [latestRadarPath, setLatestRadarPath] = useState<string | null>(null);

	useEffect(() => {
		if (!showRain) return;
		let cancelled = false;
		const loadLatestRadar = () => {
			fetch(RAINVIEWER_API_URL)
				.then((res) => res.json() as Promise<RainViewerApiResponse>)
				.then((data) => {
					if (cancelled) return;
					const latest = data.radar.past.at(-1);
					if (latest) setLatestRadarPath(`${data.host}${latest.path}`);
				})
				.catch(() => {
					setLatestRadarPath(null);
				});
		};
		loadLatestRadar();
		const intervalId = setInterval(loadLatestRadar, RADAR_REFRESH_INTERVAL_MS);
		return () => {
			cancelled = true;
			clearInterval(intervalId);
		};
	}, [showRain]);

	return (
		<>
			{showRain && (
				<TileLayer
					url={GIBS_URL}
					attribution='Lluvia &copy; <a href="https://earthdata.nasa.gov/gibs">NASA GIBS</a> · GPM IMERG'
					opacity={GIBS_OPACITY}
					zIndex={190}
					maxNativeZoom={GIBS_MAX_NATIVE_ZOOM}
				/>
			)}
			{showRain && latestRadarPath && (
				<TileLayer
					url={`${latestRadarPath}/${RADAR_TILE_SIZE}/{z}/{x}/{y}/${RADAR_COLOR_UNIVERSAL_BLUE}/1_1.png`}
					attribution='Radar &copy; <a href="https://www.rainviewer.com/">RainViewer</a>'
					opacity={RADAR_OPACITY}
					zIndex={200}
					maxNativeZoom={RADAR_MAX_NATIVE_ZOOM}
				/>
			)}
			{showClouds && (
				<ImageOverlay
					url={CLOUD_OVERLAY_URL}
					bounds={CLOUD_OVERLAY_BOUNDS}
					attribution='Nubes &copy; <a href="https://clouds.matteason.co.uk/">matteason/live-cloud-maps</a> · EUMETSAT'
					opacity={CLOUD_OPACITY}
					zIndex={250}
				/>
			)}
		</>
	);
}
