/**
 * Pruebas de la lógica PURA de importación de pacientes (#151). Sin DB: cubren
 * normalización, validación y la POLÍTICA de deduplicación (qué es duplicado,
 * qué necesita revisión, qué es único) para dejar el comportamiento explícito.
 */
import { describe, expect, it } from "vitest";
import {
  classifyDedup,
  documentDigits,
  hashDocumentDigits,
  hospitalNameKey,
  mapCondition,
  mapStatus,
  nameKey,
  normalizeAge,
  normalizeName,
  normalizeRow,
  resolveHospitalAlias,
  validateRow,
  type DedupCandidate,
  type NormalizedRow,
} from "@/services/patient-import-logic";

describe("normalización", () => {
  it("normalizeName colapsa espacios y recorta", () => {
    expect(normalizeName("  José   Pérez  ")).toBe("José Pérez");
    expect(normalizeName(undefined)).toBe("");
  });

  it("nameKey es minúscula, sin acentos ni signos (clave de bloqueo)", () => {
    expect(nameKey("José Pérez!")).toBe("jose perez");
    expect(nameKey("MARÍA  José")).toBe("maria jose");
    expect(nameKey("")).toBe("");
  });

  it("normalizeAge acota 0..150 y rechaza basura", () => {
    expect(normalizeAge("33")).toBe(33);
    expect(normalizeAge(40.9)).toBe(40);
    expect(normalizeAge(-1)).toBeNull();
    expect(normalizeAge(999)).toBeNull();
    expect(normalizeAge("abc")).toBeNull();
    expect(normalizeAge(null)).toBeNull();
  });

  it("documentDigits extrae dígitos y descarta señales cortas", () => {
    expect(documentDigits("V-12.345.678")).toBe("12345678");
    expect(documentDigits("12")).toBeNull();
    expect(documentDigits(undefined)).toBeNull();
  });

  it("mapCondition/mapStatus mapean sinónimos ES/EN y avisan lo desconocido", () => {
    expect(mapCondition("grave").value).toBe("serious");
    expect(mapCondition("CRÍTICO").value).toBe("critical");
    expect(mapCondition("xyz")).toMatchObject({ value: "unknown" });
    expect(mapCondition("xyz").warning).toBeDefined();

    expect(mapStatus("ingresado").value).toBe("hospitalized");
    expect(mapStatus("en refugio").value).toBe("sheltered");
    expect(mapStatus("sheltered").value).toBe("sheltered");
    expect(mapStatus("dado de alta").value).toBe("discharged");
    expect(mapStatus("fallecido").value).toBe("deceased");
    expect(mapStatus("???").value).toBe("hospitalized");
  });

  it("normalizeRow saca el documento a dígitos y conserva los avisos", () => {
    const row = normalizeRow({
      name: "  Ana  Díaz ",
      age: "x",
      condition: "estable",
      status: "raro",
      hospital: "Hospital Central",
      documentId: "V-9.876.543",
    });
    expect(row.name).toBe("Ana Díaz");
    expect(row.normalizedKey).toBe("ana diaz");
    expect(row.age).toBeNull();
    expect(row.condition).toBe("stable");
    expect(row.status).toBe("hospitalized");
    expect(row.documentDigits).toBe("9876543");
    // El HMAC se calcula en la orquestación (necesita el secreto): aquí null.
    expect(row.documentHash).toBeNull();
    expect(row.warnings.length).toBe(1); // estado "raro"
  });
});

describe("HMAC de documento (B4/Q4)", () => {
  const secret = "unit-test-secret-0123456789-abcdef";

  it("es determinista para los mismos (dígitos, secreto)", () => {
    expect(hashDocumentDigits("9876543", secret)).toBe(hashDocumentDigits("9876543", secret));
  });

  it("no expone los dígitos crudos y cambia con el secreto", () => {
    const h = hashDocumentDigits("9876543", secret);
    expect(h).not.toContain("9876543");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashDocumentDigits("9876543", "otro-secreto")).not.toBe(h);
  });
});

