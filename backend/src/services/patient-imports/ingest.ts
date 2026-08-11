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
	// SIN transacción interactiva (Workers). Orden deliberado: borrar, insertar
	// en tandas y ACTUALIZAR EL HEADER AL FINAL — si algo corta a medias, el
	// totalRows del header no coincide con las filas y el guard de integridad
	// del process marca el lote fallido en vez de procesar a medias.
	// Re-ejecutar el ingest reemplaza todo de nuevo (idempotente).
	await db
		.delete(patientImportRows)
		.where(eq(patientImportRows.importId, importId));
	const CHUNK = 100;
	for (let start = 0; start < rows.length; start += CHUNK) {
		await db.insert(patientImportRows).values(
			rows.slice(start, start + CHUNK).map((raw, offset) => ({
				id: randomUUID(),
				importId,
				rowIndex: start + offset,
				rawData: raw as Record<string, unknown>,
				createdAt: now,
				updatedAt: now,
			})),
		);
	}
	await db
		.update(patientImports)
		.set({
			status: "pending",
			failedStage: null,
			errorSummary: null,
			totalRows: rows.length,
			updatedAt: now,
		})
		.where(eq(patientImports.id, importId));
}

/**
 * Materializa las filas de un archivo CSV/XLSX en staging SIN procesarlo.
 * Camino de Cloudflare Queues: el archivo no cabe/no viaja en el mensaje
 * (límite 128 KB), así que el productor lo parsea inline y encola solo
 * `{ importId, mode: "process" }`.
 */
export async function stageFileRows(
	importId: string,
	contentType: string,
	fileBase64: string,
): Promise<void> {
	const rows = parseImportFile(contentType, fileBase64);
	await replaceStagingRows(importId, rows);
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
