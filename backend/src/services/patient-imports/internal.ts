import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { env } from "@/config/env";
import { getDb, schema } from "@/db";
import type { DedupCandidate } from "@/services/patient-import-logic";
import { hashDocumentDigits } from "@/services/patient-import-logic";
import {
	type CreateImportResult,
	type ImportHeaderRow,
	type ImportRowDTO,
	type ImportStatus,
	type ImportSummaryDTO,
	PATIENT_IMPORT_FAILED_STAGE,
	type PatientImportFailedStage,
} from "./types";

const { patientImports } = schema;

export type { ImportHeaderRow, PatientImportFailedStage };
export { PATIENT_IMPORT_FAILED_STAGE };

export function toSummary(h: ImportHeaderRow): ImportSummaryDTO {
	return {
		id: h.id,
		status: h.status as ImportStatus,
		source: h.source,
		sourceRecordId: h.sourceRecordId,
		integration: h.integration,
		contentType: h.contentType,
		jobId: h.jobId,
		failedStage: isFailedStage(h.failedStage) ? h.failedStage : null,
		counts: {
			total: h.totalRows,
			valid: h.validRows,
			invalid: h.invalidRows,
			duplicate: h.duplicateRows,
			review: h.reviewRows,
			applied: h.appliedRows,
		},
		createdBy: h.createdBy,
		errorSummary: h.errorSummary,
		createdAt: h.createdAt,
		processedAt: h.processedAt,
		appliedAt: h.appliedAt,
		updatedAt: h.updatedAt,
	};
}

export function toCreateImportResult(
	h: ImportHeaderRow,
	reusedExisting: boolean,
): CreateImportResult {
	return { ...toSummary(h), reusedExisting };
}

export function isFailedStage(
	value: string | null,
): value is PatientImportFailedStage {
	return (
		value === PATIENT_IMPORT_FAILED_STAGE.PROCESS ||
		value === PATIENT_IMPORT_FAILED_STAGE.APPLY
	);
}

export function hashIdempotencyKey(key: string | undefined): string | null {
	const trimmed = key?.trim();
	if (!trimmed) return null;
	return createHash("sha256").update(trimmed).digest("hex");
}

export function documentHashFor(digits: string | null): string | null {
	if (!digits) return null;
	const secret = env.PATIENT_DOCUMENT_HASH_SECRET;
	if (!secret) return null;
	return hashDocumentDigits(digits, secret);
}

export function isUniqueViolation(err: unknown): boolean {
	return (
		typeof err === "object" &&
		err !== null &&
		"code" in err &&
		err.code === "23505"
	);
}

export function assertImportState(
	header: ImportHeaderRow,
	allowed: readonly ImportStatus[],
	action: string,
): void {
	if (!allowed.includes(header.status as ImportStatus)) {
		throw new Error(
			`No se puede ${action} un lote en estado "${header.status}"; estados válidos: ${allowed.join(", ")}.`,
		);
	}
}

export interface QueryRows<T> {
	rows: T[];
}

export async function lockHeaderForUpdate(
	tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
	importId: string,
): Promise<ImportHeaderRow | null> {
	const result = (await tx.execute(sql`
    select
      id,
      status,
      source,
      source_record_id as "sourceRecordId",
      integration,
      content_type as "contentType",
      job_id as "jobId",
      failed_stage as "failedStage",
      idempotency_key_hash as "idempotencyKeyHash",
      total_rows as "totalRows",
      valid_rows as "validRows",
      invalid_rows as "invalidRows",
      duplicate_rows as "duplicateRows",
      review_rows as "reviewRows",
      applied_rows as "appliedRows",
      created_by as "createdBy",
      error_summary as "errorSummary",
      created_at as "createdAt",
      processed_at as "processedAt",
      applied_at as "appliedAt",
      updated_at as "updatedAt"
    from patient_imports
    where id = ${importId}
    for update
  `)) as unknown as QueryRows<ImportHeaderRow>;
	return result.rows[0] ?? null;
}

export async function transitionImportStatus(
	importId: string,
	allowed: readonly ImportStatus[],
	nextStatus: ImportStatus,
	action: string,
): Promise<boolean> {
	const db = getDb();
	return db.transaction(async (tx) => {
		const header = await lockHeaderForUpdate(tx, importId);
		if (!header) throw new Error(`patient_import ${importId} no existe`);
		if (header.status === nextStatus) return true;
		assertImportState(header, allowed, action);
		await tx
			.update(patientImports)
			.set({ status: nextStatus, failedStage: null, updatedAt: Date.now() })
			.where(eq(patientImports.id, importId));
		return true;
	});
}

export interface StagingRow {
	id: string;
	rowIndex: number;
	name: string;
	age: number | null;
	condition: string | null;
	status: string | null;
	sourceHospital: string;
	hospitalId: string | null;
	rowStatus: string;
	dedupStatus: string;
	confidence: number;
	validationErrors: unknown;
	validationWarnings: unknown;
	dedupCandidates: unknown;
	patientId: string | null;
}

export function toRowDTO(r: StagingRow): ImportRowDTO {
	const candidates = Array.isArray(r.dedupCandidates)
		? (r.dedupCandidates as DedupCandidate[]).map((c) => ({
				patientId: c.patientId,
				name: c.name,
				reason: c.reason,
			}))
		: [];
	return {
		id: r.id,
		rowIndex: r.rowIndex,
		name: r.name,
		age: r.age,
		condition: r.condition,
		status: r.status,
		sourceHospital: r.sourceHospital,
		hospitalId: r.hospitalId,
		rowStatus: r.rowStatus,
		dedupStatus: r.dedupStatus,
		confidence: r.confidence,
		validationErrors: Array.isArray(r.validationErrors)
			? (r.validationErrors as string[])
			: [],
		validationWarnings: Array.isArray(r.validationWarnings)
			? (r.validationWarnings as string[])
			: [],
		dedupCandidates: candidates,
		patientId: r.patientId,
	};
}

export async function loadHeader(id: string): Promise<ImportHeaderRow | null> {
	const db = getDb();
	const rows = await db
		.select()
		.from(patientImports)
		.where(eq(patientImports.id, id))
		.limit(1);
	return (rows[0] as ImportHeaderRow | undefined) ?? null;
}
