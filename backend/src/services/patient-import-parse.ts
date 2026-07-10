import { inflateRawSync } from "node:zlib";

import {
	type RawPatientRow,
	stripAccents,
} from "@/services/patient-import-logic";

export const MAX_IMPORT_ROWS = 2000;

const MAX_DECODED_BYTES = 6 * 1024 * 1024;

const XLSX_MAX_ENTRIES = 256;
const XLSX_MAX_ENTRY_BYTES = 16 * 1024 * 1024;
const XLSX_MAX_TOTAL_BYTES = 32 * 1024 * 1024;

const XLSX_MAX_COLS = 16384;

const XLSX_MAX_ROWS = MAX_IMPORT_ROWS + 1;

const XLSX_MAX_CELLS = 200_000;

export const CONTENT_TYPE = {
	JSON: "application/json",
	CSV: "text/csv",
	XLSX: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} as const;

export type SupportedContentType =
	(typeof CONTENT_TYPE)[keyof typeof CONTENT_TYPE];

export const FILE_CONTENT_TYPES: ReadonlySet<string> = new Set([
	CONTENT_TYPE.CSV,
	CONTENT_TYPE.XLSX,
]);

export function isOcrPendingContentType(contentType: string): boolean {
	const ct = contentType.trim().toLowerCase();
	return ct === "application/pdf" || ct.startsWith("image/");
}

export class ImportParseError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ImportParseError";
	}
}

const HEADER_ALIASES: Readonly<Record<string, keyof RawPatientRow>> =
	Object.freeze({
		hospital: "hospital",
		hospitalname: "hospital",
		nombrehospital: "hospital",
		hospitalid: "hospitalId",
		idhospital: "hospitalId",
		name: "name",
		nombre: "name",
		paciente: "name",
		age: "age",
		edad: "age",
		condition: "condition",
		condicion: "condition",
		estadoclinico: "condition",
		status: "status",
		estado: "status",
		documentid: "documentId",
		document: "documentId",
		documento: "documentId",
		cedula: "documentId",
		dni: "documentId",
		ci: "documentId",
		notes: "notes",
		notas: "notes",
		observaciones: "notes",
		contact: "contact",
		contacto: "contact",
		telefono: "contact",
	});

function headerKey(raw: string): string {
	return stripAccents(raw.toLowerCase()).replace(/[^a-z0-9]/g, "");
}

function decodeXmlEntities(s: string): string {
	return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, body: string) => {
		if (body[0] === "#") {
			const code =
				body[1] === "x" || body[1] === "X"
					? parseInt(body.slice(2), 16)
					: parseInt(body.slice(1), 10);
			return Number.isFinite(code) ? String.fromCodePoint(code) : m;
		}
		switch (body) {
			case "amp":
				return "&";
			case "lt":
				return "<";
			case "gt":
				return ">";
			case "quot":
				return '"';
			case "apos":
				return "'";
			default:
				return m;
		}
	});
}

function sniffDelimiter(text: string): string {
	const firstLine = text.slice(
		0,
		text.indexOf("\n") === -1 ? text.length : text.indexOf("\n"),
	);
	const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
	let inQuotes = false;
	for (const ch of firstLine) {
		if (ch === '"') inQuotes = !inQuotes;
		else if (!inQuotes && ch in counts) counts[ch] = (counts[ch] ?? 0) + 1;
	}
	let best = ",";
	for (const d of [";", "\t"]) {
		if ((counts[d] ?? 0) > (counts[best] ?? 0)) best = d;
	}
	return best;
}

export function parseDelimited(input: string): string[][] {
	const text = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
	const delimiter = sniffDelimiter(text);
	const rows: string[][] = [];
	let field = "";
	let row: string[] = [];
	let inQuotes = false;

	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (ch === undefined) break;
		if (inQuotes) {
			if (ch === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				field += ch;
			}
			continue;
		}
		if (ch === '"') {
			inQuotes = true;
		} else if (ch === delimiter) {
			row.push(field);
			field = "";
		} else if (ch === "\n") {
			row.push(field);
			rows.push(row);
			row = [];
			field = "";
		} else {
			field += ch;
		}
	}

	if (field.length > 0 || row.length > 0) {
		row.push(field);
		rows.push(row);
	}
	return rows;
}

interface ZipEntry {
	method: number;
	localOffset: number;
	compSize: number;
	uncompSize: number;
}

