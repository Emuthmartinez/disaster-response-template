import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import {
	getMinimaxOcrConfig,
	type MinimaxOcrConfig,
} from "@/services/ocr/minimax-config";
import {
	extractPatientRowsFromImageUrl,
	type FetchLike,
} from "@/services/ocr/minimax-provider";
import type { RawPatientRow } from "@/services/patient-import-logic";
import { parseImportFile } from "@/services/patient-import-parse";
import { processImport } from "./process";
import type { ImportSummaryDTO } from "./types";

const { patientImports, patientImportRows } = schema;

async function replaceStagingRows(
	importId: string,
	rows: RawPatientRow[],
): Promise<void> {
	const db = getDb();
	const now = Date.now();
	await db.transaction(async (tx) => {
		await tx
			.delete(patientImportRows)
			.where(eq(patientImportRows.importId, importId));
		if (rows.length > 0) {
			await tx.insert(patientImportRows).values(
				rows.map((raw, i) => ({
					id: randomUUID(),
					importId,
					rowIndex: i,
					rawData: raw as Record<string, unknown>,
					createdAt: now,
					updatedAt: now,
				})),
			);
		}

		await tx
			.update(patientImports)
			.set({
				status: "pending",
				failedStage: null,
				errorSummary: null,
				totalRows: rows.length,
				updatedAt: now,
			})
			.where(eq(patientImports.id, importId));
	});
}

export interface OcrIngestDeps {
	fetch?: FetchLike;

	config?: MinimaxOcrConfig | null;

	extract?: typeof extractPatientRowsFromImageUrl;
}

export async function ingestOcrImport(
	importId: string,
	imageUrl: string | undefined,
	deps: OcrIngestDeps = {},
): Promise<ImportSummaryDTO> {
	const config =
		deps.config !== undefined ? deps.config : getMinimaxOcrConfig();
	if (!config) throw new Error("OCR provider not configured.");
	if (!imageUrl) throw new Error("Missing image URL for OCR extraction.");

	const extract = deps.extract ?? extractPatientRowsFromImageUrl;
	const result = await extract(config, imageUrl, { fetch: deps.fetch });

	await replaceStagingRows(importId, result.rows);
	return processImport(importId);
}

export async function ingestFileImport(
	importId: string,
	contentType: string,
	fileBase64: string,
): Promise<ImportSummaryDTO> {
	const rows = parseImportFile(contentType, fileBase64);
	await replaceStagingRows(importId, rows);
	return processImport(importId);
}
