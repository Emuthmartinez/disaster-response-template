/**
 * Shim de compatibilidad: `runGeocode` se movió a
 * `src/services/geocode-batch.ts`.
 *
 * Motivo del movimiento: el Cron Trigger de Cloudflare vive en
 * `src/worker.ts`, y `src/` no debe importar de `worker/` — `worker/` es el
 * árbol del proceso Node de compose y ya importa de `src/`. Invertir esa
 * dirección metería código del worker en el bundle de Workers y rompería en
 * silencio la comprobación de que ese bundle no arrastra nada de `worker/`.
 *
 * El módulo vive ahora junto a `services/earthquakes.ts`, que es el precedente:
 * una función pura que BullMQ solo agendaba, y que por eso se pudo portar a un
 * cron sin tocarla.
 *
 * Este re-export existe para que el camino docker-compose siga funcionando sin
 * cambios. No añadir lógica aquí — vive en `src/services/geocode-batch.ts`.
 */
export {
  runGeocode,
  type GeocodeOptions,
  type GeocodeResult,
} from "../../src/services/geocode-batch";
