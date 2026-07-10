import { createHmac } from "node:crypto";

import type { PatientCondition, PatientStatus } from "@/services/patients";

export interface RawPatientRow {
	hospital?: string;

	hospitalId?: string;
	name?: string;
	age?: number | string | null;
	condition?: string;
	status?: string;

	documentId?: string;
	notes?: string;
	contact?: string;
	[extra: string]: unknown;
}

export interface NormalizedRow {
	name: string;
	normalizedKey: string;
	age: number | null;
	condition: PatientCondition;
	status: PatientStatus;
	sourceHospital: string;

	hospitalIdHint: string | null;

	documentDigits: string | null;

	documentHash: string | null;
	notes: string;
	contact: string;
	warnings: string[];
}

const CONDITIONS: ReadonlySet<PatientCondition> = new Set([
	"stable",
	"serious",
	"critical",
	"recovering",
	"unknown",
]);
const STATUSES: ReadonlySet<PatientStatus> = new Set([
	"hospitalized",
	"sheltered",
	"discharged",
	"transferred",
	"deceased",
]);

const CONDITION_SYNONYMS: Record<string, PatientCondition> = {
	estable: "stable",
	stable: "stable",
	grave: "serious",
	serio: "serious",
	serious: "serious",
	critico: "critical",
	critical: "critical",
	"en recuperacion": "recovering",
	recuperandose: "recovering",
	recovering: "recovering",
	desconocido: "unknown",
	unknown: "unknown",
};
const STATUS_SYNONYMS: Record<string, PatientStatus> = {
	hospitalizado: "hospitalized",
	ingresado: "hospitalized",
	internado: "hospitalized",
	hospitalized: "hospitalized",
	albergado: "sheltered",
	refugiado: "sheltered",
	"en refugio": "sheltered",
	sheltered: "sheltered",
	alta: "discharged",
	"dado de alta": "discharged",
	egresado: "discharged",
	discharged: "discharged",
	trasladado: "transferred",
	transferido: "transferred",
	transferred: "transferred",
	fallecido: "deceased",
	muerto: "deceased",
	deceased: "deceased",
};

export function stripAccents(s: string): string {
	const from = "áéíóúüñÁÉÍÓÚÜÑ";
	const to = "aeiouunAEIOUUN";
	let out = "";
	for (const ch of s) {
		const i = from.indexOf(ch);
		out += i === -1 ? ch : to[i];
	}
	return out;
}