function readZipCentralDirectory(buf: Buffer): Map<string, ZipEntry> {
	const EOCD_SIG = 0x06054b50;
	let eocd = -1;
	const minStart = Math.max(0, buf.length - 0x10000 - 22);
	for (let i = buf.length - 22; i >= minStart; i--) {
		if (buf.readUInt32LE(i) === EOCD_SIG) {
			eocd = i;
			break;
		}
	}
	if (eocd === -1)
		throw new ImportParseError(
			"El archivo no es un XLSX válido (falta el índice ZIP).",
		);

	const total = buf.readUInt16LE(eocd + 10);
	const cdOffset = buf.readUInt32LE(eocd + 16);
	if (total === 0xffff || cdOffset === 0xffffffff) {
		throw new ImportParseError(
			"XLSX demasiado grande o en formato ZIP64 no soportado.",
		);
	}
	if (total > XLSX_MAX_ENTRIES) {
		throw new ImportParseError("El XLSX tiene demasiadas entradas internas.");
	}

	const entries = new Map<string, ZipEntry>();
	const CEN_SIG = 0x02014b50;
	let p = cdOffset;
	for (let n = 0; n < total; n++) {
		if (p + 46 > buf.length || buf.readUInt32LE(p) !== CEN_SIG) {
			throw new ImportParseError(
				"El archivo no es un XLSX válido (índice ZIP corrupto).",
			);
		}
		const method = buf.readUInt16LE(p + 10);
		const compSize = buf.readUInt32LE(p + 20);
		const uncompSize = buf.readUInt32LE(p + 24);
		const nameLen = buf.readUInt16LE(p + 28);
		const extraLen = buf.readUInt16LE(p + 30);
		const commentLen = buf.readUInt16LE(p + 32);
		const localOffset = buf.readUInt32LE(p + 42);
		const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
		entries.set(name, { method, localOffset, compSize, uncompSize });
		p += 46 + nameLen + extraLen + commentLen;
	}
	return entries;
}

function inflateEntry(
	buf: Buffer,
	entry: ZipEntry,
	budget: { used: number },
): string {
	if (entry.uncompSize > XLSX_MAX_ENTRY_BYTES) {
		throw new ImportParseError(
			"Una entrada del XLSX excede el tamaño permitido.",
		);
	}

	const LOC_SIG = 0x04034b50;
	const off = entry.localOffset;
	if (off + 30 > buf.length || buf.readUInt32LE(off) !== LOC_SIG) {
		throw new ImportParseError(
			"El archivo no es un XLSX válido (cabecera local corrupta).",
		);
	}
	const nameLen = buf.readUInt16LE(off + 26);
	const extraLen = buf.readUInt16LE(off + 28);
	const dataStart = off + 30 + nameLen + extraLen;
	const data = buf.subarray(dataStart, dataStart + entry.compSize);

	let out: Buffer;
	if (entry.method === 0) {
		out = Buffer.from(data);
	} else if (entry.method === 8) {
		out = inflateRawSync(data, { maxOutputLength: XLSX_MAX_ENTRY_BYTES });
	} else {
		throw new ImportParseError("Compresión interna del XLSX no soportada.");
	}
	budget.used += out.length;
	if (budget.used > XLSX_MAX_TOTAL_BYTES) {
		throw new ImportParseError(
			"El XLSX descomprimido excede el tamaño permitido.",
		);
	}
	return out.toString("utf8");
}

function parseSharedStrings(xml: string): string[] {
	const out: string[] = [];
	const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
	for (let m = siRe.exec(xml); m !== null; m = siRe.exec(xml)) {
		const inner = m[1] ?? "";
		const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
		let text = "";
		for (let t = tRe.exec(inner); t !== null; t = tRe.exec(inner)) {
			text += t[1] ?? "";
		}
		out.push(decodeXmlEntities(text));
	}
	return out;
}

function columnIndex(ref: string): number {
	let col = 0;
	for (const ch of ref) {
		const code = ch.charCodeAt(0);
		if (code >= 65 && code <= 90) col = col * 26 + (code - 64);
		else if (code >= 97 && code <= 122) col = col * 26 + (code - 96);
		else break;
	}
	return col - 1;
}

function parseSheet(xml: string, shared: string[]): string[][] {
	const grid: string[][] = [];
	let totalCells = 0;
	const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
	const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
	for (let rm = rowRe.exec(xml); rm !== null; rm = rowRe.exec(xml)) {
		const rowXml = rm[1] ?? "";
		const cells: string[] = [];
		let autoCol = 0;
		for (let cm = cellRe.exec(rowXml); cm !== null; cm = cellRe.exec(rowXml)) {
			const attrs = cm[1] ?? "";
			const body = cm[2] ?? "";
			const refMatch = /\br="([A-Za-z]+)\d+"/.exec(attrs);
			const col = refMatch ? columnIndex(refMatch[1] ?? "") : autoCol;

			if (col >= XLSX_MAX_COLS) {
				throw new ImportParseError(
					`El XLSX excede el máximo de ${XLSX_MAX_COLS} columnas.`,
				);
			}
			autoCol = col + 1;
			const typeMatch = /\bt="([^"]+)"/.exec(attrs);
			const type = typeMatch ? typeMatch[1] : undefined;

			let value: string;
			if (type === "inlineStr") {
				const is = /<t\b[^>]*>([\s\S]*?)<\/t>/.exec(body);
				value = is ? decodeXmlEntities(is[1] ?? "") : "";
			} else {
				const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body);
				const raw = v ? (v[1] ?? "") : "";
				if (type === "s") {
					const idx = Number(raw);
					value =
						Number.isInteger(idx) && idx >= 0 && idx < shared.length
							? (shared[idx] ?? "")
							: "";
				} else {
					value = decodeXmlEntities(raw);
				}
			}
			if (col >= 0) cells[col] = value;
		}
		for (let i = 0; i < cells.length; i++)
			if (cells[i] === undefined) cells[i] = "";
		grid.push(cells);
		if (grid.length > XLSX_MAX_ROWS) {
			throw new ImportParseError(
				`El archivo excede el máximo de ${MAX_IMPORT_ROWS} filas.`,
			);
		}
		totalCells += cells.length;
		if (totalCells > XLSX_MAX_CELLS) {
			throw new ImportParseError(
				"El XLSX excede el máximo de celdas permitidas.",
			);
		}
	}
	return grid;
}

