import { useCallback, useEffect, useMemo, useState } from "react";
import L from "leaflet";
import { Marker, useMap, useMapEvents } from "react-leaflet";
import Supercluster, {
	type ClusterProperties,
	type AnyProps,
} from "supercluster";
import type { MissingMapMarker } from "@/hooks/missing";
import { clusterIcon } from "./icons";
import { MissingMarker, type MissingPointProps } from "./MissingMarker";

type ClusterFeature = ReturnType<
	Supercluster<MissingPointProps>["getClusters"]
>[number];
type ClusterOrPoint = (ClusterProperties & AnyProps) | MissingPointProps;

export function MissingClusterLayer({
	markers,
	markerRefs,
}: {
	markers: MissingMapMarker[];
	markerRefs: React.MutableRefObject<Map<string, L.Marker>>;
}) {
	const map = useMap();
	const [clusters, setClusters] = useState<ClusterFeature[]>([]);

	const sc = useMemo(() => {
		const index = new Supercluster<MissingPointProps>({
			radius: 60,
			maxZoom: 17,
		});
		index.load(
			markers.map((m) => ({
				type: "Feature" as const,
				geometry: { type: "Point" as const, coordinates: [m.lng, m.lat] },
				properties: {
					id: m.id,
					name: m.name,
					age: m.age,
					nationality: m.nationality,
					lastSeen: m.lastSeen,
					photoUrl: m.photoUrl,
				},
			})),
		);
		return index;
	}, [markers]);

	const updateClusters = useCallback(() => {
		const b = map.getBounds();
		setClusters(
			sc.getClusters(
				[b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
				Math.floor(map.getZoom()),
			),
		);
	}, [map, sc]);

	useEffect(() => {
		const id = requestAnimationFrame(() => updateClusters());
		return () => cancelAnimationFrame(id);
	}, [updateClusters]);

	useMapEvents({ moveend: updateClusters, zoomend: updateClusters });

	return (
		<>
			{clusters.map((feature) => {
				const [lng, lat] = feature.geometry.coordinates;
				const props = feature.properties as ClusterOrPoint;

				if ("cluster" in props && props.cluster) {
					const count = props.point_count as number;
					const clusterId = props.cluster_id as number;
					return (
						<Marker
							key={`cluster-${clusterId}`}
							position={[lat, lng]}
							icon={clusterIcon(count)}
							eventHandlers={{
								click: () => {
									const zoom = sc.getClusterExpansionZoom(clusterId);
									map.flyTo([lat, lng], zoom, { duration: 0.5 });
								},
							}}
						/>
					);
				}

				const p = props as MissingPointProps;
				return (
					<MissingMarker
						key={`missing:${p.id}`}
						point={p}
						lat={lat}
						lng={lng}
						markerRefs={markerRefs}
					/>
				);
			})}
		</>
	);
}