export function normalizeName(raw: string | undefined | null): string {
	return (raw ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
}

export function nameKey(raw: string | undefined | null): string {
	const base = stripAccents((raw ?? "").toLowerCase());
	return base
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

export function normalizeAge(
	raw: number | string | null | undefined,
): number | null {
	if (raw === null || raw === undefined || raw === "") return null;
	const n = typeof raw === "number" ? raw : Number(String(raw).trim());
	if (!Number.isFinite(n)) return null;
	const i = Math.trunc(n);
	if (i < 0 || i > 150) return null;
	return i;
}

export function documentDigits(raw: string | undefined | null): string | null {
	const d = (raw ?? "").replace(/[^0-9]/g, "");
	return d.length >= 4 ? d : null;
}

export function hashDocumentDigits(digits: string, secret: string): string {
	return createHmac("sha256", secret).update(digits).digest("hex");
}

export function hospitalNameKey(raw: string | undefined | null): string {
	const base = stripAccents((raw ?? "").toLowerCase());
	return base
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

export const HOSPITAL_ALIASES: Readonly<Record<string, string>> = Object.freeze(
	{},
);

export function resolveHospitalAlias(
	raw: string | undefined | null,
): string | null {
	const key = hospitalNameKey(raw);
	if (!key) return null;
	return HOSPITAL_ALIASES[key] ?? null;
}

export function mapCondition(raw: string | undefined): {
	value: PatientCondition;
	warning?: string;
} {
	if (raw === undefined || raw.trim() === "") return { value: "unknown" };
	const key = stripAccents(raw.toLowerCase().trim());
	if (CONDITIONS.has(key as PatientCondition))
		return { value: key as PatientCondition };
	const mapped = CONDITION_SYNONYMS[key];
	if (mapped) return { value: mapped };
	return {
		value: "unknown",
		warning: `Condición no reconocida ("${raw}"), se usó "unknown".`,
	};
}

export function mapStatus(raw: string | undefined): {
	value: PatientStatus;
	warning?: string;
} {
	if (raw === undefined || raw.trim() === "") return { value: "hospitalized" };
	const key = stripAccents(raw.toLowerCase().trim());
	if (STATUSES.has(key as PatientStatus))
		return { value: key as PatientStatus };
	const mapped = STATUS_SYNONYMS[key];
	if (mapped) return { value: mapped };
	return {
		value: "hospitalized",
		warning: `Estado no reconocido ("${raw}"), se usó "hospitalized".`,
	};
}

export function normalizeRow(raw: RawPatientRow): NormalizedRow {
	const warnings: string[] = [];
	const name = normalizeName(raw.name);
	const condition = mapCondition(raw.condition);
	if (condition.warning) warnings.push(condition.warning);
	const status = mapStatus(raw.status);
	if (status.warning) warnings.push(status.warning);

	return {
		name,
		normalizedKey: nameKey(name),
		age: normalizeAge(raw.age),
		condition: condition.value,
		status: status.value,
		sourceHospital: (raw.hospital ?? "").trim().slice(0, 200),
		hospitalIdHint: raw.hospitalId?.trim()
			? raw.hospitalId.trim().slice(0, 120)
			: null,
		documentDigits: documentDigits(raw.documentId),
		documentHash: null,
		notes: (raw.notes ?? "").trim().slice(0, 600),
		contact: (raw.contact ?? "").trim().slice(0, 120),
		warnings,
	};
}

export function validateRow(
	row: NormalizedRow,
	hospitalResolved: boolean,
): { errors: string[]; hospitalUnresolved: boolean } {
	const errors: string[] = [];
	if (!row.name) errors.push("Falta el nombre del paciente.");
	const hasHospitalInput = Boolean(row.sourceHospital || row.hospitalIdHint);
	if (!hasHospitalInput) {
		errors.push("Falta el hospital (texto o id resoluble).");
	}
	return { errors, hospitalUnresolved: hasHospitalInput && !hospitalResolved };
}

export interface DedupCandidate {
	patientId: string;
	name: string;
	age: number | null;

	documentHash: string | null;
	reason?: string;
}

export type DedupStatus = "unique" | "duplicate" | "needs_review";

export interface DedupVerdict {
	status: DedupStatus;
	confidence: number;

	candidates: DedupCandidate[];
}

function sameKnownAge(a: number | null, b: number | null): boolean {
	return a !== null && b !== null && a === b;
}

export function classifyDedup(
	row: NormalizedRow,
	candidates: DedupCandidate[],
): DedupVerdict {
	if (candidates.length === 0) {
		return { status: "unique", confidence: 0, candidates: [] };
	}

	if (row.documentHash) {
		const docMatch = candidates.filter(
			(c) => c.documentHash === row.documentHash,
		);
		if (docMatch.length > 0) {
			return {
				status: "duplicate",
				confidence: 1,
				candidates: docMatch.map((c) => ({
					...c,
					reason: "document_hash exacto",
				})),
			};
		}
	}

	const sameAge = candidates.filter((c) => sameKnownAge(row.age, c.age));
	if (sameAge.length > 0) {
		return {
			status: "duplicate",
			confidence: 0.9,
			candidates: sameAge.map((c) => ({
				...c,
				reason: "nombre y edad conocida igual",
			})),
		};
	}

	const unknownAge = candidates.filter(
		(c) => row.age === null || c.age === null,
	);
	if (unknownAge.length > 0) {
		return {
			status: "needs_review",
			confidence: 0.6,
			candidates: unknownAge.map((c) => ({
				...c,
				reason: "mismo nombre, edad desconocida",
			})),
		};
	}

	return {
		status: "needs_review",
		confidence: 0.5,
		candidates: candidates.map((c) => ({
			...c,
			reason: "mismo nombre, edad distinta",
		})),
	};
}
