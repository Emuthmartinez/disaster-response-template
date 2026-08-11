import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
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

/**
 * Transición de estado del lote como UPDATE CONDICIONAL de una sola sentencia
 * (reemplaza al SELECT … FOR UPDATE + transacción interactiva, que falla en el
 * driver HTTP de Neon bajo Workers). El WHERE es el guard: solo transiciona si
 * el estado actual está en `allowed`. Si no actualizó nada, se recarga el
 * header para producir el MISMO error que antes (no existe / estado inválido).
 */
export async function transitionImportStatus(
	importId: string,
	allowed: readonly ImportStatus[],
	nextStatus: ImportStatus,
	action: string,
): Promise<boolean> {
	const db = getDb();
	const updated = await db
		.update(patientImports)
		.set({ status: nextStatus, failedStage: null, updatedAt: Date.now() })
		.where(
			and(
				eq(patientImports.id, importId),
				inArray(patientImports.status, [...allowed, nextStatus]),
			),
		)
		.returning({ id: patientImports.id });
	if (updated[0]) return true;

	const header = await loadHeader(importId);
	if (!header) throw new Error(`patient_import ${importId} no existe`);
	if (header.status === nextStatus) return true;
	assertImportState(header, allowed, action);
	return true;
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
