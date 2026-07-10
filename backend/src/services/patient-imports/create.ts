import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import {
	hashIdempotencyKey,
	isUniqueViolation,
	loadHeader,
	type StagingRow,
	toCreateImportResult,
	toRowDTO,
	toSummary,
} from "./internal";
import type {
	CreateImportInput,
	CreateImportResult,
	ImportHeaderRow,
	ImportRowDTO,
	ImportSummaryDTO,
	PatientImportFailedStage,
} from "./types";

const { patientImports, patientImportRows } = schema;

export async function createImport(
	input: CreateImportInput,
	actorId: string | null,
): Promise<CreateImportResult> {
	const db = getDb();
	const now = Date.now();
	const id = randomUUID();
	const idempotencyKeyHash = hashIdempotencyKey(input.idempotencyKey);

	if (idempotencyKeyHash && actorId) {
		const existing = await db
			.select()
			.from(patientImports)
			.where(
				and(
					eq(patientImports.createdBy, actorId),
					eq(patientImports.idempotencyKeyHash, idempotencyKeyHash),
				),
			)
			.limit(1);
		if (existing[0])
			return toCreateImportResult(existing[0] as ImportHeaderRow, true);
	}

	try {
		await db.transaction(async (tx) => {
			await tx.insert(patientImports).values({
				id,
				status: "pending",
				source: (input.source ?? "api").slice(0, 120),
				sourceRecordId: input.sourceRecordId?.trim()
					? input.sourceRecordId.trim().slice(0, 200)
					: null,
				integration: input.integration?.trim()
					? input.integration.trim().slice(0, 120)
					: null,
				contentType: (input.contentType ?? "application/json").slice(0, 120),
				idempotencyKeyHash,
				totalRows: input.rows.length,
				createdBy: actorId,
				createdAt: now,
				updatedAt: now,
			});

			if (input.rows.length > 0) {
				await tx.insert(patientImportRows).values(
					input.rows.map((raw, i) => ({
						id: randomUUID(),
						importId: id,
						rowIndex: i,
						rawData: raw as Record<string, unknown>,
						createdAt: now,
						updatedAt: now,
					})),
				);
			}
		});
	} catch (err) {
		if (!isUniqueViolation(err) || !idempotencyKeyHash || !actorId) throw err;
		const existing = await db
			.select()
			.from(patientImports)
			.where(
				and(
					eq(patientImports.createdBy, actorId),
					eq(patientImports.idempotencyKeyHash, idempotencyKeyHash),
				),
			)
			.limit(1);
		if (existing[0])
			return toCreateImportResult(existing[0] as ImportHeaderRow, true);
		throw err;
	}

	const header = await loadHeader(id);
	if (!header) throw new Error(`patient_import ${id} no existe`);
	return toCreateImportResult(header, false);
}

export async function getImport(id: string): Promise<ImportSummaryDTO | null> {
	const header = await loadHeader(id);
	return header ? toSummary(header) : null;
}

export async function setImportJob(id: string, jobId: string): Promise<void> {
	const db = getDb();
	await db
		.update(patientImports)
		.set({ jobId, updatedAt: Date.now() })
		.where(eq(patientImports.id, id));
}

export async function markImportQueued(
	id: string,
	jobId: string,
): Promise<void> {
	const db = getDb();
	await db
		.update(patientImports)
		.set({
			jobId,
			status: sql`case when ${patientImports.status} = 'pending' then 'queued' else ${patientImports.status} end`,
			updatedAt: Date.now(),
		})
		.where(eq(patientImports.id, id));
}

export async function listImportRows(
	importId: string,
	opts: { limit?: number; offset?: number } = {},
): Promise<ImportRowDTO[]> {
	const db = getDb();
	const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
	const offset = Math.max(opts.offset ?? 0, 0);
	const rows = await db
		.select({
			id: patientImportRows.id,
			rowIndex: patientImportRows.rowIndex,
			name: patientImportRows.name,
			age: patientImportRows.age,
			condition: patientImportRows.condition,
			status: patientImportRows.status,
			sourceHospital: patientImportRows.sourceHospital,
			hospitalId: patientImportRows.hospitalId,
			rowStatus: patientImportRows.rowStatus,
			dedupStatus: patientImportRows.dedupStatus,
			confidence: patientImportRows.confidence,
			validationErrors: patientImportRows.validationErrors,
			validationWarnings: patientImportRows.validationWarnings,
			dedupCandidates: patientImportRows.dedupCandidates,
			patientId: patientImportRows.patientId,
		})
		.from(patientImportRows)
		.where(eq(patientImportRows.importId, importId))
		.orderBy(asc(patientImportRows.rowIndex))
		.limit(limit)
		.offset(offset);
	return (rows as StagingRow[]).map(toRowDTO);
}

export async function markImportFailed(
	importId: string,
	summary: string,
	failedStage?: PatientImportFailedStage,
): Promise<void> {
	const db = getDb();
	await db
		.update(patientImports)
		.set({
			status: "failed",
			failedStage: failedStage ?? null,
			errorSummary: summary.slice(0, 500),
			updatedAt: Date.now(),
		})
		.where(eq(patientImports.id, importId));
}
