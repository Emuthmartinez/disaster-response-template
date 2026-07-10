import * as geocodeService from "@/services/geocode";
import type { Coordinates, Geocoder } from "../domain/geocoder";

/** Adapta el Geocoder al service de Nominatim ya existente. */
export class NominatimGeocoder implements Geocoder {
  async locate(address: string): Promise<Coordinates | null> {
    const results = await geocodeService.geocode(address, null);
    const best = results[0];
    if (!best) return null;
    return { latitude: best.lat, longitude: best.lng, label: best.label };
  }
}
