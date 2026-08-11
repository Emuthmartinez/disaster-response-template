import { useCallback, useEffect, useMemo, useState } from "react";
import L from "leaflet";
import { Marker, useMap, useMapEvents } from "react-leaflet";
import Supercluster, {
	type ClusterProperties,
	type AnyProps,
} from "supercluster";
import type { PetMapMarker } from "@/lib/pets";
import { clusterIcon } from "./icons";
import { PetMarker, type PetPointProps } from "./PetMarker";

/**
 * Capa de clusters de MASCOTAS. Es un gemelo de MissingClusterLayer en vez de una
 * generalización de ella: esa capa pinta el mapa de personas desaparecidas en un
 * sitio en producción, y refactorizarla para compartir código habría puesto ese
 * camino en riesgo a cambio de ahorrar ~80 líneas. Mismo criterio que en backend
 * (ver services/pets.ts).
 *
 * SI TOCAS UNA, MIRA LA OTRA: comparten comportamiento (radio de cluster, zoom
 * máximo, expansión al hacer clic) y deberían seguir haciéndolo.
 */
type ClusterFeature = ReturnType<Supercluster<PetPointProps>["getClusters"]>[number];
type ClusterOrPoint = (ClusterProperties & AnyProps) | PetPointProps;

export function PetClusterLayer({
	markers,
	markerRefs,
}: {
	markers: PetMapMarker[];
	markerRefs: React.MutableRefObject<Map<string, L.Marker>>;
}) {
	const map = useMap();
	const [clusters, setClusters] = useState<ClusterFeature[]>([]);

	const sc = useMemo(() => {
		const index = new Supercluster<PetPointProps>({ radius: 60, maxZoom: 17 });
		index.load(
			markers.map((m) => ({
				type: "Feature" as const,
				geometry: { type: "Point" as const, coordinates: [m.lng, m.lat] },
				properties: {
					id: m.id,
					name: m.name,
					species: m.species,
					breed: m.breed,
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
							key={`pet-cluster-${clusterId}`}
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

				const p = props as PetPointProps;
				return (
					<PetMarker
						key={`pet:${p.id}`}
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
