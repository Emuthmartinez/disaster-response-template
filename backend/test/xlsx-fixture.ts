/**
 * Constructor mínimo de fixtures XLSX (ZIP de XML) para tests, SIN dependencias
 * (solo `zlib` nativo). Genera libros tabulares sintéticos que ejercitan el
 * lector `parseXlsxBuffer` por sus dos caminos: sharedStrings (t="s", el de Excel
 * real) e inline strings (t="inlineStr"). No es un escritor XLSX general; solo
 * produce lo que el lector mínimo necesita. Datos 100% sintéticos.
 */
import { deflateRawSync } from "zlib";

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function colLetter(c: number): string {
  let n = c + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

interface ZipFile {
  name: string;
  data: Buffer;
  // Bytes "comprimidos" a escribir tal cual (override). Si se omite, se deflata
  // `data`. Permite inyectar datos DEFLATE corruptos manteniendo cabeceras ZIP
  // válidas. `data.length` sigue siendo el uncompSize declarado.
  comp?: Buffer;
}

function buildZip(files: ZipFile[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const nameBuf = Buffer.from(f.name, "utf8");
    const comp = f.comp ?? deflateRawSync(f.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8); // método deflate
    local.writeUInt32LE(0, 14); // crc (el lector lo ignora)
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const localEntry = Buffer.concat([local, nameBuf, comp]);
    locals.push(localEntry);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(f.data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([central, nameBuf]));
    offset += localEntry.length;
  }
  const localBlob = Buffer.concat(locals);
  const centralBlob = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBlob.length, 12);
  eocd.writeUInt32LE(localBlob.length, 16);
  return Buffer.concat([localBlob, centralBlob, eocd]);
}

/** Construye un .xlsx con sharedStrings (camino t="s", el de Excel real). */
export function buildXlsxShared(grid: string[][]): Buffer {
  const dict = new Map<string, number>();
  const order: string[] = [];
  const idx = (s: string): number => {
    let i = dict.get(s);
    if (i === undefined) {
      i = order.length;
      dict.set(s, i);
      order.push(s);
    }
    return i;
  };
  const rowsXml = grid
    .map((row, r) => {
      const cells = row
        .map((val, c) => `<c r="${colLetter(c)}${r + 1}" t="s"><v>${idx(val)}</v></c>`)
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  const sheet = `<?xml version="1.0"?><worksheet><sheetData>${rowsXml}</sheetData></worksheet>`;
  const sst = `<?xml version="1.0"?><sst>${order
    .map((s) => `<si><t xml:space="preserve">${xmlEscape(s)}</t></si>`)
    .join("")}</sst>`;
  return buildZip([
    { name: "xl/worksheets/sheet1.xml", data: Buffer.from(sheet, "utf8") },
    { name: "xl/sharedStrings.xml", data: Buffer.from(sst, "utf8") },
  ]);
}

/**
 * Construye un .xlsx con cabeceras ZIP VÁLIDAS (EOCD + central + local, método
 * deflate) pero con datos DEFLATE CORRUPTOS en la hoja: el índice ZIP parsea sin
 * problema y recién `inflateRawSync` falla con un error de zlib. Ejercita que ese
 * error inesperado se remapee a `ImportParseError` (→ 400) en vez de un 500.
 */
export function buildXlsxCorruptDeflate(): Buffer {
  // uncompSize declarado pequeño (no dispara cotas); el comp son bytes basura que
  // NO son un stream deflate válido, así que la inflación revienta.
  const declaredUncompressed = Buffer.alloc(64);
  const garbageDeflate = Buffer.from([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
  return buildZip([
    { name: "xl/worksheets/sheet1.xml", data: declaredUncompressed, comp: garbageDeflate },
  ]);
}

/**
 * Construye un .xlsx envolviendo `<row>`s crudos en una sola hoja. Permite a los
 * tests inyectar referencias de celda arbitrarias (p.ej. `ZZZZZ1` fuera de rango)
 * o un número arbitrario de filas, para ejercitar las cotas del lector. Minimal:
 * no genera sharedStrings; las celdas deben ser inline o numéricas.
 */
export function buildXlsxFromRows(rowsXml: string): Buffer {
  const sheet = `<?xml version="1.0"?><worksheet><sheetData>${rowsXml}</sheetData></worksheet>`;
  return buildZip([{ name: "xl/worksheets/sheet1.xml", data: Buffer.from(sheet, "utf8") }]);
}

/** Construye un .xlsx con inline strings (camino t="inlineStr"). */
export function buildXlsxInline(grid: string[][]): Buffer {
  const rowsXml = grid
    .map((row, r) => {
      const cells = row
        .map(
          (val, c) =>
            `<c r="${colLetter(c)}${r + 1}" t="inlineStr"><is><t>${xmlEscape(val)}</t></is></c>`,
        )
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  const sheet = `<?xml version="1.0"?><worksheet><sheetData>${rowsXml}</sheetData></worksheet>`;
  return buildZip([{ name: "xl/worksheets/sheet1.xml", data: Buffer.from(sheet, "utf8") }]);
}
