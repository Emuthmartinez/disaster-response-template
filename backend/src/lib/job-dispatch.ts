/**
 * Seam de despacho de jobs: UNA entrada de productor que resuelve el transporte
 * por CAPACIDAD, no por un flag de entorno.
 *
 * Mismo patrón que `src/db/index.ts`, que elige driver según runtime: los dos
 * caminos exponen la misma API al llamador y solo cambia el transporte. Aquí la
 * señal no es el runtime sino qué hay disponible:
 *
 *   1. ¿Hay un binding de Cloudflare Queues registrado? -> Queues.
 *   2. ¿Hay VALKEY_URL? -> BullMQ (camino docker-compose).
 *   3. Ninguno -> error que NOMBRA las dos opciones.
 *
 * Se resuelve por capacidad y no por `isWorkers()` porque el camino de compose
 * y el de Workers no son mutuamente excluyentes en pruebas locales, y porque un
 * binding presente es una afirmación más fuerte que una cadena de user-agent.
 *
 * BullMQ e ioredis se importan de forma PEREZOSA dentro de la rama Node: así no
 * entran en el bundle de Workers, que no puede ejecutarlos (necesitan sockets
 * persistentes).
 */
import { env } from "@/config/env";

/**
 * Lo mínimo que este módulo necesita de un binding de Cloudflare Queues. Se
 * declara aquí en vez de depender de los tipos de workers-types para que el
 * módulo siga compilando bajo el tsconfig de Node.
 */
export interface QueueProducer {
  send(body: unknown, options?: { delaySeconds?: number }): Promise<void>;
}

/** Descripción de una cola: su nombre en BullMQ y su binding en Workers. */
export interface JobRoute {
  /** Nombre de la cola en BullMQ (camino Node/compose). */
  readonly queueName: string;
  /** Nombre del binding declarado en wrangler.jsonc (camino Workers). */
  readonly binding: string;
}

export interface DispatchOptions {
  /**
   * Id determinista. En BullMQ es el `jobId` y hace idempotente el reencolado.
   * En Cloudflare Queues NO hay deduplicación por id: se devuelve al llamador
   * para que pueda correlacionar, pero no evita un doble envío.
   */
  id?: string;
  /**
   * Reintentos totales. SOLO aplica al camino BullMQ: en Cloudflare Queues los
   * reintentos se configuran en el CONSUMIDOR (`max_retries` en wrangler.jsonc),
   * no por mensaje.
   */
  attempts?: number;
  /** Retardo base del backoff exponencial (ms). Solo BullMQ, por lo mismo. */
  backoffMs?: number;
}

/**
 * Bindings registrados por el entrypoint del Worker. Vive a nivel de módulo
 * porque la app de Express corre por debajo del handler y no recibe `env`.
 *
 * `bridgeEnv` (src/worker.ts) no sirve para esto: copia solo valores string a
 * process.env, y un binding de cola es un objeto.
 */
const producers = new Map<string, QueueProducer>();

function isQueueProducer(value: unknown): value is QueueProducer {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { send?: unknown }).send === "function"
  );
}

/**
 * Registra los bindings de cola presentes en el `env` del Worker. Idempotente:
 * se llama en cada invocación de handler (fetch/scheduled/queue) porque `env`
 * solo existe ahí — leerlo en ámbito global lanza "Disallowed operation called
 * within global scope".
 */
export function registerJobBindings(workerEnv: unknown): void {
  if (typeof workerEnv !== "object" || workerEnv === null) return;
  for (const [name, value] of Object.entries(workerEnv)) {
    if (isQueueProducer(value)) producers.set(name, value);
  }
}

/** Solo para tests: vacía el registro de bindings. */
export function resetJobBindings(): void {
  producers.clear();
}

/** El productor de Cloudflare Queues para ese binding, si está registrado. */
export function getQueueProducer(binding: string): QueueProducer | null {
  return producers.get(binding) ?? null;
}

/**
 * VALKEY_URL vía process.env por delante de la copia congelada de config/env:
 * en Workers, worker.ts puebla process.env DESPUÉS de que env.ts congeló la
 * suya en el import. Mismo motivo que el comentario de DATABASE_URL en
 * src/db/index.ts.
 */
export function valkeyUrl(): string | undefined {
  return process.env.VALKEY_URL || env.VALKEY_URL;
}

/** Qué transporte se usaría ahora mismo. Expuesto para diagnóstico y tests. */
export function resolveTransport(route: JobRoute): "queues" | "bullmq" | "none" {
  if (getQueueProducer(route.binding)) return "queues";
  if (valkeyUrl()) return "bullmq";
  return "none";
}

/**
 * Encola un job por el transporte disponible. Devuelve el id con el que se
 * encoló (el `id` pedido, o uno generado por BullMQ cuando no se pidió).
 */
export async function dispatchJob(
  route: JobRoute,
  payload: unknown,
  options: DispatchOptions = {},
): Promise<string> {
  const producer = getQueueProducer(route.binding);
  if (producer) {
    await producer.send(payload);
    return options.id ?? route.queueName;
  }

  const url = valkeyUrl();
  if (!url) {
    throw new Error(
      `No hay transporte para la cola "${route.queueName}": ni el binding ` +
        `${route.binding} de Cloudflare Queues está registrado, ni VALKEY_URL ` +
        `está configurada.`,
    );
  }

  // Import perezoso a propósito: mantiene bullmq/ioredis FUERA del bundle de
  // Workers, donde no pueden correr.
  const { enqueueViaBullmq } = await import("./job-dispatch.bullmq");
  return enqueueViaBullmq(route, payload, options, url);
}
