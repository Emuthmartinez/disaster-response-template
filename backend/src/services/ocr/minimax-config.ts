import { env } from "@/config/env";

export interface MinimaxOcrConfig {
	apiKey: string;

	baseUrl: string;

	model: string;

	maxTokens: number;

	timeoutMs: number;

	prompt: string;
}

export interface MinimaxEnvSource {
	ENABLE_PATIENT_OCR?: boolean;
	MINIMAX_API_KEY?: string;
	MINIMAX_OCR_BASE_URL?: string;
	MINIMAX_OCR_MODEL: string;
	MINIMAX_OCR_MAX_TOKENS: number;
	MINIMAX_OCR_TIMEOUT_MS: number;
	MINIMAX_OCR_PROMPT?: string;
}

export const DEFAULT_OCR_PROMPT = [
	"You extract structured patient data from a scanned hospital document image.",
	"Return ONLY a JSON array (no prose, no code fences). Each element is an object",
	'with any of these optional string fields: "name", "hospital", "hospitalId",',
	'"age", "condition", "status", "documentId", "notes", "contact".',
	"Omit any field you cannot read confidently. Do not invent data. If the image",
	"has no readable patient data, return an empty array [].",
	"This output is advisory only and will be reviewed by a human before use.",
].join(" ");

/**
 * Devuelve la config del proveedor OCR, o null si el módulo está apagado
 * (ENABLE_PATIENT_OCR=false/ausente) o falta credencial/URL. `env.ts` ya falla
 * rápido en el arranque si ENABLE_PATIENT_OCR=true pero falta alguna, así que en
 * ese caso llegar aquí con algo faltante no debería pasar — igual se revalida
 * por defensa en profundidad (test unitarios pueden llamar esto con un source
 * a medio construir).
 */
export function getMinimaxOcrConfig(
	source: MinimaxEnvSource = env,
): MinimaxOcrConfig | null {
	if (!source.ENABLE_PATIENT_OCR) return null;
	const apiKey = source.MINIMAX_API_KEY?.trim();
	const baseUrl = source.MINIMAX_OCR_BASE_URL?.trim();
	if (!apiKey || !baseUrl) return null;

	const prompt = source.MINIMAX_OCR_PROMPT?.trim();
	return {
		apiKey,
		baseUrl: baseUrl.replace(/\/+$/, ""),
		model: source.MINIMAX_OCR_MODEL,
		maxTokens: source.MINIMAX_OCR_MAX_TOKENS,
		timeoutMs: source.MINIMAX_OCR_TIMEOUT_MS,
		prompt: prompt && prompt.length > 0 ? prompt : DEFAULT_OCR_PROMPT,
	};
}

export function isMinimaxOcrEnabled(source: MinimaxEnvSource = env): boolean {
	return getMinimaxOcrConfig(source) !== null;
}
