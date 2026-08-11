export type PetReportType = "missing" | "found";

export interface PetPayload {
  name: string;
  species: string;
  breed: string;
  color: string;
  sex: string | null;
  age: string;
  lastSeen: string;
  description: string;
  contact: string;
  microchip: string | null;
  photo: string | null;
  reportType: PetReportType;
  /** Coordenadas de la zona, si se pudo geocodificar. null = no va al mapa. */
  lat: number | null;
  lng: number | null;
  turnstileToken?: string;
}
