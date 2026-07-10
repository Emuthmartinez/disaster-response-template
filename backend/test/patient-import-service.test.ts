import { randomUUID } from "crypto";
import { beforeAll, describe, expect, it } from "vitest";
import "./helpers";
import request from "supertest";
import { makeUserWithCaps } from "./helpers";

let svc: typeof import("@/services/patient-imports");
let db: typeof import("@/db");
let app: import("express").Express;

beforeAll(async () => {
	svc = await import("@/services/patient-imports");
	db = await import("@/db");
	app = (await import("@/server")).app;
});

async function pendingImport(source = "test") {
	return svc.createImport(
		{ source, rows: [{ name: "Demo Anon", hospital: "Hospital Demo" }] },
		null,
	);
}

async function setImportStatus(
	id: string,
	status: string,
	failedStage: string | null = null,
) {
	const { eq } = await import("drizzle-orm");
	await db
		.getDb()
		.update(db.schema.patientImports)
		.set({ status, failedStage, updatedAt: Date.now() })
		.where(eq(db.schema.patientImports.id, id));
}

describe("patient imports — cola y estados", () => {
	it("markImportQueued avanza pending→queued", async () => {
		const imp = await pendingImport();
		await svc.markImportQueued(imp.id, "job-d4-1");
		const after = await svc.getImport(imp.id);
		expect(after?.status).toBe("queued");
		expect(after?.jobId).toBe("job-d4-1");
	});

	it("markImportQueued no pisa processing", async () => {
		const imp = await pendingImport();
		await setImportStatus(imp.id, "processing");
		await svc.markImportQueued(imp.id, "job-d4-2");
		const after = await svc.getImport(imp.id);
		expect(after?.status).toBe("processing");
		expect(after?.jobId).toBe("job-d4-2");
	});

	it("markImportFailed evita lote huérfano", async () => {
		const imp = await pendingImport();
		await svc.markImportFailed(imp.id, "No se pudo encolar el procesamiento.");
		const after = await svc.getImport(imp.id);
		expect(after?.status).toBe("failed");
	});

	it("no aplica pending ni reprocesa applied", async () => {
		const imp = await pendingImport();
		await expect(svc.applyImport(imp.id, null)).rejects.toThrow(/pending/);
		await setImportStatus(imp.id, "applied");
		await expect(svc.processImport(imp.id)).rejects.toThrow(/applied/);
	});

	it("reanuda solo failed de etapa apply", async () => {
		const applyFailed = await pendingImport("transition-test");
		await setImportStatus(applyFailed.id, "failed", "apply");
		await expect(svc.applyImport(applyFailed.id, null)).resolves.toMatchObject({
			status: "applied",
		});
		const processFailed = await pendingImport("transition-test");
		await setImportStatus(processFailed.id, "failed", "process");
		await expect(svc.applyImport(processFailed.id, null)).rejects.toThrow(
			/fallido durante la etapa "apply"/,
		);
	});

	it("reanuda processing y failed de etapa process", async () => {
		const processing = await pendingImport("resume-process");
		await setImportStatus(processing.id, "processing");
		await expect(svc.processImport(processing.id)).resolves.toMatchObject({
			status: "processed",
		});

		const failed = await pendingImport("resume-process");
		await setImportStatus(failed.id, "failed", "process");
		await expect(svc.processImport(failed.id)).resolves.toMatchObject({
			status: "processed",
		});
	});
});

describe("proyección pública de pacientes", () => {
	it("omite notas y conserva el DTO completo en la API autenticada", async () => {
		const conn = db.getDb();
		const hospitalId = randomUUID();
		const patientName = `Paciente Refugio ${hospitalId.slice(0, 8)}`;
		await conn.insert(db.schema.hospitals).values({
			id: hospitalId,
			name: `Refugio Demo ${hospitalId.slice(0, 8)}`,
			facilityType: "refugio",
			createdAt: Date.now(),
		});

		const created = await request(app)
			.post(`/api/hospitals/${hospitalId}/patients`)
			.send({
				name: patientName,
				status: "sheltered",
				notes: "nota restringida demo",
				contact: "contacto público demo",
			});
		expect(created.status).toBe(201);
		expect(created.body.patient).not.toHaveProperty("notes");

		const list = await request(app).get(`/api/hospitals/${hospitalId}/patients`);
		expect(list.headers.etag).toBeTruthy();
		expect(list.body.patients[0]).not.toHaveProperty("notes");

		const reader = await makeUserWithCaps(["patient:read"]);
		const authenticated = await request(app)
			.get(`/api/public/patients/${created.body.patient.id}`)
			.set("Authorization", `Bearer ${reader.token}`);
		expect(authenticated.status).toBe(200);
		expect(authenticated.body.item.notes).toBe("nota restringida demo");
	});
});

