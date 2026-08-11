/**
 * Regresión del apply SIN transacciones interactivas (port a Workers): la
 * máquina de estados por fila debe REANUDAR tras un corte en cualquier punto
 * sin duplicar pacientes. Simula los dos cortes posibles:
 *
 *   A. claim hecho ('applying') pero paciente NO insertado
 *   B. claim hecho Y paciente insertado, pero la fila sin marcar
 *
 * En ambos casos, re-lanzar applyImport termina el trabajo y el paciente
 * existe EXACTAMENTE una vez (id determinista por fila).
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import "./helpers"; // fija env ANTES de cargar la app
import { and, eq, inArray } from "drizzle-orm";
import { ensureSeed } from "./helpers";
import { deterministicPatientId } from "@/services/patient-imports/apply";

let svc: typeof import("@/services/patient-imports");
let db: typeof import("@/db");

beforeAll(async () => {
	await ensureSeed();
	svc = await import("@/services/patient-imports");
	db = await import("@/db");
});

async function processedImportWithHospital(): Promise<{
	importId: string;
	hospitalId: string;
}> {
	const conn = db.getDb();
	const hospitalId = randomUUID();
	const hospitalName = `Hospital Resume ${hospitalId.slice(0, 8)}`;
	await conn.insert(db.schema.hospitals).values({
		id: hospitalId,
		name: hospitalName,
		facilityType: "hospital",
		state: "Estado Demo",
		municipality: "",
		address: "",
		priorityZone: "P2",
		createdAt: Date.now(),
	});
	const created = await svc.createImport(
		{
			source: "test-resume",
			rows: [
				{ name: `Demo Uno ${hospitalId.slice(0, 6)}`, hospital: hospitalName },
				{ name: `Demo Dos ${hospitalId.slice(0, 6)}`, hospital: hospitalName },
			],
		},
		null,
	);
	await svc.processImport(created.id);
	return { importId: created.id, hospitalId };
}

describe("applyImport reanudable (sin transacciones interactivas)", () => {
	it("reanuda un corte tras el claim (fila 'applying' sin paciente)", async () => {
		const { importId } = await processedImportWithHospital();
		const conn = db.getDb();
		const rows = await conn
			.select({ id: db.schema.patientImportRows.id })
			.from(db.schema.patientImportRows)
			.where(eq(db.schema.patientImportRows.importId, importId));

		// Simular corte A: la primera fila quedó reclamada pero sin paciente.
		await conn
			.update(db.schema.patientImportRows)
			.set({ rowStatus: "applying" })
			.where(eq(db.schema.patientImportRows.id, rows[0]!.id));
		// El header quedó 'applying' (corte a media aplicación).
		await conn
			.update(db.schema.patientImports)
			.set({ status: "applying" })
			.where(eq(db.schema.patientImports.id, importId));

		const summary = await svc.applyImport(importId, null);
		expect(summary.status).toBe("applied");
		expect(summary.counts.applied).toBe(2);
	});

	it("reanuda un corte tras el insert (paciente ya existe, fila sin marcar) sin duplicar", async () => {
		const { importId, hospitalId } = await processedImportWithHospital();
		const conn = db.getDb();
		const rows = await conn
			.select({
				id: db.schema.patientImportRows.id,
				name: db.schema.patientImportRows.name,
			})
			.from(db.schema.patientImportRows)
			.where(eq(db.schema.patientImportRows.importId, importId));
		const target = rows[0]!;
		const patientId = deterministicPatientId(target.id);

		// Simular corte B: paciente insertado con el id determinista, fila aún
		// 'applying' sin patientId.
		const now = Date.now();
		await conn.insert(db.schema.hospitalPatients).values({
			id: patientId,
			hospitalId,
			name: target.name ?? "Demo",
			condition: "unknown",
			status: "hospitalized",
			notes: "",
			contact: "",
			admittedAt: now,
			updatedAt: now,
		});
		await conn
			.update(db.schema.patientImportRows)
			.set({ rowStatus: "applying" })
			.where(eq(db.schema.patientImportRows.id, target.id));

		const summary = await svc.applyImport(importId, null);
		expect(summary.status).toBe("applied");
		expect(summary.counts.applied).toBe(2);

		// El paciente del corte existe EXACTAMENTE una vez.
		const patients = await conn
			.select({ id: db.schema.hospitalPatients.id })
			.from(db.schema.hospitalPatients)
			.where(eq(db.schema.hospitalPatients.id, patientId));
		expect(patients.length).toBe(1);

		// Y la fila quedó marcada con ese patientId.
		const marked = await conn
			.select({
				rowStatus: db.schema.patientImportRows.rowStatus,
				patientId: db.schema.patientImportRows.patientId,
			})
			.from(db.schema.patientImportRows)
			.where(eq(db.schema.patientImportRows.id, target.id));
		expect(marked[0]).toMatchObject({ rowStatus: "applied", patientId });
	});

	it("re-ejecutar applyImport completo es un no-op estable", async () => {
		const { importId } = await processedImportWithHospital();
		const first = await svc.applyImport(importId, null);
		const second = await svc.applyImport(importId, null);
		expect(first.counts.applied).toBe(2);
		expect(second.counts.applied).toBe(2);
		const conn = db.getDb();
		const applied = await conn
			.select({ id: db.schema.patientImportRows.id })
			.from(db.schema.patientImportRows)
			.where(
				and(
					eq(db.schema.patientImportRows.importId, importId),
					inArray(db.schema.patientImportRows.rowStatus, ["applied"]),
				),
			);
		expect(applied.length).toBe(2);
	});
});
