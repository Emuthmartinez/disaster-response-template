/**
 * Pruebas del parseo PURO de payloads CSV/XLSX (#151, Fase 4). Sin DB: cubren
 * el CSV (RFC4180-ish, delimitadores, comillas), el lector XLSX mínimo (ZIP +
 * sharedStrings + inline) y el mapeo de cabecera por alias (ES/EN). Las fixtures
 * XLSX se construyen aquí sin dependencia (zlib nativo) para no acoplar el test a
 * ninguna librería. Datos 100% sintéticos/anónimos.
 */
import { describe, expect, it } from "vitest";

import {
  ImportParseError,
  MAX_IMPORT_ROWS,
  isOcrPendingContentType,
  parseDelimited,
  parseImportFile,
  parseXlsxBuffer,
  tableToRows,
  CONTENT_TYPE,
} from "@/services/patient-import-parse";
import {
  buildXlsxCorruptDeflate,
  buildXlsxFromRows,
  buildXlsxInline,
  buildXlsxShared,
} from "./xlsx-fixture";

// --------------------------------------------------------------------------
// CSV
// --------------------------------------------------------------------------

describe("parseDelimited (CSV)", () => {
  it("parsea filas separadas por coma", () => {
    expect(parseDelimited("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("respeta comillas con coma y salto de línea embebidos", () => {
    const csv = 'name,notes\n"Doe, Jane","line1\nline2"';
    expect(parseDelimited(csv)).toEqual([
      ["name", "notes"],
      ["Doe, Jane", "line1\nline2"],
    ]);
  });

  it('escapa comillas dobles ("")', () => {
    expect(parseDelimited('a\n"she said ""hi"""')).toEqual([["a"], ['she said "hi"']]);
  });

  it("detecta el delimitador punto y coma", () => {
    expect(parseDelimited("a;b;c\n1;2;3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("detecta el delimitador tabulador (TSV de export hospitalario)", () => {
    // `sniffDelimiter` también soporta `\t`: un export tabular pegado como TSV
    // debe separarse por columnas, no quedar como una sola celda. Solo `,` y `;`
    // estaban cubiertos; el camino del tabulador era código sin regresión.
    expect(parseDelimited("a\tb\tc\n1\t2\t3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("descarta el BOM y normaliza CRLF", () => {
    expect(parseDelimited("﻿a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

// --------------------------------------------------------------------------
// Mapeo de cabecera (alias) → RawPatientRow
// --------------------------------------------------------------------------

describe("tableToRows — mapeo de cabecera por alias", () => {
  it("mapea cabeceras EN y ES al campo canónico", () => {
    const rows = tableToRows([
      ["name", "hospital", "age", "condition", "status", "documentId", "notes", "contact"],
      ["Demo Uno", "Hospital Demo", "33", "stable", "hospitalized", "0001-X", "obs", "n/a"],
    ]);
    expect(rows).toEqual([
      {
        name: "Demo Uno",
        hospital: "Hospital Demo",
        age: "33",
        condition: "stable",
        status: "hospitalized",
        documentId: "0001-X",
        notes: "obs",
        contact: "n/a",
      },
    ]);
  });

  it("reconoce aliases en español y variantes con espacios/underscore", () => {
    const rows = tableToRows([
      ["Nombre", "Hospital ID", "Edad", "Estado", "Documento"],
      ["Demo Dos", "h-123", "40", "alta", "12345678"],
    ]);
    expect(rows[0]).toEqual({
      name: "Demo Dos",
      hospitalId: "h-123",
      age: "40",
      status: "alta",
      documentId: "12345678",
    });
  });

  it("mapea cabeceras en español CON acentos (Condición/Teléfono/Cédula/Observaciones)", () => {
    // Caso real: los archivos de hospital traen cabeceras acentuadas. `headerKey`
    // baja a minúsculas y quita acentos ANTES de buscar el alias, así "Condición"
    // colapsa a "condicion" → "condition", etc. Sin esto, un CSV/XLSX real perdería
    // estas columnas al pasarlas como encabezado crudo en vez de al campo canónico.
    const rows = tableToRows([
      ["Nombre", "Hospital", "Condición", "Teléfono", "Cédula", "Observaciones"],
      ["Demo Cuatro", "Hospital Demo", "estable", "n/a", "0001-X", "obs demo"],
    ]);
    expect(rows[0]).toEqual({
      name: "Demo Cuatro",
      hospital: "Hospital Demo",
      condition: "estable",
      contact: "n/a",
      documentId: "0001-X",
      notes: "obs demo",
    });
  });

  it("conserva columnas desconocidas bajo su encabezado crudo (passthrough)", () => {
    const rows = tableToRows([
      ["name", "hospital", "triage"],
      ["Demo Tres", "Hospital Demo", "verde"],
    ]);
    expect(rows[0]).toMatchObject({ name: "Demo Tres", hospital: "Hospital Demo", triage: "verde" });
  });

  it("omite filas totalmente vacías y celdas vacías", () => {
    const rows = tableToRows([
      ["name", "hospital"],
      ["Demo", "Hospital Demo"],
      ["", ""],
    ]);
    expect(rows).toHaveLength(1);
  });

  it("falla a NIVEL DE LOTE si solo hay cabecera (sin filas de datos)", () => {
    expect(() => tableToRows([["name", "hospital"]])).toThrow(ImportParseError);
  });
});

// --------------------------------------------------------------------------
// XLSX
// --------------------------------------------------------------------------

describe("parseXlsxBuffer (XLSX mínimo)", () => {
  const grid = [
    ["name", "hospital", "age"],
    ["Demo Anon", "Hospital Demo", "45"],
    ["Otro Demo", "Hospital Demo", "30"],
  ];

  it("lee celdas vía sharedStrings (t=\"s\")", () => {
    expect(parseXlsxBuffer(buildXlsxShared(grid))).toEqual(grid);
  });

  it("lee celdas inline (t=\"inlineStr\")", () => {
    expect(parseXlsxBuffer(buildXlsxInline(grid))).toEqual(grid);
  });

  it("lee celdas numéricas (<v> sin t=\"s\"/inlineStr): la edad va como número en Excel", () => {
    // Un XLSX real guarda la edad como celda NUMÉRICA: `<c><v>45</v></c>` sin
    // atributo `t`. El lector debe tomar el `<v>` crudo (no es índice de
    // sharedStrings). Las fixtures de string no ejercitan este camino.
    const buf = buildXlsxFromRows(
      `<row r="1"><c r="A1" t="inlineStr"><is><t>age</t></is></c></row>` +
        `<row r="2"><c r="A2"><v>45</v></c></row>`,
    );
    expect(parseXlsxBuffer(buf)).toEqual([["age"], ["45"]]);
  });

  it("decodifica entidades XML del contenido de las celdas (& embebido)", () => {
    // sharedStrings escapa `&` como `&amp;`; el lector debe decodificarlo de vuelta
    // para no entregar la entidad cruda al pipeline.
    expect(parseXlsxBuffer(buildXlsxShared([["a & b", "c"]]))).toEqual([["a & b", "c"]]);
  });

  it("decodifica entidades XML numéricas del contenido (decimal y hex)", () => {
    // Un XLSX real puede traer caracteres acentuados escapados como entidades
    // numéricas (`&#233;` → "é", `&#xef;` → "ï"), no solo nombradas (`&amp;`). El
    // lector debe decodificarlas o entregaría la entidad cruda al pipeline. Solo el
    // camino nombrado estaba cubierto; el numérico era código sin regresión.
    const buf = buildXlsxFromRows(
      `<row r="1"><c r="A1" t="inlineStr"><is><t>caf&#233;</t></is></c>` +
        `<c r="B1" t="inlineStr"><is><t>na&#xef;ve</t></is></c></row>`,
    );
    expect(parseXlsxBuffer(buf)).toEqual([["café", "naïve"]]);
  });

  it("rechaza bytes que no son un ZIP/XLSX válido", () => {
    expect(() => parseXlsxBuffer(Buffer.from("no soy un xlsx"))).toThrow(ImportParseError);
  });

  it("rechaza una referencia de celda fuera de rango (DoS por columna dispersa)", () => {
    // `ZZZZZ1` decodifica a un índice de columna enorme. Sin la cota, el lector
    // crearía un array disperso gigante y lo materializaría (OOM). Debe fallar
    // rápido a NIVEL DE LOTE sin intentar reservar la grilla.
    const buf = buildXlsxFromRows(
      `<row r="1"><c r="ZZZZZ1" t="inlineStr"><is><t>boom</t></is></c></row>`,
    );
    expect(() => parseXlsxBuffer(buf)).toThrow(ImportParseError);
  });

  it("acepta una columna alta pero válida (AB12)", () => {
    // Columna AB (índice 27) está muy por debajo de la cota; debe parsear bien.
    const buf = buildXlsxFromRows(
      `<row r="12"><c r="AB12" t="inlineStr"><is><t>ok</t></is></c></row>`,
    );
    const grid = parseXlsxBuffer(buf);
    expect(grid).toHaveLength(1);
    expect(grid[0]![27]).toBe("ok");
  });

  it("falla en el parseo si excede el máximo de filas (no materializa toda la grilla)", () => {
    const rowsXml = Array.from(
      { length: MAX_IMPORT_ROWS + 2 },
      (_, r) => `<row r="${r + 1}"><c r="A${r + 1}" t="inlineStr"><is><t>x</t></is></c></row>`,
    ).join("");
    expect(() => parseXlsxBuffer(buildXlsxFromRows(rowsXml))).toThrow(ImportParseError);
  });

  it("falla si excede el presupuesto de celdas (área filas × ancho, sin OOM)", () => {
    // Cada fila lleva UNA celda en XFD (índice 16383, columna VÁLIDA < 16384), pero
    // al rellenar huecos densifica `cells.length` a 16384. Pocas filas (~20) suman
    // >200k slots: ni la cota de columna ni la de filas lo atrapan. Debe cortar a
    // NIVEL DE LOTE por la cota de ÁREA total, sin materializar millones de slots.
    const rowsXml = Array.from(
      { length: 20 },
      (_, r) => `<row r="${r + 1}"><c r="XFD${r + 1}" t="inlineStr"><is><t>x</t></is></c></row>`,
    ).join("");
    expect(() => parseXlsxBuffer(buildXlsxFromRows(rowsXml))).toThrow(ImportParseError);
  });

  it("remapea deflate corrupto a ImportParseError (no propaga error de zlib)", () => {
    // ZIP con EOCD + cabeceras central/local válidas pero datos deflate corruptos:
    // `inflateRawSync` lanza un error de zlib que NO debe escapar como 500.
    const buf = buildXlsxCorruptDeflate();
    expect(() => parseXlsxBuffer(buf)).toThrow(ImportParseError);
    expect(() => parseImportFile(CONTENT_TYPE.XLSX, buf.toString("base64"))).toThrow(
      ImportParseError,
    );
  });
});

// --------------------------------------------------------------------------
// parseImportFile (entrada pública con base64)
// --------------------------------------------------------------------------

describe("parseImportFile", () => {
  it("CSV base64 → RawPatientRow[]", () => {
    const csv = "name,hospital\nDemo Anon,Hospital Demo";
    const rows = parseImportFile(CONTENT_TYPE.CSV, Buffer.from(csv, "utf8").toString("base64"));
    expect(rows).toEqual([{ name: "Demo Anon", hospital: "Hospital Demo" }]);
  });

  it("XLSX base64 → RawPatientRow[]", () => {
    const xlsx = buildXlsxShared([
      ["name", "hospital"],
      ["Demo Anon", "Hospital Demo"],
    ]);
    const rows = parseImportFile(CONTENT_TYPE.XLSX, xlsx.toString("base64"));
    expect(rows).toEqual([{ name: "Demo Anon", hospital: "Hospital Demo" }]);
  });

  it("rechaza base64 inválido", () => {
    expect(() => parseImportFile(CONTENT_TYPE.CSV, "!!!no-base64!!!")).toThrow(ImportParseError);
  });

  it("rechaza un CSV sin filas de datos", () => {
    const csv = "name,hospital";
    expect(() => parseImportFile(CONTENT_TYPE.CSV, Buffer.from(csv).toString("base64"))).toThrow(
      ImportParseError,
    );
  });

  it("respeta el tope de filas del lote", () => {
    const header = "name,hospital\n";
    const body = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `Demo ${i},Hospital Demo`).join(
      "\n",
    );
    expect(() =>
      parseImportFile(CONTENT_TYPE.CSV, Buffer.from(header + body).toString("base64")),
    ).toThrow(ImportParseError);
  });
});

// --------------------------------------------------------------------------
// isOcrPendingContentType (predicado OCR/ICR — imagen/PDF)
// --------------------------------------------------------------------------

describe("isOcrPendingContentType", () => {
  it("reconoce application/pdf como OCR-pendiente", () => {
    expect(isOcrPendingContentType("application/pdf")).toBe(true);
  });

  it("reconoce image/png como OCR-pendiente", () => {
    expect(isOcrPendingContentType("image/png")).toBe(true);
  });

  it("reconoce image/jpeg como OCR-pendiente", () => {
    expect(isOcrPendingContentType("image/jpeg")).toBe(true);
  });

  it("es case-insensitive (IMAGE/PNG)", () => {
    expect(isOcrPendingContentType("IMAGE/PNG")).toBe(true);
  });

  it("ignora espacios alrededor (padded)", () => {
    expect(isOcrPendingContentType("  application/pdf  ")).toBe(true);
  });

  it("NO marca text/csv", () => {
    expect(isOcrPendingContentType("text/csv")).toBe(false);
  });

  it("NO marca application/json", () => {
    expect(isOcrPendingContentType("application/json")).toBe(false);
  });

  it("NO marca el XLSX soportado", () => {
    expect(isOcrPendingContentType(CONTENT_TYPE.XLSX)).toBe(false);
  });

  it("NO marca un tipo arbitrario no-OCR (application/zip)", () => {
    expect(isOcrPendingContentType("application/zip")).toBe(false);
  });
});
