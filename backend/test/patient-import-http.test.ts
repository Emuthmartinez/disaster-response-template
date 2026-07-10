import { createHash, randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "./helpers";
import request from "supertest";
import { ensureSeed, makeUserWithCaps } from "./helpers";

let app: import("express").Express;
const demoRows = [{ name: "Demo Anon", hospital: "Hospital Demo" }];
const IMAGE_URL = "https://example.test/demo-scan.jpg";

async function loadApp() {
	await ensureSeed();
	return (await import("@/server")).app;
}

function postImport(
	token: string,
	body: Record<string, unknown>,
	headers: Record<string, string> = {},
) {
	let req = request(app)
		.post("/api/public/patient-imports")
		.set("Authorization", `Bearer ${token}`)
		.send(body);
	for (const [key, value] of Object.entries(headers)) {
		req = req.set(key, value);
	}
	return req;
}

describe("createImport — HTTP", () => {
	beforeAll(async () => {
		app = await loadApp();
	});
	it("created_by sale de la credencial; source declarado no es autoría", async () => {
		const user = await makeUserWithCaps(["patient:import"]);
		const res = await postImport(user.token, {
			source: "spoof",
			rows: demoRows,
		});
		expect(res.status).toBe(202);
		expect(res.body.import.createdBy).toBe(user.id);
		expect(res.body.import.source).toBe("spoof");
	});

	it("acepta un lote de 2000 filas (>256kb) sin 413", async () => {
		const user = await makeUserWithCaps(["patient:import"]);
		const rows = Array.from({ length: 2000 }, (_, i) => ({
			name: `Paciente Demo ${i}`,
			hospital: "Hospital Demo",
			notes: "x".repeat(120),
		}));
		expect(Buffer.byteLength(JSON.stringify({ rows }))).toBeGreaterThan(
			256 * 1024,
		);
		const res = await postImport(user.token, { source: "test", rows });
		expect(res.status).toBe(202);
		expect(res.body.import.counts.total).toBe(2000);
	});

	it("valida contentType", async () => {
		const { token } = await makeUserWithCaps(["patient:import"]);
		expect(
			(await postImport(token, { contentType: "application/zip", rows: demoRows }))
				.status,
		).toBe(400);
		expect(
			(await postImport(token, { contentType: "text/csv", rows: demoRows }))
				.status,
		).toBe(400);
		expect(
			(
				await postImport(token, {
					contentType: "application/json",
					rows: demoRows,
				})
			).status,
		).toBe(202);
	});

	it("persiste sourceRecordId e integration", async () => {
		const user = await makeUserWithCaps(["patient:import"]);
		const res = await postImport(user.token, {
			source: "hospital-x",
			sourceRecordId: "lote-2026-06-30-001",
			integration: "csv-manual",
			rows: demoRows,
		});
		expect(res.status).toBe(202);
		expect(res.body.import.sourceRecordId).toBe("lote-2026-06-30-001");
		expect(res.body.import.integration).toBe("csv-manual");
		expect(res.body.import.createdBy).toBe(user.id);
		const { getDb, schema } = await import("@/db");
		const { eq } = await import("drizzle-orm");
		const row = await getDb()
			.select({
				sourceRecordId: schema.patientImports.sourceRecordId,
				integration: schema.patientImports.integration,
			})
			.from(schema.patientImports)
			.where(eq(schema.patientImports.id, res.body.import.id));
		expect(row[0]?.sourceRecordId).toBe("lote-2026-06-30-001");
		expect(row[0]?.integration).toBe("csv-manual");
	});

	it("procedencia ausente → null", async () => {
		const { token } = await makeUserWithCaps(["patient:import"]);
		const res = await postImport(token, { source: "api", rows: demoRows });
		expect(res.status).toBe(202);
		expect(res.body.import.sourceRecordId).toBeNull();
		expect(res.body.import.integration).toBeNull();
	});

	it("Idempotency-Key scoped por usuario", async () => {
		const user = await makeUserWithCaps(["patient:import"]);
		const key = `idem-${randomUUID()}`;
		const first = await postImport(
			user.token,
			{ source: "test", rows: demoRows },
			{ "Idempotency-Key": key },
		);
		const second = await postImport(
			user.token,
			{ source: "test", rows: demoRows },
			{ "Idempotency-Key": key },
		);
		expect(first.status).toBe(202);
		expect(second.status).toBe(202);
		expect(second.body.import.id).toBe(first.body.import.id);
		expect(second.body.jobId).toBe(first.body.jobId);
		const userB = await makeUserWithCaps(["patient:import"]);
		const other = await postImport(
			userB.token,
			{ source: "test-b", rows: demoRows },
			{ "Idempotency-Key": key },
		);
		expect(other.body.import.id).not.toBe(first.body.import.id);
	});
});

describe("createImport — OCR deshabilitado → 501", () => {
	beforeAll(async () => {
		app = await loadApp();
	});
	it("rechaza imagen/PDF sin proveedor", async () => {
		const { token } = await makeUserWithCaps(["patient:import"]);
		for (const contentType of [
			"application/pdf",
			"image/png",
			"image/jpeg",
		] as const) {
			const res = await postImport(token, { contentType, rows: demoRows });
			expect(res.status).toBe(501);
		}
		const raw = Buffer.from("RAW-OCR-IMAGE-BYTES-DEMO").toString("base64");
		const res = await postImport(token, {
			contentType: "application/pdf",
			fileBase64: raw,
		});
		expect(res.status).toBe(501);
		expect(JSON.stringify(res.body)).not.toContain(raw);
	});

	it("no persiste lote ni auditoría en 501", async () => {
		const user = await makeUserWithCaps(["patient:import"]);
		const source = `demo-ocr-no-persist-${randomUUID()}`;
		const res = await postImport(
			user.token,
			{ contentType: "application/pdf", source, rows: demoRows },
			{ "Idempotency-Key": `demo-idem-${randomUUID()}` },
		);
		expect(res.status).toBe(501);
		const { getDb, schema } = await import("@/db");
		const { and, eq } = await import("drizzle-orm");
		const db = getDb();
		expect(
			await db
				.select({ id: schema.patientImports.id })
				.from(schema.patientImports)
				.where(eq(schema.patientImports.createdBy, user.id)),
		).toHaveLength(0);
		expect(
			await db
				.select({ id: schema.patientImports.id })
				.from(schema.patientImports)
				.where(eq(schema.patientImports.source, source)),
		).toHaveLength(0);
		expect(
			await db
				.select({ id: schema.auditLog.id })
				.from(schema.auditLog)
				.where(
					and(
						eq(schema.auditLog.actorUserId, user.id),
						eq(schema.auditLog.action, "patient-import.create"),
					),
				),
		).toHaveLength(0);
	});
});

describe("createImport — OCR con proveedor", () => {
	beforeAll(async () => {
		process.env.ENABLE_PATIENT_OCR = "true";
		process.env.MINIMAX_API_KEY = "demo-minimax-token-DO-NOT-LOG-0123456789";
		process.env.MINIMAX_OCR_BASE_URL = "https://api.example.org/v1";
		const { vi } = await import("vitest");
		vi.resetModules();
		app = await loadApp();
	});
	afterAll(() => {
		delete process.env.ENABLE_PATIENT_OCR;
		delete process.env.MINIMAX_API_KEY;
		delete process.env.MINIMAX_OCR_BASE_URL;
	});

	it("image/jpeg + imageUrl → 202 sin filtrar URL", async () => {
		const { token } = await makeUserWithCaps(["patient:import"]);
		const res = await postImport(token, {
			contentType: "image/jpeg",
			source: "demo-ocr",
			imageUrl: IMAGE_URL,
		});
		expect(res.status).toBe(202);
		expect(res.body.import.status).toBe("queued");
		expect(JSON.stringify(res.body)).not.toContain(IMAGE_URL);
	});

	it("image/png sin imageUrl → 400", async () => {
		const { token } = await makeUserWithCaps(["patient:import"]);
		const res = await postImport(token, {
			contentType: "image/png",
			rows: [{ name: "Demo Anon" }],
		});
		expect(res.status).toBe(400);
	});

	it("PDF sigue 501; imageUrl en JSON → 400", async () => {
		const { token } = await makeUserWithCaps(["patient:import"]);
		expect(
			(await postImport(token, { contentType: "application/pdf", rows: demoRows }))
				.status,
		).toBe(501);
		expect(
			(
				await postImport(token, {
					contentType: "application/json",
					imageUrl: IMAGE_URL,
					rows: [{ name: "Demo" }],
				})
			).status,
		).toBe(400);
	});
});

describe("patient-imports — redacción HTTP", () => {
	beforeAll(async () => {
		app = await loadApp();
	});
	const DOCUMENT_DIGITS = "98765432";
	const DOCUMENT_ID = "V-98.765.432";
	const SENSITIVE_NOTES = "nota-confidencial-demo-xyz";
	const SENSITIVE_CONTACT = "contacto-demo-0001";

	async function freshHospital() {
		const { getDb, schema } = await import("@/db");
		const id = randomUUID();
		const name = `Hospital Redaccion ${id.slice(0, 8)}`;
		await getDb()
			.insert(schema.hospitals)
			.values({ id, name, createdAt: Date.now() });
		return { id, name };
	}

	it("GET /:id/rows redacta PII y documentHash en candidatos", async () => {
		const { createImport, processImport, applyImport } = await import(
			"@/services/patient-imports"
		);
		const { token } = await makeUserWithCaps(["patient:import"]);
		const hospital = await freshHospital();
		const first = await createImport(
			{
				source: "test",
				rows: [
					{
						name: "Alicia Demo",
						hospital: hospital.name,
						age: 41,
						documentId: DOCUMENT_ID,
					},
				],
			},
			null,
		);
		await processImport(first.id);
		await applyImport(first.id, null);
		const second = await createImport(
			{
				source: "test",
				rows: [
					{
						name: "Beatriz Otra",
						hospital: hospital.name,
						documentId: DOCUMENT_ID,
						notes: SENSITIVE_NOTES,
						contact: SENSITIVE_CONTACT,
					},
				],
			},
			null,
		);
		await processImport(second.id);
		const res = await request(app)
			.get(`/api/public/patient-imports/${second.id}/rows`)
			.set("Authorization", `Bearer ${token}`);
		const body = JSON.stringify(res.body);
		expect(body).not.toContain(SENSITIVE_NOTES);
		expect(body).not.toContain(SENSITIVE_CONTACT);
		expect(body).not.toContain(DOCUMENT_DIGITS);
		expect(body).not.toContain("documentHash");
	});

	it("GET /:id no filtra idempotency hash", async () => {
		const { token } = await makeUserWithCaps(["patient:import"]);
		const idemKey = `idem-demo-${randomUUID()}`;
		const created = await postImport(
			token,
			{ source: "test", rows: [{ name: "Carlos Demo", hospital: "Hospital Demo" }] },
			{ "Idempotency-Key": idemKey },
		);
		const res = await request(app)
			.get(`/api/public/patient-imports/${created.body.import.id}`)
			.set("Authorization", `Bearer ${token}`);
		const body = JSON.stringify(res.body);
		expect(body).not.toContain("idempotencyKeyHash");
		expect(body).not.toContain(idemKey);
		expect(body).not.toContain(createHash("sha256").update(idemKey).digest("hex"));
	});
});
