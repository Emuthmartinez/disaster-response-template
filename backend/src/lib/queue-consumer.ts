/**
 * Consumidor de Cloudflare Queues — lógica extraída de `src/worker.ts` para
 * poder testearla (worker.ts importa `cloudflare:node` en ámbito de módulo y
 * no se puede cargar desde un test; mismo motivo que services/cron-jobs.ts).
 *
 * Dos colas, un solo Worker (ver wrangler.jsonc → `queues`):
 *
 *  - `…-needs[…]`      publicación de necesidades → ResponseGrid. Ack POR
 *    MENSAJE: un mensaje envenenado no fuerza la reentrega de sus compañeros
 *    de lote. Un fallo hace `retry()` y Queues aplica max_retries/DLQ.
 *  - `…-needs-dlq[…]`  cartas muertas. Se PERSISTEN en `audit_log`
 *    (action `queue.dead_letter`) — sin migración nueva, duraderas más allá
 *    de los 4 días de retención del DLQ, e inspeccionables por la superficie
 *    de auditoría existente (`/api/public/audit`, gateada por audit:read) o
 *    la pantalla Auditoría del panel. El ack aquí es INCONDICIONAL: un fallo
 *    al persistir no debe dead-letterear la carta muerta.
 */
import { getDb, schema } from "@/db";
import type { NeedPublicationJob } from "@/modules/needs/infrastructure/needs-publication-queue";

/** Forma mínima del mensaje que entrega el runtime de Queues. */
export interface IncomingQueueMessage {
  id: string;
  body: unknown;
  attempts?: number;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
}

/** Forma mínima del batch que entrega el runtime de Queues. */
export interface IncomingQueueBatch {
  queue: string;
  messages: readonly IncomingQueueMessage[];
}

export type QueueKind = "needs" | "needs-dlq" | "imports" | "imports-dlq" | "unknown";

/**
 * Clasifica una cola por su nombre. Cubre los nombres declarados en
 * wrangler.jsonc (`<prefijo>-{needs,imports}[-dlq][-staging]`) sin acoplarse
 * al prefijo elegido por cada despliegue, y lo desconocido se reporta como tal.
 */
export function classifyQueue(name: string): QueueKind {
  if (name.includes("-needs-dlq")) return "needs-dlq";
  if (name.includes("-needs")) return "needs";
  if (name.includes("-imports-dlq")) return "imports-dlq";
  if (name.includes("-imports")) return "imports";
  return "unknown";
}

export interface NeedsConsumerDeps {
  /** Publica una necesidad (inyectable para tests; en prod, publishNeed). */
  publish(job: NeedPublicationJob): Promise<unknown>;
}

/** Procesa un batch de publicaciones. Ack por mensaje; fallo → retry(). */
export async function consumeNeedsBatch(
  batch: IncomingQueueBatch,
  deps: NeedsConsumerDeps,
): Promise<void> {
  for (const message of batch.messages) {
    try {
      await deps.publish(message.body as NeedPublicationJob);
      message.ack();
    } catch (err) {
      console.error(
        `[queue:needs] mensaje ${message.id} falló (intento ${message.attempts ?? "?"}):`,
        err instanceof Error ? err.message : String(err),
      );
      message.retry();
    }
  }
}

/**
 * Job de importación de pacientes (misma forma que el camino BullMQ:
 * lib/queues.PatientImportJobData). Los campos pesados (fileBase64) nunca
 * viajan por Queues — el productor materializa las filas antes de encolar.
 */
export interface ImportJobBody {
  importId: string;
  mode: "process" | "apply" | "ocr";
  actorId?: string | null;
  imageUrl?: string;
}

export interface ImportsConsumerDeps {
  /** Ejecuta el job (inyectable para tests; en prod, patient-imports). */
  run(job: ImportJobBody): Promise<unknown>;
}

function isImportJob(body: unknown): body is ImportJobBody {
  const job = body as ImportJobBody | null;
  return (
    typeof job === "object" &&
    job !== null &&
    typeof job.importId === "string" &&
    typeof job.mode === "string"
  );
}

/** Procesa un batch de importaciones. Ack por mensaje; fallo → retry(). */
export async function consumeImportsBatch(
  batch: IncomingQueueBatch,
  deps: ImportsConsumerDeps,
): Promise<void> {
  for (const message of batch.messages) {
    if (!isImportJob(message.body)) {
      console.error(`[queue:imports] mensaje ${message.id} sin forma de job — al DLQ.`);
      message.retry();
      continue;
    }
    try {
      await deps.run(message.body);
      message.ack();
    } catch (err) {
      console.error(
        `[queue:imports] ${message.body.mode} de ${message.body.importId} falló (intento ${message.attempts ?? "?"}):`,
        err instanceof Error ? err.message : String(err),
      );
      message.retry();
    }
  }
}

export interface DeadLetterEntry {
  queue: string;
  messageId: string;
  attempts: number | null;
  payload: unknown;
}

export type PersistDeadLetter = (entry: DeadLetterEntry) => Promise<void>;

/**
 * Persiste una carta muerta en la bitácora de auditoría. Reusa la forma del
 * registro de worker/deadletter.ts (cola, id, intentos, payload) sobre la
 * tabla existente — sin transporte Redis y sin migración.
 */
export async function persistDeadLetter(entry: DeadLetterEntry): Promise<void> {
  await getDb()
    .insert(schema.auditLog)
    .values({
      actorUserId: null,
      action: "queue.dead_letter",
      targetType: "queue",
      targetId: entry.queue,
      metadata: {
        messageId: entry.messageId,
        attempts: entry.attempts,
        reason: "reintentos agotados (max_retries)",
        payload: entry.payload,
      },
      ipHash: null,
      createdAt: Date.now(),
    });
}

export interface DlqHooks {
  /**
   * Carta muerta de un job de importación: espejo del "último intento" del
   * processor BullMQ — marca el lote como fallido para que el panel lo
   * muestre en vez de dejarlo "processing" para siempre. Best-effort.
   */
  onImportDeadLetter?(job: ImportJobBody): Promise<void>;
}

/** Procesa un batch del DLQ: persistir y SIEMPRE ack (nunca reencolar). */
export async function consumeDlqBatch(
  batch: IncomingQueueBatch,
  persist: PersistDeadLetter,
  hooks: DlqHooks = {},
): Promise<void> {
  for (const message of batch.messages) {
    try {
      await persist({
        queue: batch.queue,
        messageId: message.id,
        attempts: message.attempts ?? null,
        payload: message.body,
      });
    } catch (err) {
      // Visible y accionable, pero sin tumbar el ack: perder el registro es
      // mejor que un bucle infinito de reentrega de la propia carta muerta.
      console.error(
        `[queue:dlq] no se pudo persistir la carta muerta ${message.id}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
    if (hooks.onImportDeadLetter && isImportJob(message.body)) {
      try {
        await hooks.onImportDeadLetter(message.body);
      } catch (err) {
        console.error(
          `[queue:dlq] no se pudo marcar fallido el lote ${(message.body as ImportJobBody).importId}:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
    message.ack();
  }
}
