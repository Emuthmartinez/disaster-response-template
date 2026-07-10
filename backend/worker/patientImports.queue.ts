import { type Processor, Worker } from "bullmq";
import { getRedis } from "./redis";

const PREFIX = process.env.QUEUE_PREFIX || "mapa";
export const PATIENT_IMPORTS_QUEUE = "patient-imports";

type PatientImportMode = "process" | "apply" | "ocr";

interface PatientImportJobData {
	importId: string;
	mode: PatientImportMode;
	actorId?: string | null;
	imageUrl?: string;

	contentType?: string;
	fileBase64?: string;
}

const processor: Processor = async (job) => {
	const data = job.data as PatientImportJobData;

	const {
		processImport,
		applyImport,
		ingestOcrImport,
		ingestFileImport,
		markImportFailed,
	} = await import("../src/services/patient-imports");
	try {
		if (data.mode === "ocr") {
			const r = await ingestOcrImport(data.importId, data.imageUrl);
			return { mode: "ocr", importId: data.importId, counts: r.counts };
		}
		if (data.mode === "process") {
			const r =
				data.fileBase64 !== undefined && data.contentType !== undefined
					? await ingestFileImport(
							data.importId,
							data.contentType,
							data.fileBase64,
						)
					: await processImport(data.importId);
			return { mode: "process", importId: data.importId, counts: r.counts };
		}
		if (data.mode === "apply") {
			const r = await applyImport(data.importId, data.actorId ?? null);
			return { mode: "apply", importId: data.importId, counts: r.counts };
		}
		throw new Error(
			`patient-import modo desconocido: ${(data as { mode: string }).mode}`,
		);
	} catch (err) {
		const attemptsMade = job.attemptsMade + 1;
		const maxAttempts = job.opts.attempts ?? 1;
		if (attemptsMade >= maxAttempts) {
			const msg = err instanceof Error ? err.message : "Error desconocido";

			const failedStage = data.mode === "apply" ? "apply" : "process";
			await markImportFailed(
				data.importId,
				`Falló el ${data.mode}: ${msg}`,
				failedStage,
			).catch(() => {});
		}
		throw err;
	}
};

export function createPatientImportsWorker(): Worker {
	const concurrency = Number(process.env.PATIENT_IMPORTS_CONCURRENCY || 2);

	const lockDuration = Number(process.env.LONG_JOB_LOCK_MS || 300_000);
	return new Worker(PATIENT_IMPORTS_QUEUE, processor, {
		connection: getRedis(),
		prefix: PREFIX,
		concurrency,
		lockDuration,
	});
}
