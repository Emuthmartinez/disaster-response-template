import { json, Router } from "express";
import { z } from "zod";
import { writeAudit } from "@/auth/audit";
import {
	badRequest,
	notFound,
	notImplemented,
	serviceUnavailable,
} from "@/lib/errors";
import { enqueuePatientImport } from "@/lib/queues";
import { asyncHandler, rateLimit, validate } from "@/middleware";
import { requireCapability } from "@/middleware/auth";
import { getMinimaxOcrConfig } from "@/services/ocr/minimax-config";
import {
	CONTENT_TYPE,
	FILE_CONTENT_TYPES,
	isOcrPendingContentType,
	MAX_IMPORT_ROWS,
} from "@/services/patient-import-parse";
import * as service from "@/services/patient-imports";

export const patientImportsRouter = Router();

const jsonLargeBatch = json({ limit: "4mb" });

const rowSchema = z
	.object({
		hospital: z.string().trim().max(200).optional(),
		hospitalId: z.string().trim().max(120).optional(),
		name: z.string().trim().max(200).optional(),
		age: z
			.union([z.number(), z.string().max(10)])
			.nullable()
			.optional(),
		condition: z.string().trim().max(60).optional(),
		status: z.string().trim().max(60).optional(),

		documentId: z.string().trim().max(60).optional(),
		notes: z.string().max(600).optional(),
		contact: z.string().max(120).optional(),
	})
	.passthrough();

const MAX_FILE_BASE64_LEN = 4_000_000;

const SUPPORTED_CONTENT_TYPES: ReadonlySet<string> = new Set([
	CONTENT_TYPE.JSON,
	CONTENT_TYPE.CSV,
	CONTENT_TYPE.XLSX,
]);

function isImageContentType(contentType: string | undefined): boolean {
	return (contentType?.trim().toLowerCase() ?? "").startsWith("image/");
}

const createSchema = z
	.object({
		source: z.string().trim().max(120).optional(),

		sourceRecordId: z.string().trim().max(200).optional(),
		integration: z.string().trim().max(120).optional(),

		contentType: z
			.string()
			.trim()
			.max(120)
			.optional()
			.refine(
				(v) =>
					v === undefined ||
					SUPPORTED_CONTENT_TYPES.has(v) ||
					isOcrPendingContentType(v),
				{
					message:
						'contentType admitido: "application/json", "text/csv" o XLSX.',
				},
			),

		rows: z
			.array(rowSchema)
			.min(1, "Envía al menos una fila.")
			.max(MAX_IMPORT_ROWS, `Máximo ${MAX_IMPORT_ROWS} filas por lote.`)
			.optional(),

		fileBase64: z
			.string()
			.max(MAX_FILE_BASE64_LEN, "Archivo demasiado grande.")
			.optional(),

		imageUrl: z
			.string()
			.trim()
			.max(2048)
			.url("imageUrl debe ser una URL válida.")
			.refine((v) => /^https?:\/\//i.test(v), {
				message: "imageUrl debe ser http o https.",
			})
			.optional(),
	})
	.superRefine((val, ctx) => {
		if (val.imageUrl !== undefined && !isImageContentType(val.contentType)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["imageUrl"],
				message: "imageUrl solo aplica a contentType image/* (OCR/ICR).",
			});
		}

		if (
			val.contentType !== undefined &&
			isOcrPendingContentType(val.contentType)
		)
			return;
		const isFile =
			val.contentType !== undefined && FILE_CONTENT_TYPES.has(val.contentType);
		if (isFile) {
			if (!val.fileBase64) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["fileBase64"],
					message: "Para CSV/XLSX envía el archivo en fileBase64.",
				});
			}
			if (val.rows !== undefined) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["rows"],
					message: "Para CSV/XLSX usa fileBase64, no rows.",
				});
			}
		} else {
			if (!val.rows) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["rows"],
					message: "Envía al menos una fila.",
				});
			}
			if (val.fileBase64 !== undefined) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["fileBase64"],
					message: "fileBase64 solo aplica a CSV/XLSX.",
				});
			}
		}
	});

const idempotencyKeyHeader = z.object({
	"idempotency-key": z.string().trim().min(1).max(200).optional(),
});