export function parseXlsxBuffer(buf: Buffer): string[][] {
	try {
		const entries = readZipCentralDirectory(buf);
		const budget = { used: 0 };

		const sheetNames = [...entries.keys()]
			.filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
			.sort();
		const sheetName = sheetNames[0];
		if (!sheetName)
			throw new ImportParseError("El XLSX no contiene ninguna hoja.");

		let shared: string[] = [];
		const ssEntry = entries.get("xl/sharedStrings.xml");
		if (ssEntry)
			shared = parseSharedStrings(inflateEntry(buf, ssEntry, budget));

		const sheetEntry = entries.get(sheetName);
		if (!sheetEntry) {
			throw new ImportParseError("El XLSX no contiene ninguna hoja.");
		}

		const sheetXml = inflateEntry(buf, sheetEntry, budget);
		return parseSheet(sheetXml, shared);
	} catch (err) {
		if (err instanceof ImportParseError) throw err;
		throw new ImportParseError(
			"El archivo no es un XLSX válido o está corrupto.",
		);
	}
}

function nonEmpty(s: string | undefined): boolean {
	return typeof s === "string" && s.trim().length > 0;
}

export function tableToRows(grid: string[][]): RawPatientRow[] {
	const headerRowIndex = grid.findIndex((r) => r.some(nonEmpty));
	if (headerRowIndex === -1) {
		throw new ImportParseError("El archivo no tiene encabezados.");
	}
	const headerRow = grid[headerRowIndex];
	if (!headerRow) {
		throw new ImportParseError("El archivo no tiene encabezados.");
	}
	const header = headerRow.map((h) => (h ?? "").trim());
	const fields = header.map((h) =>
		h ? (HEADER_ALIASES[headerKey(h)] ?? h) : null,
	);
	if (fields.every((f) => f === null)) {
		throw new ImportParseError("El archivo no tiene encabezados.");
	}

	const rows: RawPatientRow[] = [];
	for (let r = headerRowIndex + 1; r < grid.length; r++) {
		const cells = grid[r] ?? [];
		if (!cells.some(nonEmpty)) continue;
		const obj: RawPatientRow = {};
		for (let c = 0; c < fields.length; c++) {
			const field = fields[c];
			if (field === null) continue;
			const value = (cells[c] ?? "").trim();
			if (value === "") continue;
			(obj as Record<string, unknown>)[field as string] = value;
		}
		rows.push(obj);
		if (rows.length > MAX_IMPORT_ROWS) {
			throw new ImportParseError(
				`El archivo excede el máximo de ${MAX_IMPORT_ROWS} filas.`,
			);
		}
	}
	if (rows.length === 0) {
		throw new ImportParseError("El archivo no contiene filas de datos.");
	}
	return rows;
}

function decodeBase64(fileBase64: string): Buffer {
	const cleaned = fileBase64.trim();
	if (!cleaned)
		throw new ImportParseError(
			"Falta el contenido del archivo (fileBase64 vacío).",
		);
	if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned) || cleaned.length % 4 !== 0) {
		throw new ImportParseError("fileBase64 no es base64 válido.");
	}
	const buf = Buffer.from(cleaned, "base64");
	if (buf.length === 0) throw new ImportParseError("El archivo está vacío.");
	if (buf.length > MAX_DECODED_BYTES) {
		throw new ImportParseError("El archivo excede el tamaño máximo permitido.");
	}
	return buf;
}

export function parseImportFile(
	contentType: string,
	fileBase64: string,
): RawPatientRow[] {
	const buf = decodeBase64(fileBase64);
	if (contentType === CONTENT_TYPE.CSV) {
		return tableToRows(parseDelimited(buf.toString("utf8")));
	}
	if (contentType === CONTENT_TYPE.XLSX) {
		return tableToRows(parseXlsxBuffer(buf));
	}
	throw new ImportParseError(
		`Content-type no soportado para archivo: ${contentType}`,
	);
}