describe("normalización y alias de hospital (B2/Q3)", () => {
  it("hospitalNameKey baja, quita acentos y colapsa", () => {
    expect(hospitalNameKey("Hosp. Central")).toBe("hosp central");
    expect(hospitalNameKey("  CLÍNICA   Demo ")).toBe("clinica demo");
    expect(hospitalNameKey("")).toBe("");
  });

  it("resolveHospitalAlias devuelve null sin alias curados (mapa vacío por defecto)", () => {
    expect(resolveHospitalAlias("Hospital Central")).toBeNull();
    expect(resolveHospitalAlias(undefined)).toBeNull();
  });
});

describe("validación de identidad mínima", () => {
  const base: NormalizedRow = {
    name: "Ana Díaz",
    normalizedKey: "ana diaz",
    age: 30,
    condition: "stable",
    status: "hospitalized",
    sourceHospital: "Hospital Central",
    hospitalIdHint: null,
    documentDigits: null,
    documentHash: null,
    notes: "",
    contact: "",
    warnings: [],
  };

  it("acepta una fila con nombre y hospital resuelto", () => {
    const v = validateRow(base, true);
    expect(v.errors).toEqual([]);
    expect(v.hospitalUnresolved).toBe(false);
  });

  it("rechaza sin nombre", () => {
    expect(validateRow({ ...base, name: "" }, true).errors).toContain(
      "Falta el nombre del paciente.",
    );
  });

  it("hospital con texto pero no resuelto → no es error, es revisión (no se descarta)", () => {
    const v = validateRow(base, false);
    expect(v.errors).toEqual([]);
    expect(v.hospitalUnresolved).toBe(true);
  });

  it("hospital totalmente ausente → error (invalid)", () => {
    const v = validateRow({ ...base, sourceHospital: "", hospitalIdHint: null }, false);
    expect(v.errors).toContain("Falta el hospital (texto o id resoluble).");
    expect(v.hospitalUnresolved).toBe(false);
  });
});

describe("clasificación de deduplicación", () => {
  const row: NormalizedRow = {
    name: "Ana Díaz",
    normalizedKey: "ana diaz",
    age: 30,
    condition: "stable",
    status: "hospitalized",
    sourceHospital: "Hospital Central",
    hospitalIdHint: null,
    documentDigits: "9876543",
    documentHash: "hash-9876543",
    notes: "",
    contact: "",
    warnings: [],
  };

  it("sin candidatos → único", () => {
    expect(classifyDedup(row, []).status).toBe("unique");
  });

  it("document_hash exacto → duplicado (confianza 1), aunque difieran nombre/edad", () => {
    const cand: DedupCandidate = {
      patientId: "p1",
      name: "Otra Persona",
      age: 99,
      documentHash: "hash-9876543",
    };
    const v = classifyDedup(row, [cand]);
    expect(v.status).toBe("duplicate");
    expect(v.confidence).toBe(1);
  });

  it("mismo nombre + edad conocida igual → duplicado", () => {
    const cand: DedupCandidate = { patientId: "p1", name: "Ana Diaz", age: 30, documentHash: null };
    const v = classifyDedup({ ...row, documentHash: null }, [cand]);
    expect(v.status).toBe("duplicate");
    expect(v.confidence).toBe(0.9);
  });

  it("mismo nombre, edad desconocida (un lado nulo) → needs_review, NO duplicado (B1/Q2)", () => {
    const candNullAge: DedupCandidate = { patientId: "p1", name: "Ana Diaz", age: null, documentHash: null };
    expect(classifyDedup({ ...row, documentHash: null }, [candNullAge]).status).toBe("needs_review");

    const rowNullAge: DedupCandidate = { patientId: "p2", name: "Ana Diaz", age: 30, documentHash: null };
    expect(
      classifyDedup({ ...row, age: null, documentHash: null }, [rowNullAge]).status,
    ).toBe("needs_review");
  });

  it("edad desconocida pero document_hash exacto → sigue siendo duplicado", () => {
    const cand: DedupCandidate = {
      patientId: "p1",
      name: "Ana Diaz",
      age: null,
      documentHash: "hash-9876543",
    };
    expect(classifyDedup({ ...row, age: null }, [cand]).status).toBe("duplicate");
  });

  it("mismo nombre, edad conocida incompatible → needs_review", () => {
    const cand: DedupCandidate = { patientId: "p1", name: "Ana Diaz", age: 70, documentHash: null };
    const v = classifyDedup({ ...row, documentHash: null }, [cand]);
    expect(v.status).toBe("needs_review");
  });
});