const idParams = z.object({ id: z.string().trim().min(1, "Falta el id.") });
const rowsQuery = z.object({
	limit: z.coerce.number().int().min(1).max(500).optional(),
	offset: z.coerce.number().int().min(0).optional(),
});

/**
 * @swagger
 * /api/public/patient-imports:
 *   post:
 *     summary: Crear lote de importación (patient:import)
 *     tags: [Public:PatientImports]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       202: { description: Lote encolado }
 *       400: { description: Payload inválido }
 *       501: { description: OCR no habilitado }
 */
patientImportsRouter.post(
	"/",
	rateLimit({ scope: "public:patient-import:create", limit: 30 }),
	requireCapability("patient:import"),
	jsonLargeBatch,
	validate({ body: createSchema }),
	asyncHandler(async (req, res) => {
		const parsedHeaders = idempotencyKeyHeader.safeParse(req.headers);
		if (!parsedHeaders.success) throw badRequest("Idempotency-Key inválido.");
		const headers = parsedHeaders.data;
		const parsed = req.body as z.infer<typeof createSchema>;

		if (
			parsed.contentType !== undefined &&
			isOcrPendingContentType(parsed.contentType)
		) {
			const ocrConfig = getMinimaxOcrConfig();
			const isImage = isImageContentType(parsed.contentType);
			if (!ocrConfig || !isImage) {
				throw notImplemented(
					"Importación por OCR/ICR (imagen o PDF) no está habilitada en este servidor. " +
						"El reconocimiento de imágenes/PDF y de texto manuscrito requiere revisión humana. " +
						"Por ahora envía datos tabulares: JSON (rows) o un archivo CSV/XLSX (fileBase64).",
				);
			}
			if (!parsed.imageUrl) {
				throw badRequest(
					"Para OCR/ICR de imagen envía imageUrl (URL http/https). No se acepta base64 ni rows en esta fase.",
				);
			}
			if (parsed.fileBase64 !== undefined || parsed.rows !== undefined) {
				throw badRequest(
					"Para OCR/ICR de imagen usa solo imageUrl (sin fileBase64 ni rows).",
				);
			}

			const created = await service.createImport(
				{
					source: parsed.source,
					sourceRecordId: parsed.sourceRecordId,
					integration: parsed.integration,
					contentType: parsed.contentType,
					rows: [],
					idempotencyKey: headers["idempotency-key"],
				},
				req.user?.id ?? null,
			);
			const { reusedExisting, ...summary } = created;
			if (reusedExisting) {
				res.status(202).json({ import: summary, jobId: summary.jobId });
				return;
			}
			let ocrJobId: string;
			try {
				ocrJobId = await enqueuePatientImport({
					importId: summary.id,
					mode: "ocr",
					imageUrl: parsed.imageUrl,
				});
			} catch {
				await service.markImportFailed(
					summary.id,
					"No se pudo encolar el OCR/ICR.",
					"process",
				);
				throw serviceUnavailable(
					"No se pudo encolar la importación OCR. Inténtalo de nuevo.",
				);
			}
			await service.markImportQueued(summary.id, ocrJobId);

			await writeAudit(req, {
				action: "patient-import.create",
				targetType: "patient-import",
				targetId: summary.id,
				metadata: {
					source: summary.source,
					contentType: summary.contentType,
					ocr: true,
				},
			});
			res.status(202).json({
				import: { ...summary, status: "queued", jobId: ocrJobId },
				jobId: ocrJobId,
			});
			return;
		}

		const isFile =
			parsed.contentType !== undefined &&
			FILE_CONTENT_TYPES.has(parsed.contentType);

		const created = await service.createImport(
			{
				source: parsed.source,
				sourceRecordId: parsed.sourceRecordId,
				integration: parsed.integration,
				contentType: parsed.contentType,
				rows: isFile ? [] : (parsed.rows ?? []),
				idempotencyKey: headers["idempotency-key"],
			},
			req.user?.id ?? null,
		);
		const { reusedExisting, ...summary } = created;
		if (reusedExisting) {
			res.status(202).json({ import: summary, jobId: summary.jobId });
			return;
		}
		let jobId: string;
		try {
			jobId = await enqueuePatientImport(
				isFile
					? {
							importId: summary.id,
							mode: "process",
							contentType: parsed.contentType,
							fileBase64: parsed.fileBase64,
						}
					: { importId: summary.id, mode: "process" },
			);
		} catch {
			await service.markImportFailed(
				summary.id,
				"No se pudo encolar el procesamiento.",
				"process",
			);
			throw serviceUnavailable(
				"No se pudo encolar la importación. Inténtalo de nuevo.",
			);
		}

		await service.markImportQueued(summary.id, jobId);
		await writeAudit(req, {
			action: "patient-import.create",
			targetType: "patient-import",
			targetId: summary.id,

			metadata: isFile
				? { source: summary.source, contentType: summary.contentType }
				: { rows: summary.counts.total, source: summary.source },
		});
		res
			.status(202)
			.json({ import: { ...summary, status: "queued", jobId }, jobId });
	}),
);

