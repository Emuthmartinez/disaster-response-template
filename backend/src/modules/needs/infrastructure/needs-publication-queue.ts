import { createHash, randomUUID } from "crypto";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "@/config/env";
import type { NewNeed, ResolvedLocation } from "../domain/need";

export const NEEDS_PUBLICATION_QUEUE = "needs-publication";

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

let connection: IORedis | null = null;
let publications: Queue<NeedPublicationJob> | null = null;

function queue(): Queue<NeedPublicationJob> {
  if (publications) return publications;
  if (!env.VALKEY_URL) throw new Error("VALKEY_URL no está configurada.");
  connection = new IORedis(env.VALKEY_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
  publications = new Queue(NEEDS_PUBLICATION_QUEUE, {
    connection,
    prefix: env.QUEUE_PREFIX,
    streams: { events: { maxLen: 1000 } },
  });
  return publications;
}

function jobId(idempotencyKey?: string): string {
  if (!idempotencyKey) return `need-${randomUUID()}`;
  return `need-${createHash("sha256").update(idempotencyKey).digest("hex")}`;
}

export async function enqueueNeedPublication(
  data: NeedPublicationJob,
  idempotencyKey?: string,
): Promise<string> {
  const job = await queue().add("publish", data, {
    jobId: jobId(idempotencyKey),
    attempts: 3,
    backoff: { type: "exponential", delay: 10_000 },
    removeOnComplete: env.QUEUE_REMOVE_ON_COMPLETE,
    removeOnFail: env.QUEUE_REMOVE_ON_FAIL,
  });
  return job.id!;
}

export async function getNeedPublicationState(
  id: string,
): Promise<NeedPublicationState | null> {
  const job = await queue().getJob(id);
  if (!job) return null;
  return {
    jobId: id,
    state: await job.getState(),
    progress: job.progress,
    result: job.returnvalue ?? null,
    failedReason: job.failedReason ?? null,
  };
}
