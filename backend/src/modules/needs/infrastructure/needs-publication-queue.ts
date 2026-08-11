/**
 * Productor de la cola de publicación de necesidades.
 *
 * Ya no habla con BullMQ directamente: delega en el seam de despacho
 * (`@/lib/job-dispatch`), que elige transporte por capacidad — binding de
 * Cloudflare Queues si lo hay, BullMQ si hay VALKEY_URL. Los llamadores
 * (needs-module, needs-controller) no cambian.
 *
 * El import de bullmq/ioredis desapareció de este módulo A PROPÓSITO: estaba en
 * `src/`, así que entraba en el bundle de Workers aunque allí no pueda correr.
 */
import { createHash, randomUUID } from "crypto";
import {
  dispatchJob,
  resolveTransport,
  valkeyUrl,
  type JobRoute,
} from "@/lib/job-dispatch";
import { serviceUnavailable } from "@/lib/errors";
import type { NewNeed, ResolvedLocation } from "../domain/need";

export const NEEDS_PUBLICATION_QUEUE = "needs-publication";

/**
 * Binding declarado en wrangler.jsonc para el camino de Cloudflare Queues.
 * Mientras U2 no lo declare, `resolveTransport` simplemente no lo encuentra y
 * cae a BullMQ — que es el comportamiento de hoy.
 */
export const NEEDS_PUBLICATION_BINDING = "NEEDS_QUEUE";

export const needsPublicationRoute: JobRoute = {
  queueName: NEEDS_PUBLICATION_QUEUE,
  binding: NEEDS_PUBLICATION_BINDING,
};

export interface NeedPublicationJob {
  need: NewNeed;
  location?: ResolvedLocation;
}

export interface NeedPublicationState {
  jobId: string;
  state: string;
  progress: unknown;
  result: unknown;
  failedReason: string | null;
}

function jobId(idempotencyKey?: string): string {
  if (!idempotencyKey) return `need-${randomUUID()}`;
  return `need-${createHash("sha256").update(idempotencyKey).digest("hex")}`;
}

export async function enqueueNeedPublication(
  data: NeedPublicationJob,
  idempotencyKey?: string,
): Promise<string> {
  return dispatchJob(needsPublicationRoute, data, {
    id: jobId(idempotencyKey),
    attempts: 3,
    backoffMs: 10_000,
  });
}

/**
 * Estado de una publicación.
 *
 * Tres casos distintos, que a proposito NO se colapsan en uno:
 *
 * - BullMQ: se consulta el registro de jobs y se devuelve el estado real.
 * - Cloudflare Queues: `null`. Queues no lleva un registro consultable, asi que
 *   fingir un estado seria peor que admitir que no hay. El estado real vive en
 *   el consumidor (ver lib/queue-consumer.ts) via el DLQ -> audit_log.
 * - SIN transporte: lanza 503. Antes de este seam, `queue()` lanzaba al faltar
 *   VALKEY_URL y el controlador lo convertia en 503. Devolver `null` aqui lo
 *   volveria un 404 "no encontrado", indistinguible de un jobId inexistente, y
 *   ocultaria un despliegue mal configurado detras de un error de usuario.
 */
export async function getNeedPublicationState(
  id: string,
): Promise<NeedPublicationState | null> {
  const transport = resolveTransport(needsPublicationRoute);
  if (transport === "none") {
    throw serviceUnavailable(
      "La cola de publicación no está configurada en este despliegue.",
    );
  }
  if (transport !== "bullmq") return null;
  // valkeyUrl() y no process.env directo: resolveTransport decide con
  // `process.env.VALKEY_URL || env.VALKEY_URL`, y leer solo la primera aqui
  // podria decir "bullmq" arriba y `null` una linea despues.
  const url = valkeyUrl();
  if (!url) return null;
  const { getBullmqJobState } = await import("@/lib/job-dispatch.bullmq");
  return getBullmqJobState(needsPublicationRoute, id, url);
}