/**
 * @swagger
 * /api/public/patient-imports/{id}:
 *   get:
 *     summary: Estado y contadores de un lote (capability patient:import)
 *     tags: [Public:PatientImports]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Resumen del lote (sin PII) }
 *       404: { description: No encontrado }
 */
patientImportsRouter.get(
	"/:id",
	rateLimit({ scope: "public:patient-import:get", limit: 120 }),
	requireCapability("patient:import"),
	validate({ params: idParams }),
	asyncHandler(async (req, res) => {
		const summary = await service.getImport((req.params as { id: string }).id);
		if (!summary) throw notFound("Lote de importación no encontrado.");
		res.json({ import: summary });
	}),
);

/**
 * @swagger
 * /api/public/patient-imports/{id}/rows:
 *   get:
 *     summary: Filas redactadas del lote (patient:import)
 *     tags: [Public:PatientImports]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *       - { name: limit, in: query, schema: { type: integer } }
 *       - { name: offset, in: query, schema: { type: integer } }
 *     responses:
 *       200: { description: Filas redactadas del lote }
 *       404: { description: No encontrado }
 */
patientImportsRouter.get(
	"/:id/rows",
	rateLimit({ scope: "public:patient-import:rows", limit: 120 }),
	requireCapability("patient:import"),
	validate({ params: idParams, query: rowsQuery }),
	asyncHandler(async (req, res) => {
		const id = (req.params as { id: string }).id;
		const exists = await service.getImport(id);
		if (!exists) throw notFound("Lote de importación no encontrado.");
		const q = req.query as z.infer<typeof rowsQuery>;
		const rows = await service.listImportRows(id, {
			limit: q.limit,
			offset: q.offset,
		});
		res.json({ items: rows });
	}),
);

/**
 * @swagger
 * /api/public/patient-imports/{id}/apply:
 *   post:
 *     summary: Aplicar filas válidas del lote (patient:import)
 *     tags: [Public:PatientImports]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *     responses:
 *       202: { description: Apply encolado }
 *       400: { description: El lote aún no está procesado o no es reanudable }
 *       404: { description: No encontrado }
 *       503: { description: No se pudo encolar (cola no disponible) }
 */
patientImportsRouter.post(
	"/:id/apply",
	rateLimit({ scope: "public:patient-import:apply", limit: 30 }),
	requireCapability("patient:import"),
	validate({ params: idParams }),
	asyncHandler(async (req, res) => {
		const id = (req.params as { id: string }).id;
		const summary = await service.getImport(id);
		if (!summary) throw notFound("Lote de importación no encontrado.");

		if (
			!["processed", "applied"].includes(summary.status) &&
			!(summary.status === "failed" && summary.failedStage === "apply")
		) {
			throw badRequest(
				`El lote está en estado "${summary.status}"; debe estar "processed" o fallido en etapa "apply" para aplicar.`,
			);
		}
		let jobId: string;
		try {
			jobId = await enqueuePatientImport({
				importId: id,
				mode: "apply",
				actorId: req.user?.id ?? null,
			});
		} catch {
			throw serviceUnavailable(
				"No se pudo encolar el apply. Inténtalo de nuevo.",
			);
		}
		await service.setImportJob(id, jobId);
		await writeAudit(req, {
			action: "patient-import.apply",
			targetType: "patient-import",
			targetId: id,
			metadata: { valid: summary.counts.valid },
		});
		res.status(202).json({ jobId });
	}),
);
