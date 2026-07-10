export interface Coordinates {
  readonly latitude: number;
  readonly longitude: number;
  readonly label: string | null;
}

/** Puerto de salida: resuelve una dirección a coordenadas; `null` si no la ubica. */
export interface Geocoder {
  locate(address: string): Promise<Coordinates | null>;
}
