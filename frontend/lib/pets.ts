// Tipos y helpers puros del dominio "pets" (sin React ni TanStack Query).
// Viven aquí —y NO en hooks/pets.ts ("use client")— para poder reutilizarlos
// desde el servidor (prefetch SSR en app/(app)/page.tsx) sin cruzar la frontera
// cliente/servidor. Mismo patrón que lib/missing.ts.
//
// Estos tipos ESPEJAN el DTO de backend/src/services/pets.ts. Nota lo que NO
// está: el número de microchip. El backend nunca lo serializa; aquí solo llega
// `hasMicrochip`. Si algún día aparece en esta interfaz, es un bug de backend.

export type PetSex = "macho" | "hembra" | "desconocido";
export type PetStatus = "active" | "found";
export type PetReportType = "missing" | "found";

export interface Pet {
  id: string;
  /** Puede venir vacío: quien encuentra un animal rara vez sabe su nombre. */
  name: string;
  species: string;
  breed: string;
  color: string;
  sex: PetSex | null;
  age: number | null;
  description: string;
  lastSeen: string;
  contact: string;
  hasMicrochip: boolean;
  photoUrl: string | null;
  status?: PetStatus;
  resolutionNote?: string | null;
  resolutionPhotoUrl?: string | null;
  resolvedAt?: number | null;
  createdAt: number;
}

/** Marcador ligero para el mapa (subset de Pet + lat/lng). */
export interface PetMapMarker {
  id: string;
  name: string;
  species: string;
  breed: string;
  lastSeen: string;
  photoUrl: string | null;
  lat: number;
  lng: number;
  createdAt: number;
}

export interface PetListResponse {
  pets: Pet[];
  total: number;
  totalCapped: boolean;
  page: number;
  pageSize: number;
  totalPages: number;
  persistent: boolean;
}

export interface PetStats {
  active: number;
  found: number;
  total: number;
  onMap: number;
  /**
   * Solo presente cuando el service worker sirvió RESPALDO cacheado (backend
   * inalcanzable o lento): epoch-ms de cuándo se cacheó ese snapshot. La UI
   * lo usa para avisar "datos guardados de hace X" en vez de presentar
   * números congelados como actuales. En SSR/prefetch nunca viene.
   */
  swStaleAt?: number;
}

export interface PetListParams {
  status: "active" | "found" | "all";
  page: number;
  pageSize: number;
  q?: string;
  species?: string;
}

/** Mínimo de caracteres para que el backend trate `q` como búsqueda real. */
export const MIN_SEARCH_LEN = 3;

/** Igual que en personas: FIJO, para que la queryKey del servidor y la del
 *  cliente coincidan y la lista llegue ya pintada en el HTML. Ver lib/missing.ts. */
export const PET_LIST_PAGE_SIZE = 8;

/** Estado inicial del directorio de mascotas: mismo valor en servidor y en PetsTab. */
export const PET_DEFAULT_LIST_PARAMS: PetListParams = {
  status: "all",
  page: 1,
  pageSize: PET_LIST_PAGE_SIZE,
};

/**
 * Especies con chip propio en la UI. `otro` es la válvula de escape: en un
 * sismo la gente también busca gallinas, caballos y loros, y una lista
 * cerrada haría que esos reportes se perdieran.
 */
export const PET_SPECIES_OPTIONS = [
  { value: "perro", label: "Perro", icon: "🐕" },
  { value: "gato", label: "Gato", icon: "🐈" },
  { value: "ave", label: "Ave", icon: "🦜" },
  { value: "otro", label: "Otra", icon: "🐾" },
] as const;

export const PET_SEX_OPTIONS: { value: PetSex; label: string }[] = [
  { value: "macho", label: "Macho" },
  { value: "hembra", label: "Hembra" },
  { value: "desconocido", label: "No sé" },
];

/** Etiqueta mostrable de una mascota sin nombre conocido. */
export const UNNAMED_PET_LABEL = "Mascota sin identificar";

/** Nombre para mostrar: nunca una cadena vacía en la UI. */
export function petDisplayName(pet: Pick<Pet, "name" | "species">): string {
  const name = pet.name?.trim();
  if (name) return name;
  const species = pet.species?.trim();
  if (!species) return UNNAMED_PET_LABEL;
  // "Perro sin identificar" lee mejor que "Mascota sin identificar" cuando al
  // menos sabemos la especie.
  return `${species.charAt(0).toUpperCase()}${species.slice(1)} sin identificar`;
}

/** Viewport del mapa. Se declara aquí (y no se importa de components/features/map)
 *  para que lib/pets.ts siga siendo utilizable desde el servidor. */
export interface MapBoundsLike {
  north: number;
  south: number;
  east: number;
  west: number;
}

/** URL de los marcadores del mapa, acotada al viewport si lo hay. */
export function buildPetsMapUrl(bounds: MapBoundsLike | null): string {
  return bounds
    ? `/api/pets/map?north=${bounds.north}&south=${bounds.south}&east=${bounds.east}&west=${bounds.west}&limit=800`
    : "/api/pets/map?limit=800";
}

/** URL relativa del listado. Compartida por el hook cliente y el prefetch SSR
 *  para garantizar que ambos piden EXACTAMENTE lo mismo. */
export function buildPetsUrl(p: PetListParams): string {
  const sp = new URLSearchParams({
    status: p.status,
    page: String(p.page),
    pageSize: String(p.pageSize),
  });
  if (p.q && p.q.length >= MIN_SEARCH_LEN) sp.set("q", p.q);
  if (p.species) sp.set("species", p.species);
  return `/api/pets?${sp.toString()}`;
}
