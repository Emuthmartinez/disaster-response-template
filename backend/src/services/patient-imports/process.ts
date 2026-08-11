import { asc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { OCR_REVIEW_WARNING } from "@/services/ocr/minimax-provider";
import {
	classifyDedup,
	type DedupCandidate,
	type NormalizedRow,
	nameKey,
	normalizeRow,
	type RawPatientRow,
	resolveHospitalAlias,
	validateRow,
} from "@/services/patient-import-logic";
import { isOcrPendingContentType } from "@/services/patient-import-parse";
import { getImport } from "./create";
import {
	documentHashFor,
	loadHeader,
	PATIENT_IMPORT_FAILED_STAGE,
	transitionImportStatus,
} from "./internal";
import type { ImportSummaryDTO } from "./types";

const { patientImports, patientImportRows, hospitalPatients, hospitals } =
	schema;

interface RawStagingRow {
	id: string;
	rowIndex: number;
	rawData: unknown;
}

interface NameMatch {
	id: string;
	count: number;
}

async function resolveHospitalIdsForBatch(
	norms: NormalizedRow[],
): Promise<(string | null)[]> {
	const db = getDb();

	const hintSet = new Set<string>();
	for (const n of norms) if (n.hospitalIdHint) hintSet.add(n.hospitalIdHint);
	const existingIds = new Set<string>();
	if (hintSet.size > 0) {
		const found = await db
			.select({ id: hospitals.id })
			.from(hospitals)
			.where(inArray(hospitals.id, [...hintSet]));
		for (const r of found) existingIds.add(r.id);
	}

	const canonicalByRow: (string | null)[] = norms.map((n) => {
		if (n.hospitalIdHint && existingIds.has(n.hospitalIdHint)) return null;
		const txt = n.sourceHospital.trim();
		if (!txt) return null;
		return resolveHospitalAlias(txt) ?? txt;
	});

	const lowerKeys = new Set<string>();
	for (const c of canonicalByRow) if (c) lowerKeys.add(c.toLowerCase());
	const nameMatch = new Map<string, NameMatch>();
	if (lowerKeys.size > 0) {
		const matches = (await db
			.select({
				id: hospitals.id,
				lname: sql<string>`lower(${hospitals.name})`,
			})
			.from(hospitals)
			.where(inArray(sql`lower(${hospitals.name})`, [...lowerKeys]))) as {
			id: string;
			lname: string;
		}[];
		for (const m of matches) {
			const prev = nameMatch.get(m.lname);
			if (prev) prev.count++;
			else nameMatch.set(m.lname, { id: m.id, count: 1 });
		}
	}

	return norms.map((n, i) => {
		if (n.hospitalIdHint && existingIds.has(n.hospitalIdHint))
			return n.hospitalIdHint;
		const canonical = canonicalByRow[i];
		if (!canonical) return null;
		const match = nameMatch.get(canonical.toLowerCase());
		return match && match.count === 1 ? match.id : null;
	});
}

async function loadHospitalCandidates(
	hospitalId: string,
	cache: Map<string, Map<string, DedupCandidate[]>>,
): Promise<Map<string, DedupCandidate[]>> {
	const cached = cache.get(hospitalId);
	if (cached) return cached;
	const db = getDb();

	const patients = await db
		.select({
			id: hospitalPatients.id,
			name: hospitalPatients.name,
			age: hospitalPatients.age,
			documentHash: hospitalPatients.documentHash,
		})
		.from(hospitalPatients)
		.where(eq(hospitalPatients.hospitalId, hospitalId));
	const byKey = new Map<string, DedupCandidate[]>();
	for (const p of patients) {
		const key = nameKey(p.name);
		if (!key) continue;
		const cand: DedupCandidate = {
			patientId: p.id,
			name: p.name,
			age: p.age ?? null,
			documentHash: p.documentHash ?? null,
		};
		const list = byKey.get(key);
		if (list) list.push(cand);
		else byKey.set(key, [cand]);
	}
	cache.set(hospitalId, byKey);
	return byKey;
}

async function loadDocumentHashCandidates(
	documentHash: string,
	cache: Map<string, DedupCandidate[]>,
): Promise<DedupCandidate[]> {
	const cached = cache.get(documentHash);
	if (cached) return cached;
	const db = getDb();
	const patients = await db
		.select({
			id: hospitalPatients.id,
			name: hospitalPatients.name,
			age: hospitalPatients.age,
			documentHash: hospitalPatients.documentHash,
		})
		.from(hospitalPatients)
		.where(eq(hospitalPatients.documentHash, documentHash));
	const candidates: DedupCandidate[] = patients.map((p) => ({
		patientId: p.id,
		name: p.name,
		age: p.age ?? null,
		documentHash: p.documentHash ?? null,
	}));
	cache.set(documentHash, candidates);
	return candidates;
}

function mergeCandidatesUnique(...lists: DedupCandidate[][]): DedupCandidate[] {
	const seen = new Set<string>();
	const out: DedupCandidate[] = [];
	for (const list of lists) {
		for (const cand of list) {
			if (seen.has(cand.patientId)) continue;
			seen.add(cand.patientId);
			out.push(cand);
		}
	}
	return out;
}

export interface ProcessImportOptions {
	forceReview?: boolean;
	reviewWarning?: string;
}

export async function processImport(
	importId: string,
	opts: ProcessImportOptions = {},
): Promise<ImportSummaryDTO> {
	const db = getDb();
	const current = await loadHeader(importId);
	if (
		current?.status === "failed" &&
		current.failedStage !== PATIENT_IMPORT_FAILED_STAGE.PROCESS
	) {
		throw new Error(
			'Solo se puede reanudar un lote fallido durante la etapa "process".',
		);
	}
	const claimed = await transitionImportStatus(
		importId,
		["pending", "queued", "processing", "processed", "failed"],
		"processing",
		"procesar",
	);
	if (!claimed) {
		const summary = await getImport(importId);
		if (!summary) throw new Error(`patient_import ${importId} no existe`);
		return summary;
	}

	const ocrHeader = await loadHeader(importId);
	const ocrReview = ocrHeader
		? isOcrPendingContentType(ocrHeader.contentType)
		: false;

	const rawRows = (await db
		.select({
			id: patientImportRows.id,
			rowIndex: patientImportRows.rowIndex,
			rawData: patientImportRows.rawData,
		})
		.from(patientImportRows)
		.where(eq(patientImportRows.importId, importId))
		.orderBy(asc(patientImportRows.rowIndex))) as RawStagingRow[];

	// Guard de integridad: la creación/ingesta escribe header y filas SIN
	// transacción (Workers); si un corte dejó menos filas que totalRows, esto
	// NO se procesa a medias — se marca fallido con causa clara y se reintenta
	// recreando el lote (o re-ingiriendo el archivo).
	if (ocrHeader && rawRows.length !== ocrHeader.totalRows) {
		const summary = `El staging tiene ${rawRows.length} filas pero el lote declara ${ocrHeader.totalRows}: la carga quedó incompleta. Vuelve a crear el lote (o re-ingiere el archivo).`;
		const { markImportFailed } = await import("./create");
		await markImportFailed(importId, summary, "process");
		const failed = await getImport(importId);
		if (!failed) throw new Error(`patient_import ${importId} no existe`);
		return failed;
	}

	const candidateCache = new Map<string, Map<string, DedupCandidate[]>>();
	const documentHashCache = new Map<string, DedupCandidate[]>();

	const seenByNameInBatch = new Map<string, DedupCandidate[]>();
	const seenByDocInBatch = new Map<string, DedupCandidate[]>();

	let valid = 0;
	let invalid = 0;
	let duplicate = 0;
	let review = 0;
	const now = Date.now();

	const norms = rawRows.map((raw) => {
		const norm = normalizeRow((raw.rawData ?? {}) as RawPatientRow);
		norm.documentHash = documentHashFor(norm.documentDigits);
		return norm;
	});
	const hospitalIds = await resolveHospitalIdsForBatch(norms);

	for (let i = 0; i < rawRows.length; i++) {
		const raw = rawRows[i];
		const norm = norms[i];
		if (!raw || !norm) continue;
		const hospitalId = hospitalIds[i] ?? null;
		const { errors, hospitalUnresolved } = validateRow(
			norm,
			hospitalId !== null,
		);
		const warnings = [...norm.warnings];

		if (ocrReview) warnings.push(OCR_REVIEW_WARNING);

		let rowStatus: string;
		let dedupStatus = "pending";
		let confidence = 0;
		let candidates: DedupCandidate[] = [];

		if (opts.forceReview || ocrReview) {
			rowStatus = "needs_review";
			dedupStatus = "needs_review";
			review++;
			const warning = opts.reviewWarning ?? OCR_REVIEW_WARNING;
			if (!warnings.includes(warning)) warnings.push(warning);
		} else if (errors.length > 0) {
			rowStatus = "invalid";
			invalid++;
		} else if (hospitalUnresolved) {
			rowStatus = "needs_review";
			dedupStatus = "needs_review";
			review++;
			warnings.push(
				"No se pudo resolver el hospital indicado a uno único; requiere revisión manual antes de aplicar.",
			);
		} else {
			const nameBatchKey = `${hospitalId}::${norm.normalizedKey}`;
			const docBatchKey = norm.documentHash;

			const dbByName =
				norm.normalizedKey && hospitalId
					? ((await loadHospitalCandidates(hospitalId, candidateCache)).get(
							norm.normalizedKey,
						) ?? [])
					: [];
			const dbByDoc =
				norm.documentHash
					? await loadDocumentHashCandidates(
							norm.documentHash,
							documentHashCache,
						)
					: [];
			const batchByName = seenByNameInBatch.get(nameBatchKey) ?? [];
			const batchByDoc = docBatchKey
				? (seenByDocInBatch.get(docBatchKey) ?? [])
				: [];

			const candidatePool = mergeCandidatesUnique(
				dbByName,
				dbByDoc,
				batchByName,
				batchByDoc,
			);
			const verdict = classifyDedup(norm, candidatePool);
			dedupStatus = verdict.status;
			confidence = verdict.confidence;
			candidates = verdict.candidates;

			if (verdict.status === "unique") {
				rowStatus = "valid";
				valid++;

				const self: DedupCandidate = {
					patientId: `row:${raw.id}`,
					name: norm.name,
					age: norm.age,
					documentHash: norm.documentHash,
				};
				if (batchByName.length) batchByName.push(self);
				else seenByNameInBatch.set(nameBatchKey, [self]);
				if (docBatchKey) {
					if (batchByDoc.length) batchByDoc.push(self);
					else seenByDocInBatch.set(docBatchKey, [self]);
				}
			} else if (verdict.status === "duplicate") {
				rowStatus = "duplicate";
				duplicate++;
			} else {
				rowStatus = "needs_review";
				review++;
			}
		}

		if (ocrReview && rowStatus === "valid") {
			rowStatus = "needs_review";
			dedupStatus = "needs_review";
			valid--;
			review++;
		}

		await db
			.update(patientImportRows)
			.set({
				name: norm.name,
				normalizedKey: norm.normalizedKey,
				age: norm.age,
				condition: norm.condition,
				status: norm.status,
				sourceHospital: norm.sourceHospital,
				hospitalId,
				documentHash: norm.documentHash,
				validationErrors: errors,
				validationWarnings: warnings,
				dedupStatus,
				dedupCandidates: candidates,
				confidence,
				rowStatus,
				updatedAt: now,
			})
			.where(eq(patientImportRows.id, raw.id));
	}

	await db
		.update(patientImports)
		.set({
			status: "processed",
			validRows: valid,
			invalidRows: invalid,
			duplicateRows: duplicate,
			reviewRows: review,
			processedAt: now,
			updatedAt: now,
			errorSummary: null,
		})
		.where(eq(patientImports.id, importId));

	const summary = await getImport(importId);
	if (!summary) throw new Error(`patient_import ${importId} no existe`);
	return summary;
}