describe("applyImport", () => {
	it("no propaga notas crudas al paciente final", async () => {
		const { eq } = await import("drizzle-orm");
		const conn = db.getDb();
		const hospitalId = randomUUID();
		const hospitalName = `Hospital Demo ${hospitalId.slice(0, 8)}`;
		await conn.insert(db.schema.hospitals).values({
			id: hospitalId,
			name: hospitalName,
			createdAt: Date.now(),
		});
		const patientName = `Paciente Demo ${hospitalId.slice(0, 8)}`;
		const sensitiveNote = "CI V-0.000.000 (demo), diagnóstico confidencial demo";
		const created = await svc.createImport(
			{
				source: "test",
				rows: [
					{ name: patientName, hospital: hospitalName, age: 30, notes: sensitiveNote },
				],
			},
			null,
		);
		await svc.processImport(created.id);
		await svc.applyImport(created.id, null);
		const res = await request(app)
			.get("/api/patients/search")
			.query({ q: patientName, limit: 50 });
		const match = res.body.results.find(
			(r: { patient: { name: string; notes: string } }) =>
				r.patient.name === patientName,
		);
		expect(match?.patient).not.toHaveProperty("notes");
		const rows = await conn
			.select({ rawData: db.schema.patientImportRows.rawData })
			.from(db.schema.patientImportRows)
			.where(eq(db.schema.patientImportRows.importId, created.id));
		expect(JSON.stringify(rows[0]?.rawData)).toContain("confidencial");
	});

	it("reanuda desde applying sin duplicar", async () => {
		const { eq, sql } = await import("drizzle-orm");
		const conn = db.getDb();
		const hospitalId = randomUUID();
		const hospitalName = `Hospital Resume ${hospitalId.slice(0, 8)}`;
		await conn.insert(db.schema.hospitals).values({
			id: hospitalId,
			name: hospitalName,
			createdAt: Date.now(),
		});
		const tag = hospitalId.slice(0, 8);
		const imp = await svc.createImport(
			{
				source: "test",
				rows: [
					{ name: `Uno ${tag}`, hospital: hospitalName },
					{ name: `Dos ${tag}`, hospital: hospitalName },
				],
			},
			null,
		);
		await svc.processImport(imp.id);
		const rows = await svc.listImportRows(imp.id);
		const now = Date.now();
		const prePatientId = randomUUID();
		await conn.execute(sql`
      insert into hospital_patients
        (id, hospital_id, name, age, condition, status, notes, contact, admitted_at, updated_at)
      values
        (${prePatientId}, ${hospitalId}, ${rows[0]!.name}, null, 'unknown', 'hospitalized', '', '', ${now}, ${now})
    `);
		await conn
			.update(db.schema.patientImportRows)
			.set({ patientId: prePatientId, rowStatus: "applied", updatedAt: now })
			.where(eq(db.schema.patientImportRows.id, rows[0]!.id));
		await conn
			.update(db.schema.patientImports)
			.set({ status: "applying", updatedAt: now })
			.where(eq(db.schema.patientImports.id, imp.id));
		const summary = await svc.applyImport(imp.id, null);
		expect(summary.status).toBe("applied");
	});

	it("dos apply concurrentes no duplican paciente", async () => {
		const { eq } = await import("drizzle-orm");
		const hospitalId = randomUUID();
		const suffix = hospitalId.slice(0, 8);
		const hospitalName = `Hospital Atomic ${suffix}`;
		const patientName = `Paciente Atomic ${suffix}`;
		await db.getDb().insert(db.schema.hospitals).values({
			id: hospitalId,
			name: hospitalName,
			createdAt: Date.now(),
		});
		const created = await svc.createImport(
			{
				source: "atomic-test",
				rows: [{ name: patientName, hospital: hospitalName, age: 34 }],
			},
			null,
		);
		await svc.processImport(created.id);
		await Promise.allSettled([
			svc.applyImport(created.id, null),
			svc.applyImport(created.id, null),
		]);
		const patients = await db
			.getDb()
			.select({ id: db.schema.hospitalPatients.id })
			.from(db.schema.hospitalPatients)
			.where(eq(db.schema.hospitalPatients.name, patientName));
		expect(patients).toHaveLength(1);
	});
});

describe("purgeAppliedRawData", () => {
	it("dry-run no borra; confirm purga solo applied", async () => {
		const { eq } = await import("drizzle-orm");
		const conn = db.getDb();
		const hospitalId = randomUUID();
		const hospitalName = `Hospital Purge ${hospitalId.slice(0, 8)}`;
		await conn.insert(db.schema.hospitals).values({
			id: hospitalId,
			name: hospitalName,
			createdAt: Date.now(),
		});
		const applied = await svc.createImport(
			{
				source: "test",
				rows: [
					{
						name: `Pac ${hospitalId.slice(0, 8)}`,
						hospital: hospitalName,
						notes: "dato sensible demo",
					},
				],
			},
			null,
		);
		await svc.processImport(applied.id);
		await svc.applyImport(applied.id, null);
		await conn
			.update(db.schema.patientImports)
			.set({ appliedAt: Date.now() - 60_000 })
			.where(eq(db.schema.patientImports.id, applied.id));
		const pending = await svc.createImport(
			{ source: "test", rows: [{ name: "Pendiente Demo", hospital: "Sin Resolver" }] },
			null,
		);
		const dry = await svc.purgeAppliedRawData({
			olderThanMs: 1000,
			confirm: false,
		});
		expect(dry.purged).toBe(0);
		const run = await svc.purgeAppliedRawData({
			olderThanMs: 1000,
			confirm: true,
		});
		expect(run.purged).toBeGreaterThanOrEqual(1);
		const rowOf = async (importId: string) =>
			(
				await conn
					.select({ raw: db.schema.patientImportRows.rawData })
					.from(db.schema.patientImportRows)
					.where(eq(db.schema.patientImportRows.importId, importId))
			)[0];
		const appliedRow = await rowOf(applied.id);
		expect(appliedRow?.raw).toEqual({});
		const pendingRow = await rowOf(pending.id);
		expect(JSON.stringify(pendingRow?.raw)).toContain("Pendiente");
	});

	it("rechaza olderThanMs inválido", async () => {
		await expect(
			svc.purgeAppliedRawData({ olderThanMs: -1, confirm: true }),
		).rejects.toThrow();
	});
});
