import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { invalidate } from "@/lib/cache";
import type { PatientCondition, PatientStatus } from "@/services/patients";
import { getImport } from "./create";
import {
	assertImportState,
	lockHeaderForUpdate,
	PATIENT_IMPORT_FAILED_STAGE,
	type QueryRows,
} from "./internal";
import {
	type ImportSummaryDTO,
	PATIENT_CONDITION,
	PATIENT_CONDITIONS,
	PATIENT_STATUS,
	PATIENT_STATUSES,
} from "./types";

const { patientImports, patientImportRows } = schema;

interface ApplyableRow {
	id: string;
	name: string;
	age: number | null;
	condition: string | null;
	status: string | null;
	hospitalId: string | null;
	documentHash: string | null;
}

function normalizePatientCondition(value: string | null): PatientCondition {
	return PATIENT_CONDITIONS.has(value ?? "")
		? (value as PatientCondition)
		: PATIENT_CONDITION.UNKNOWN;
}

function normalizePatientStatus(value: string | null): PatientStatus {
	return PATIENT_STATUSES.has(value ?? "")
		? (value as PatientStatus)
		: PATIENT_STATUS.HOSPITALIZED;
}

async function applyOneRowAtomically(rowId: string): Promise<string | null> {
	const db = getDb();
	return db.transaction(async (tx) => {
		const locked = (await tx.execute(sql`
      select id, name, age, condition, status, hospital_id as "hospitalId",
             document_hash as "documentHash"
      from patient_import_rows
      where id = ${rowId}
        and row_status = 'valid'
        and patient_id is null
      for update
    `)) as unknown as QueryRows<ApplyableRow>;
		const row = locked.rows[0];
		if (!row?.hospitalId || !row.name) return null;

		const patientId = randomUUID();
		const now = Date.now();
		const name = row.name.trim().slice(0, 120);
		const age =
			row.age === null || row.age === undefined
				? null
				: Math.max(0, Math.trunc(Number(row.age)));
		const condition = normalizePatientCondition(row.condition);
		const status = normalizePatientStatus(row.status);
		const documentHash = row.documentHash ?? null;

		const inserted = (await tx.execute(sql`
      insert into hospital_patients
        (id, hospital_id, name, age, condition, status, notes, contact, document_hash, admitted_at, updated_at)
      values
        (${patientId}, ${row.hospitalId}, ${name}, ${age}, ${condition}, ${status}, '', '', ${documentHash}, ${now}, ${now})
      on conflict (document_hash) where document_hash is not null do nothing
      returning id
    `)) as unknown as QueryRows<{ id: string }>;
		if (!inserted.rows[0]) {
			await tx
				.update(patientImportRows)
				.set({ rowStatus: "duplicate", dedupStatus: "duplicate", updatedAt: now })
				.where(eq(patientImportRows.id, row.id));
			return null;
		}
		await tx
			.update(patientImportRows)
			.set({ patientId, rowStatus: "applied", updatedAt: now })
			.where(eq(patientImportRows.id, row.id));
		return patientId;
	});
}

export async function applyImport(
	importId: string,
	actorId: string | null,
): Promise<ImportSummaryDTO> {
	const db = getDb();
	await db.transaction(async (tx) => {
		const header = await lockHeaderForUpdate(tx, importId);
		if (!header) throw new Error(`patient_import ${importId} no existe`);

		assertImportState(
			header,
			["processed", "applied", "failed", "applying"],
			"aplicar",
		);
		if (
			header.status === "failed" &&
			header.failedStage !== PATIENT_IMPORT_FAILED_STAGE.APPLY
		) {
			throw new Error(
				'Solo se puede reanudar un lote fallido durante la etapa "apply".',
			);
		}
		await tx
			.update(patientImports)
			.set({ status: "applying", failedStage: null, updatedAt: Date.now() })
			.where(eq(patientImports.id, importId));
	});

	const toApply = (await db
		.select({
			id: patientImportRows.id,
			name: patientImportRows.name,
			age: patientImportRows.age,
			condition: patientImportRows.condition,
			status: patientImportRows.status,
			hospitalId: patientImportRows.hospitalId,
		})
		.from(patientImportRows)
		.where(
			and(
				eq(patientImportRows.importId, importId),
				eq(patientImportRows.rowStatus, "valid"),
				isNull(patientImportRows.patientId),
			),
		)) as ApplyableRow[];

	const now = Date.now();
	for (const row of toApply) {
		await applyOneRowAtomically(row.id);
	}

	const appliedCount = (await db
		.select({ n: sql<number>`count(*)::int` })
		.from(patientImportRows)
		.where(
			and(
				eq(patientImportRows.importId, importId),
				eq(patientImportRows.rowStatus, "applied"),
			),
		)) as { n: number }[];

	await db
		.update(patientImports)
		.set({
			status: "applied",
			appliedRows: appliedCount[0]?.n ?? 0,
			appliedAt: now,
			updatedAt: now,
		})
		.where(eq(patientImports.id, importId));

	void actorId;
	invalidate();
	const summary = await getImport(importId);
	if (!summary) throw new Error(`patient_import ${importId} no existe`);
	return summary;
}

export async function purgeAppliedRawData(opts: {
	olderThanMs: number;
	confirm?: boolean;
}): Promise<{ matched: number; purged: number }> {
	if (!Number.isFinite(opts.olderThanMs) || opts.olderThanMs < 0) {
		throw new Error("purgeAppliedRawData: olderThanMs debe ser un número >= 0");
	}
	const db = getDb();
	const cutoff = Date.now() - opts.olderThanMs;

	const appliedOld = db
		.select({ id: patientImports.id })
		.from(patientImports)
		.where(
			and(
				eq(patientImports.status, "applied"),
				lt(patientImports.appliedAt, cutoff),
			),
		);
	const targetWhere = and(
		inArray(patientImportRows.importId, appliedOld),
		sql`${patientImportRows.rawData} <> '{}'::jsonb`,
	);

	const counted = (await db
		.select({ n: sql<number>`count(*)::int` })
		.from(patientImportRows)
		.where(targetWhere)) as { n: number }[];
	const matched = counted[0]?.n ?? 0;

	if (!opts.confirm) return { matched, purged: 0 };

	await db
		.update(patientImportRows)
		.set({ rawData: {}, updatedAt: Date.now() })
		.where(targetWhere);
	return { matched, purged: matched };
}
