import { env } from "@/config/env";
import { PublishNeed } from "./application/publish-need";
import type { NeedItem, Priority } from "./domain/need";
import type { NeedPublisher } from "./domain/need-publisher";
import { NominatimGeocoder } from "./infrastructure/nominatim-geocoder";
import { DisabledNeedPublisher } from "./infrastructure/disabled-need-publisher";
import { ResponseGridNeedsClient } from "./infrastructure/responsegrid/responsegrid-needs-client";
import { ResponseGridNeedPublisher } from "./infrastructure/responsegrid/responsegrid-need-publisher";
import { enqueueNeedPublication } from "./infrastructure/needs-publication-queue";

function createNeedPublisher(): NeedPublisher {
  // Módulo OFF por defecto (gating): sin ENABLE_RESPONSEGRID=true, publicar
  // queda deshabilitado sin importar qué otras vars hayan quedado seteadas.
  // Sin api-key, publicar también queda deshabilitado (el endpoint responde 503).
  if (!env.ENABLE_RESPONSEGRID || !env.RESPONSEGRID_API_KEY) {
    return new DisabledNeedPublisher();
  }
  // Defensivo: env.ts ya falla en el arranque si ENABLE_RESPONSEGRID=true pero
  // faltan estas dos — no debería llegar aquí sin ellas.
  if (!env.RESPONSEGRID_API_URL || !env.RESPONSEGRID_EMERGENCY_SLUG) {
    return new DisabledNeedPublisher();
  }
  return new ResponseGridNeedPublisher(
    new ResponseGridNeedsClient({
      baseUrl: env.RESPONSEGRID_API_URL,
      emergencySlug: env.RESPONSEGRID_EMERGENCY_SLUG,
      apiKey: env.RESPONSEGRID_API_KEY,
    }),
  );
}

/** Composition root: caso de uso compartido por el router y los espejos internos. */
export const publishNeed = new PublishNeed(
  new NominatimGeocoder(),
  createNeedPublisher(),
);

/** Necesidad ya geolocalizada que otro módulo quiere espejar. */
export interface MirrorNeedInput {
  title: string;
  description?: string | null;
  priority: Priority;
  items: NeedItem[];
  address: string;
  latitude: number;
  longitude: number;
}

/**
 * Espeja una necesidad ya geolocalizada sin romper al caller: si la fuente falla o
 * no está configurada, se traga el error y lo registra.
 */
export async function publishNeedAtLocation(
  input: MirrorNeedInput,
): Promise<void> {
  try {
    await enqueueNeedPublication({
      need: {
        title: input.title,
        description: input.description ?? null,
        priority: input.priority,
        address: input.address,
        items: input.items,
        author: null,
      },
      location: {
        address: input.address,
        latitude: input.latitude,
        longitude: input.longitude,
      },
    });
  } catch (err) {
    console.warn(
      `[needs] no se pudo espejar la necesidad en ResponseGrid: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

/** Como `MirrorNeedInput` pero sin coordenadas: el backend geocodifica la dirección. */
export interface MirrorNeedByAddressInput {
  title: string;
  description?: string | null;
  priority: Priority;
  items: NeedItem[];
  address: string;
}

/** Espejo para callers que solo tienen dirección (p.ej. hospitales). */
export async function publishNeedByAddress(
  input: MirrorNeedByAddressInput,
): Promise<void> {
  try {
    await enqueueNeedPublication({
      need: {
        title: input.title,
        description: input.description ?? null,
        priority: input.priority,
        address: input.address,
        items: input.items,
        author: null,
      },
    });
  } catch (err) {
    console.warn(
      `[needs] no se pudo espejar la necesidad (por dirección) en ResponseGrid: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}
