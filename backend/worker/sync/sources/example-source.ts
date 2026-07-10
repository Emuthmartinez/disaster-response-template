/**
 * Worked example of a `SourceAdapter` — the reference implementation for
 * docs/modules.md. Copy this file to build a real source adapter.
 *
 * A source adapter's ONLY job is to fetch records from wherever they live
 * (a JSON API, an HTML page, a CSV export, whatever) and normalize them to
 * `ExternalPerson` (see ../types.ts). The sync engine (../engine.ts) takes
 * care of everything else: upsert, dedup, cursors, retries, rate limiting.
 *
 * This adapter reads from a small IN-FILE fixture array instead of a network
 * call, so it has zero external dependencies and is safe to enable in any
 * environment (including CI) without hitting a real third party. Every
 * record below is synthetic ("Persona Ejemplo *") — replace this whole file
 * when you plug in a real source.
 *
 * Gating: this adapter is registered ONLY when `ENABLE_EXAMPLE_SOURCE=true`
 * (see ./index.ts). It is OFF by default, like every optional module in this
 * template.
 *
 * To build a real adapter:
 *   1. Copy this file to `<your-source-id>.ts`.
 *   2. Replace `fetchAll` (and optionally `fetchPage`, if your source
 *      paginates) with real `fetch()` calls against your source's API.
 *   3. Map whatever shape your source returns to `ExternalPerson` — see
 *      `mapPerson` below for the minimal required fields.
 *   4. Register it in `./index.ts` behind its own `ENABLE_*` env flag,
 *      following this file's pattern (do not enable any real source by
 *      default — see docs/modules.md for the gating convention).
 *   5. Never import contact info (phone/email/id-document) unless the
 *      operator explicitly opts in via an env flag — see the `contact`
 *      field note in ../types.ts (real sources risk exposing PII/extortion
 *      targets if imported blindly).
 */

import type { SourceAdapter, FetchCtx, ExternalPerson } from "../types";
import { normalizeAge, toEpochMs } from "../normalize";

export const EXAMPLE_SOURCE_ID = "example-source";

/** Shape this fictional source returns — model your real source's shape here. */
interface ExampleApiRecord {
  id: string;
  fullName: string;
  age: number | null;
  lastSeenAt: string | null;
  notes: string | null;
  status: "active" | "found";
  createdAt: string;
  updatedAt: string;
}

/**
 * Synthetic fixture data — 3 obviously-fake records, no real people. This is
 * the "network response" this adapter would otherwise fetch over HTTP; a
 * real adapter fetches this shape from an actual endpoint instead.
 */
const FIXTURE_RECORDS: readonly ExampleApiRecord[] = [
  {
    id: "ex-001",
    fullName: "Persona Ejemplo Uno",
    age: 34,
    lastSeenAt: "Plaza Central, Ciudad Ejemplo",
    notes: "Registro sintético de demostración — no es una persona real.",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "ex-002",
    fullName: "Persona Ejemplo Dos",
    age: 58,
    lastSeenAt: "Barrio Demo, Ciudad Ejemplo",
    notes: "Registro sintético de demostración — no es una persona real.",
    status: "found",
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: "2026-01-03T00:00:00.000Z",
  },
  {
    id: "ex-003",
    fullName: "Persona Ejemplo Tres",
    age: null,
    lastSeenAt: null,
    notes: "Registro sintético de demostración — no es una persona real.",
    status: "active",
    createdAt: "2026-01-04T00:00:00.000Z",
    updatedAt: "2026-01-04T00:00:00.000Z",
  },
];

/** Maps this source's shape to the canonical `ExternalPerson`. */
function mapPerson(r: ExampleApiRecord): ExternalPerson | null {
  const externalId = r.id.trim();
  const name = r.fullName.trim();
  if (!externalId || !name) return null; // both required — see ../types.ts

  return {
    externalId,
    source: EXAMPLE_SOURCE_ID,
    sourceUrl: null, // set this to the record's canonical URL if your source has one
    name,
    age: normalizeAge(r.age),
    lastSeen: r.lastSeenAt,
    description: r.notes,
    contact: null, // see file header note — never import contact data by default
    photoUrl: null,
    status: r.status,
    resolutionNote: r.status === "found" ? "Ejemplo: localizado por un familiar." : null,
    resolvedAt: r.status === "found" ? toEpochMs(r.updatedAt) : null,
    createdAt: toEpochMs(r.createdAt),
    updatedAt: toEpochMs(r.updatedAt),
  };
}

export const exampleSourceAdapter: SourceAdapter = {
  id: EXAMPLE_SOURCE_ID,
  label: "Example Source (demo fixture, no real data)",
  kind: "json-api",

  // A real adapter would `fetch()` here (with ctx.userAgent, ctx.signal for
  // timeout/abort, and honor ctx.limit/ctx.statusFilter). This one just reads
  // the in-file fixture synchronously, wrapped in a resolved Promise so the
  // interface shape matches a real network-backed adapter.
  async fetchAll(ctx: FetchCtx): Promise<ExternalPerson[]> {
    let records = FIXTURE_RECORDS;
    if (ctx.statusFilter) {
      records = records.filter((r) => r.status === ctx.statusFilter);
    }
    const people = records
      .map(mapPerson)
      .filter((p): p is ExternalPerson => p !== null);
    return ctx.limit ? people.slice(0, ctx.limit) : people;
  },

  // fetchPage is optional (see ../types.ts) — omitted here since the fixture
  // is tiny and doesn't paginate. Implement it if your real source does, to
  // unlock the chunked/resumable sync mode (see ../engine.ts:runSyncChunked).
};
