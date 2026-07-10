import type { RawPatientRow } from "@/services/patient-import-logic";

export const PATIENT_IMPORT_FAILED_STAGE = {
	PROCESS: "process",
	APPLY: "apply",
} as const;

export type PatientImportFailedStage =
	(typeof PATIENT_IMPORT_FAILED_STAGE)[keyof typeof PATIENT_IMPORT_FAILED_STAGE];

export const PATIENT_CONDITION = {
	STABLE: "stable",
	SERIOUS: "serious",
	CRITICAL: "critical",
	RECOVERING: "recovering",
	UNKNOWN: "unknown",
} as const;

export const PATIENT_STATUS = {
	HOSPITALIZED: "hospitalized",
	SHELTERED: "sheltered",
	DISCHARGED: "discharged",
	TRANSFERRED: "transferred",
	DECEASED: "deceased",
} as const;

export const PATIENT_CONDITIONS = new Set<string>(
	Object.values(PATIENT_CONDITION),
);
export const PATIENT_STATUSES = new Set<string>(Object.values(PATIENT_STATUS));

export type ImportStatus =
	| "pending"
	| "queued"
	| "processing"
	| "processed"
	| "applying"
	| "applied"
	| "failed";

export interface ImportSummaryDTO {
	id: string;
	status: ImportStatus;
	source: string;
	sourceRecordId: string | null;
	integration: string | null;
	contentType: string;
	jobId: string | null;
	failedStage: PatientImportFailedStage | null;
	counts: {
		total: number;
		valid: number;
		invalid: number;
		duplicate: number;
		review: number;
		applied: number;
	};
	createdBy: string | null;
	errorSummary: string | null;
	createdAt: number;
	processedAt: number | null;
	appliedAt: number | null;
	updatedAt: number;
}

export interface ImportRowDTO {
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
	validationErrors: string[];
	validationWarnings: string[];
	dedupCandidates: { patientId: string; name: string; reason?: string }[];
	patientId: string | null;
}

export interface CreateImportInput {
	source?: string;
	sourceRecordId?: string;
	integration?: string;
	contentType?: string;
	idempotencyKey?: string;
	rows: RawPatientRow[];
}

export interface CreateImportResult extends ImportSummaryDTO {
	reusedExisting: boolean;
}

export interface ImportHeaderRow {
	id: string;
	status: string;
	source: string;
	sourceRecordId: string | null;
	integration: string | null;
	contentType: string;
	jobId: string | null;
	failedStage: string | null;
	idempotencyKeyHash: string | null;
	totalRows: number;
	validRows: number;
	invalidRows: number;
	duplicateRows: number;
	reviewRows: number;
	appliedRows: number;
	createdBy: string | null;
	errorSummary: string | null;
	createdAt: number;
	processedAt: number | null;
	appliedAt: number | null;
	updatedAt: number;
}
