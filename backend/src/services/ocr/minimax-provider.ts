import type { MinimaxOcrConfig } from "@/services/ocr/minimax-config";
import type { RawPatientRow } from "@/services/patient-import-logic";
import { MAX_IMPORT_ROWS } from "@/services/patient-import-parse";

export class MinimaxOcrError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "MinimaxOcrError";
	}
}

export const OCR_REVIEW_WARNING =
	"Extracted via OCR/ICR — mandatory human review required before apply.";

export interface OcrExtractionResult {
	rows: RawPatientRow[];

	model: string;

	needsHumanReview: true;

	warnings: string[];
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

const ALLOWED_STRING_FIELDS = [
	"name",
	"hospital",
	"hospitalId",
	"condition",
	"status",
	"documentId",
	"notes",
	"contact",
] as const;

function isValidImageUrl(url: string): boolean {
	return /^https?:\/\//i.test(url);
}

export async function extractPatientRowsFromImageUrl(
	config: MinimaxOcrConfig,
	imageUrl: string,
	deps: { fetch?: FetchLike } = {},
): Promise<OcrExtractionResult> {
	const doFetch = deps.fetch ?? (globalThis.fetch as FetchLike | undefined);
	if (!doFetch) throw new MinimaxOcrError("No fetch implementation available.");

	const url = (imageUrl ?? "").trim();
	if (!isValidImageUrl(url)) {
		throw new MinimaxOcrError("Invalid image URL for OCR extraction.");
	}

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), config.timeoutMs);

	let res: Response;
	try {
		res = await doFetch(`${config.baseUrl}/chat/completions`, {
			method: "POST",
			headers: {
				"content-type": "application/json",

				authorization: `Bearer ${config.apiKey}`,
			},
			body: JSON.stringify({
				model: config.model,
				max_completion_tokens: config.maxTokens,
				temperature: 0,
				thinking: { type: "disabled" },
				messages: [
					{ role: "system", content: config.prompt },
					{
						role: "user",
						content: [
							{
								type: "text",
								text: "Extract the patient rows from this document as a JSON array.",
							},
							{ type: "image_url", image_url: { url, detail: "default" } },
						],
					},
				],
			}),
			signal: controller.signal,
		});
	} catch {
		throw new MinimaxOcrError("OCR provider request failed.");
	} finally {
		clearTimeout(timer);
	}

	if (!res.ok) {
		throw new MinimaxOcrError(`OCR provider returned status ${res.status}.`);
	}

	let data: unknown;
	try {
		data = await res.json();
	} catch {
		throw new MinimaxOcrError("OCR provider returned invalid JSON.");
	}

	const content = extractMessageContent(data);
	const rows = parseRowsFromContent(content);

	return {
		rows,
		model: config.model,
		needsHumanReview: true,
		warnings: [OCR_REVIEW_WARNING],
	};
}

function extractMessageContent(data: unknown): string {
	const choices = (data as { choices?: unknown }).choices;
	if (!Array.isArray(choices) || choices.length === 0) {
		throw new MinimaxOcrError("OCR provider returned no choices.");
	}
	const message = (choices[0] as { message?: { content?: unknown } }).message;
	const content = message?.content;
	if (typeof content !== "string") {
		throw new MinimaxOcrError(
			"OCR provider returned an unexpected message shape.",
		);
	}
	return content;
}

function stripCodeFences(raw: string): string {
	const trimmed = raw.trim();
	const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
	return fenced?.[1]?.trim() ?? trimmed;
}

function parseRowsFromContent(content: string): RawPatientRow[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stripCodeFences(content));
	} catch {
		throw new MinimaxOcrError("OCR provider returned non-JSON content.");
	}
	if (!Array.isArray(parsed)) {
		throw new MinimaxOcrError(
			"OCR provider did not return a JSON array of rows.",
		);
	}
	if (parsed.length > MAX_IMPORT_ROWS) {
		throw new MinimaxOcrError(
			`OCR provider returned more than ${MAX_IMPORT_ROWS} rows.`,
		);
	}

	const rows: RawPatientRow[] = [];
	for (const entry of parsed) {
		if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
		const src = entry as Record<string, unknown>;
		const row: RawPatientRow = {};
		for (const field of ALLOWED_STRING_FIELDS) {
			const value = src[field];
			if (typeof value === "string" && value.trim() !== "") {
				(row as Record<string, unknown>)[field] = value.trim();
			}
		}

		const age = src.age;
		if (
			typeof age === "number" ||
			(typeof age === "string" && age.trim() !== "")
		) {
			row.age = typeof age === "number" ? age : age.trim();
		}

		if (Object.keys(row).length > 0) rows.push(row);
	}
	return rows;
}
