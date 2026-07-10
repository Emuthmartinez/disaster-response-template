/**
 * Drizzle schema — the single source of truth for the database.
 *
 * This MIRRORS the schema currently created lazily (CREATE TABLE IF NOT EXISTS)
 * across lib/*.ts. The goal of moving it here: make the schema explicit,
 * versioned and reviewable, and let `drizzle-kit` generate real migration
 * files (which the gated migrate Job in infra/k8s/ then applies) instead of
 * relying on scattered runtime DDL.
 *
 * Conventions captured from the existing code:
 *   - String IDs: `id TEXT PRIMARY KEY` (app generates crypto.randomUUID()).
 *   - Timestamps are epoch-MILLISECONDS stored as BIGINT (bigint mode:"number"
 *     — values stay within Number.MAX_SAFE_INTEGER; lib/db.ts already parses
 *     oid 20 as a JS number for driver parity).
 *   - Coordinates: DOUBLE PRECISION (`doublePrecision`).
 *
 * 16 tables total. The only real relation is hospital_patients -> hospitals.
 * (12 canónicas + contact_messages, analytics_events, damage_candidates,
 * unidentified_persons; estas 4 existen en prod aunque parte sean legado.)
 */
import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  integer,
  bigint,
  doublePrecision,
  boolean,
  bigserial,
  jsonb,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// epoch-ms timestamp stored as BIGINT, surfaced as a JS number.
const epochMs = (name: string) => bigint(name, { mode: "number" });

/* ------------------------------------------------------------------ reports */
export const reports = pgTable(
  "reports",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    place: text("place").notNull(),
    affected: integer("affected").notNull().default(0),
    needs: text("needs").notNull().default(""),
    photo: text("photo"),
    confirmations: integer("confirmations").notNull().default(0),
    createdAt: epochMs("created_at").notNull(),
    // Set when this row's `photo` has been moved off the DB (base64) / external
    // host and onto R2. NULL = not yet migrated. Lets the image-rehost worker
    // claim only un-migrated rows (FOR UPDATE SKIP LOCKED) and be re-runnable.
    photoMigratedAt: epochMs("photo_migrated_at"),
  },
  (t) => [
    index("idx_reports_created_at").on(t.createdAt.desc()),
    // Partial index: cheap scan for the rehost worker's "WHERE photo_migrated_at
    // IS NULL AND photo IS NOT NULL" claim query.
    index("idx_reports_photo_pending")
      .on(t.id)
      .where(sql`photo_migrated_at IS NULL AND photo IS NOT NULL`),
  ],
);

export const reportConfirmations = pgTable(
  "report_confirmations",
  {
    reportId: text("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    ipHash: text("ip_hash").notNull(),
    createdAt: epochMs("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.reportId, t.ipHash] })],
);

/* ----------------------------------------------------------- missing_persons */
export const missingPersons = pgTable(
  "missing_persons",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    age: integer("age"),
    nationality: text("nationality").notNull().default(""),
    description: text("description").notNull().default(""),
    lastSeen: text("last_seen").notNull().default(""),
    contact: text("contact").notNull().default(""),
    photo: text("photo"),
    status: text("status").notNull().default("active"),
    resolutionNote: text("resolution_note"),
    resolutionPhoto: text("resolution_photo"),
    resolvedAt: epochMs("resolved_at"),
    externalId: text("external_id"),
    source: text("source"),
    sourceUrl: text("source_url"),
    photoExternalUrl: text("photo_external_url"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    createdAt: epochMs("created_at").notNull(),
    // See reports.photoMigratedAt. Covers BOTH base64 `photo` and external
    // `photo_external_url` being moved onto R2. NULL = pending.
    photoMigratedAt: epochMs("photo_migrated_at"),
  },
  (t) => [
    index("idx_missing_status_created").on(t.status, t.createdAt.desc()),
    index("idx_missing_map_coords").on(t.lat, t.lng),
    index("idx_missing_photo_pending")
      .on(t.id)
      .where(
        sql`photo_migrated_at IS NULL AND (photo IS NOT NULL OR photo_external_url IS NOT NULL)`,
      ),
    // Árbitro del ON CONFLICT (source, external_id) de upsertExternalMissingBatch.
    // Ya existe en prod creado out-of-band; lo declaramos para que un rebuild
    // limpio lo tenga. Nombre fijado para coincidir con el de prod (no-op).
    uniqueIndex("missing_persons_source_external_id_idx")
      .on(t.source, t.externalId)
      .where(sql`external_id IS NOT NULL`),
  ],
);

export const missingPersonSuppressions = pgTable(
  "missing_person_suppressions",
  {
    legacyId: text("legacy_id").primaryKey(),
    source: text("source"),
    externalId: text("external_id"),
    reason: text("reason").notNull(),
    createdAt: epochMs("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("missing_person_suppressions_source_external_idx")
      .on(t.source, t.externalId)
      .where(sql`source IS NOT NULL AND external_id IS NOT NULL`),
  ],
);

/* ------------------------------------------------------------- chat_messages */
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull().default("Anónimo"),
    role: text("role").notNull().default("ciudadano"),
    text: text("text").notNull(),
    replyTo: text("reply_to"),
    replyPreview: text("reply_preview"),
    threadRootId: text("thread_root_id"),
    // Nullable en prod: filas antiguas se rellenan con UPDATE en lib/chat.ts.
    threadBumpedAt: epochMs("thread_bumped_at"),
    createdAt: epochMs("created_at").notNull(),
    // Nota: prod conserva 3 columnas legado (reply_to_id/name/text) ya en
    // desuso (sustituidas por reply_to/reply_preview). Se omiten a propósito.
  },
  (t) => [
    index("idx_chat_thread_bumped").on(t.threadBumpedAt.desc()),
    index("idx_chat_reply").on(t.replyTo),
  ],
);

/* ----------------------------------------------------------------- hospitals */
export const hospitals = pgTable(
  "hospitals",
  {
    id: text("id").primaryKey(),
    externalId: text("external_id"),
    name: text("name").notNull(),
    facilityType: text("facility_type").notNull().default("hospital"),
    state: text("state").notNull().default(""),
    municipality: text("municipality").notNull().default(""),
    address: text("address").notNull().default(""),
    level: text("level"),
    priorityZone: text("priority_zone").notNull().default("P3"),
    isPriority: boolean("is_priority").notNull().default(false),
    createdAt: epochMs("created_at").notNull(),
  },
  (t) => [
    // Partial unique index: external_id unique WHERE NOT NULL.
    uniqueIndex("idx_hospitals_external")
      .on(t.externalId)
      .where(sql`external_id IS NOT NULL`),
    index("idx_hospitals_state").on(t.state, t.priorityZone, t.name),
  ],
);

export const hospitalPatients = pgTable(
  "hospital_patients",
  {
    id: text("id").primaryKey(),
    hospitalId: text("hospital_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    age: integer("age"),
    condition: text("condition").notNull().default("unknown"),
    status: text("status").notNull().default("hospitalized"),
    notes: text("notes").notNull().default(""),
    contact: text("contact").notNull().default(""),
    // HMAC del documento/cédula normalizado. Permite dedup exacta sin guardar el
    // documento crudo en la tabla final.
    documentHash: text("document_hash"),
    admittedAt: epochMs("admitted_at").notNull(),
    updatedAt: epochMs("updated_at").notNull(),
  },
  (t) => [
    index("idx_hospital_patients_hospital").on(
      t.hospitalId,
      t.status,
      t.admittedAt.desc(),
    ),
    index("idx_hospital_patients_document_hash")
      .on(t.hospitalId, t.documentHash)
      .where(sql`document_hash IS NOT NULL`),
    uniqueIndex("idx_hospital_patients_document_hash_unique")
      .on(t.documentHash)
      .where(sql`document_hash IS NOT NULL`),
  ],
);

/* --------------------------------------------------------- patient_imports */
// Staging para la importación autenticada de pacientes hospitalarios (#151).
// Un `patient_imports` = un lote subido por una integración/admin; sus filas
// (`patient_import_rows`) pasan por normalización → validación → deduplicación
// en el worker ANTES de escribirse en `hospital_patients` (apply idempotente).
// La cabecera lleva solo contadores + estado + procedencia (sin PII de paciente).
export const patientImports = pgTable(
  "patient_imports",
  {
    id: text("id").primaryKey(),
    // pending → queued → processing → processed → applying → applied | failed
    status: text("status").notNull().default("pending"),
    // Etapa que produjo `failed` (process|apply). Permite reanudar solo fallos de
    // apply parcial sin re-aplicar staging posiblemente incompleto de process.
    failedStage: text("failed_stage"),
    // Etiqueta DECLARADA del origen del lote (no es PII, no es confiable, no es
    // autoría). La declara el cliente; la autoría verificada es `created_by`. No
    // usar para auth/dedup. Ver docs/rfcs/0007-procedencia-ingesta-pacientes.md.
    source: text("source").notNull().default("api"),
    // Identificador del registro/lote en el sistema de origen declarado. No es
    // autoridad de identidad: solo trazabilidad/provenance del lote.
    sourceRecordId: text("source_record_id"),
    // Integración/canal declarado por quien sube el lote (p.ej. api-key, hospital,
    // telegram, csv-manual). No reemplaza `created_by` ni se usa para permisos.
    integration: text("integration"),
    // Formato del payload de entrada. JSON se materializa directo; CSV/XLSX se
    // parsea en el worker; imagen OCR se extrae en el worker y queda en revisión.
    contentType: text("content_type").notNull().default("application/json"),
    // jobId de BullMQ del último job (process/apply) para trazabilidad.
    jobId: text("job_id"),
    // Hash SHA-256 del header Idempotency-Key. No guardamos la key cruda; el
    // índice único scoped evita duplicar lotes por retry del mismo usuario.
    idempotencyKeyHash: text("idempotency_key_hash"),
    totalRows: integer("total_rows").notNull().default(0),
    validRows: integer("valid_rows").notNull().default(0),
    invalidRows: integer("invalid_rows").notNull().default(0),
    duplicateRows: integer("duplicate_rows").notNull().default(0),
    reviewRows: integer("review_rows").notNull().default(0),
    appliedRows: integer("applied_rows").notNull().default(0),
    // AUTORÍA VERIFICADA: user.id que creó el lote, derivado de req.user en el
    // route (NO del body) → no spoofeable. (NULL = sistema). No es PII de paciente.
    createdBy: text("created_by"),
    // Resumen de error legible (NUNCA stack traces ni PII).
    errorSummary: text("error_summary"),
    createdAt: epochMs("created_at").notNull(),
    processedAt: epochMs("processed_at"),
    appliedAt: epochMs("applied_at"),
    updatedAt: epochMs("updated_at").notNull(),
  },
  (t) => [
    index("idx_patient_imports_status").on(t.status, t.createdAt.desc()),
    uniqueIndex("idx_patient_imports_actor_idempotency")
      .on(t.createdBy, t.idempotencyKeyHash)
      .where(sql`idempotency_key_hash IS NOT NULL`),
  ],
);

// Una fila staging por paciente del lote. Guarda el dato CRUDO (restringido, en
// jsonb) + los campos normalizados + el resultado de validación/dedup. El dato
// crudo y los campos sensibles (cédula/documento, notas, contacto) NUNCA se
// exponen en respuestas públicas/de baja confianza — solo el estado y los
// errores/avisos de revisión.
export const patientImportRows = pgTable(
  "patient_import_rows",
  {
    id: text("id").primaryKey(),
    importId: text("import_id")
      .notNull()
      .references(() => patientImports.id, { onDelete: "cascade" }),
    rowIndex: integer("row_index").notNull(),
    // Texto crudo del hospital tal como vino en el input (para resolverlo).
    sourceHospital: text("source_hospital").notNull().default(""),
    // Hospital resuelto (FK lógica a hospitals.id; NULL = no resoluble todavía).
    hospitalId: text("hospital_id"),
    // Nombre normalizado (trim/colapso de espacios).
    name: text("name").notNull().default(""),
    // Clave de bloqueo para dedup: nombre en minúsculas, sin acentos ni signos.
    normalizedKey: text("normalized_key").notNull().default(""),
    age: integer("age"),
    condition: text("condition"),
    status: text("status"),
    // Dato CRUDO de entrada + campos sensibles (documento/notas/contacto).
    // RESTRINGIDO: no se serializa hacia respuestas públicas.
    rawData: jsonb("raw_data").notNull().default({}),
    // HMAC del documento/cédula normalizado. El crudo queda solo en raw_data.
    documentHash: text("document_hash"),
    validationErrors: jsonb("validation_errors").notNull().default([]),
    validationWarnings: jsonb("validation_warnings").notNull().default([]),
    // pending | unique | duplicate | needs_review
    dedupStatus: text("dedup_status").notNull().default("pending"),
    // Candidatos de duplicado (allowlist: patientId + name + reason). Sin PII extra.
    dedupCandidates: jsonb("dedup_candidates").notNull().default([]),
    confidence: doublePrecision("confidence").notNull().default(0),
    // pending | valid | invalid | duplicate | needs_review | applied | skipped
    rowStatus: text("row_status").notNull().default("pending"),
    // hospital_patients.id final tras el apply (idempotencia: set = ya aplicada).
    patientId: text("patient_id"),
    createdAt: epochMs("created_at").notNull(),
    updatedAt: epochMs("updated_at").notNull(),
  },
  (t) => [
    index("idx_patient_import_rows_import").on(t.importId, t.rowIndex),
    index("idx_patient_import_rows_status").on(t.importId, t.rowStatus),
    // Nota: NO indexamos (import_id, document_hash). La dedup intra-lote por
    // documento se resuelve en memoria durante `processImport` (no hay query por
    // esta combinación), así que el índice sería peso muerto.
  ],
);

/* ------------------------------------------------------- hospital_supplies */
export const hospitalSupplyStatuses = pgTable(
  "hospital_supply_statuses",
  {
    id: text("id").primaryKey(),
    hospitalId: text("hospital_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    status: text("status").notNull().default("unknown"),
    publicNote: text("public_note").notNull().default(""),
    restrictedNote: text("restricted_note").notNull().default(""),
    staleAfterHours: integer("stale_after_hours").notNull().default(12),
    lastUpdatedAt: epochMs("last_updated_at").notNull(),
    lastConfirmedAt: epochMs("last_confirmed_at").notNull(),
    updatedBy: text("updated_by").notNull().default("equipo_operativo"),
    source: text("source").notNull().default("admin_panel"),
    createdAt: epochMs("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("idx_hospital_supply_status_unique").on(
      t.hospitalId,
      t.category,
    ),
    index("idx_hospital_supply_status_stale").on(
      t.category,
      t.status,
      t.lastConfirmedAt,
    ),
    index("idx_hospital_supply_status_hospital").on(t.hospitalId),
  ],
);

export const hospitalSupplyNeeds = pgTable(
  "hospital_supply_needs",
  {
    id: text("id").primaryKey(),
    hospitalId: text("hospital_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    itemType: text("item_type").notNull(),
    quantity: integer("quantity"),
    unit: text("unit").notNull().default(""),
    urgency: text("urgency").notNull().default("yellow"),
    status: text("status").notNull().default("active"),
    publicNote: text("public_note").notNull().default(""),
    restrictedNote: text("restricted_note").notNull().default(""),
    lastConfirmedAt: epochMs("last_confirmed_at").notNull(),
    updatedBy: text("updated_by").notNull().default("equipo_operativo"),
    source: text("source").notNull().default("admin_panel"),
    createdAt: epochMs("created_at").notNull(),
    updatedAt: epochMs("updated_at").notNull(),
  },
  (t) => [
    index("idx_hospital_supply_needs_active").on(
      t.hospitalId,
      t.status,
      t.urgency,
      t.updatedAt.desc(),
    ),
    index("idx_hospital_supply_needs_category").on(t.category, t.status),
  ],
);

export const hospitalSupplyHelpRequests = pgTable(
  "hospital_supply_help_requests",
  {
    id: text("id").primaryKey(),
    hospitalId: text("hospital_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    message: text("message").notNull().default(""),
    urgency: text("urgency").notNull().default("yellow"),
    status: text("status").notNull().default("open"),
    requestedBy: text("requested_by").notNull().default("poc_hospitalario"),
    source: text("source").notNull().default("admin_panel"),
    restrictedNote: text("restricted_note").notNull().default(""),
    createdAt: epochMs("created_at").notNull(),
    updatedAt: epochMs("updated_at").notNull(),
  },
  (t) => [
    index("idx_hospital_supply_help_open").on(
      t.status,
      t.urgency,
      t.createdAt.desc(),
    ),
    index("idx_hospital_supply_help_hospital").on(t.hospitalId),
  ],
);

export const hospitalPocAssignments = pgTable(
  "hospital_poc_assignments",
  {
    id: text("id").primaryKey(),
    hospitalId: text("hospital_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull().default("POC hospitalario"),
    role: text("role").notNull().default("hospital_poc"),
    restrictedContact: text("restricted_contact").notNull().default(""),
    accessTokenHash: text("access_token_hash").notNull().default(""),
    active: boolean("active").notNull().default(true),
    createdAt: epochMs("created_at").notNull(),
    updatedAt: epochMs("updated_at").notNull(),
  },
  (t) => [
    index("idx_hospital_poc_assignments_hospital").on(t.hospitalId, t.active),
    index("idx_hospital_poc_assignments_token").on(
      t.hospitalId,
      t.accessTokenHash,
      t.active,
    ),
  ],
);

export const hospitalSupplyEvents = pgTable(
  "hospital_supply_events",
  {
    id: text("id").primaryKey(),
    hospitalId: text("hospital_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "cascade" }),
    category: text("category"),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    action: text("action").notNull(),
    actor: text("actor").notNull().default("equipo_operativo"),
    source: text("source").notNull().default("admin_panel"),
    payload: jsonb("payload").notNull().default({}),
    createdAt: epochMs("created_at").notNull(),
  },
  (t) => [
    index("idx_hospital_supply_events_hospital").on(
      t.hospitalId,
      t.createdAt.desc(),
    ),
    index("idx_hospital_supply_events_entity").on(t.entityType, t.entityId),
  ],
);

/* ----------------------------------------------------------------- donations */
export const donations = pgTable(
  "donations",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    amountUsd: integer("amount_usd").notNull(),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    createdAt: epochMs("created_at").notNull(),
    // Ciclo de vida de la donación. Hoy la app nunca lo muta (insert-only), por
    // eso worker/tables.ts la trata como append-only ("ignore").
    status: text("status").notNull().default("intent"),
  },
  (t) => [index("donations_created_at_idx").on(t.createdAt.desc())],
);

/* ------------------------------------------------------------ click_counters */
export const clickCounters = pgTable("click_counters", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
});

export const clickCounterDedup = pgTable(
  "click_counter_dedup",
  {
    counterKey: text("counter_key").notNull(),
    ipHash: text("ip_hash").notNull(),
    createdAt: epochMs("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.counterKey, t.ipHash] })],
);

/* ------------------------------------------------------------- geocode_cache */
export const geocodeCache = pgTable("geocode_cache", {
  normalizedKey: text("normalized_key").primaryKey(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  label: text("label").notNull().default(""),
  updatedAt: epochMs("updated_at").notNull(),
});

/* ----------------------------------------------------------- sync_state/runs */
export const syncState = pgTable("sync_state", {
  source: text("source").primaryKey(),
  nextPage: integer("next_page").notNull().default(1),
  totalPages: integer("total_pages"),
  lastRunAt: epochMs("last_run_at"),
  lastCycleCompletedAt: epochMs("last_cycle_completed_at"),
  updatedAt: epochMs("updated_at").notNull(),
});

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    source: text("source").notNull(),
    trigger: text("trigger"),
    ok: boolean("ok").notNull(),
    fetched: integer("fetched").notNull().default(0),
    inserted: integer("inserted").notNull().default(0),
    updated: integer("updated").notNull().default(0),
    skipped: integer("skipped").notNull().default(0),
    errors: integer("errors").notNull().default(0),
    fromPage: integer("from_page"),
    toPage: integer("to_page"),
    nextPage: integer("next_page"),
    cycleCompleted: boolean("cycle_completed"),
    error: text("error"),
    durationMs: integer("duration_ms").notNull().default(0),
    startedAt: epochMs("started_at").notNull(),
    finishedAt: epochMs("finished_at").notNull(),
  },
  (t) => [index("idx_sync_runs_started").on(t.startedAt.desc())],
);

/* ----------------------------------------------------- contact_messages */
// Bandeja de contacto del panel admin. La DDL viva está en
// lib/contact-inbox.ts (CREATE TABLE IF NOT EXISTS); se refleja aquí para
// centralizar el esquema.
export const contactMessages = pgTable(
  "contact_messages",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    subject: text("subject").notNull(),
    message: text("message").notNull(),
    read: boolean("read").notNull().default(false),
    ipHash: text("ip_hash"),
    createdAt: epochMs("created_at").notNull(),
  },
  (t) => [
    index("contact_messages_created_at_idx").on(t.createdAt.desc()),
    index("contact_messages_unread_idx").on(t.read, t.createdAt.desc()),
  ],
);

/* ----------------------------------------------------- data_deletion_requests */
// Solicitudes de eliminación de datos personales (GDPR/CCPA).
// Los usuarios pueden solicitar que eliminemos sus datos personales;
// estas solicitudes quedan registradas en esta tabla.
export const dataDeletionRequests = pgTable(
  "data_deletion_requests",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    details: text("details"),
    status: text("status").notNull().default("pending"),
    ipHash: text("ip_hash"),
    createdAt: epochMs("created_at").notNull(),
    updatedAt: epochMs("updated_at").notNull(),
  },
  (t) => [
    index("ddr_created_at_idx").on(t.createdAt.desc()),
    index("ddr_status_idx").on(t.status, t.createdAt.desc()),
  ],
);

/* ----------------------------------------------------- analytics_events */
// Eventos de analítica. Presente en prod; sin acceso desde el código de la
// app (legado/externo). Se documenta para que el esquema cubra prod.
export const analyticsEvents = pgTable("analytics_events", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  type: text("type").notNull(),
  path: text("path").notNull(),
  label: text("label").notNull().default(""),
  referrer: text("referrer").notNull().default(""),
  userAgent: text("user_agent").notNull().default(""),
  screen: text("screen").notNull().default(""),
  language: text("language").notNull().default(""),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: epochMs("created_at").notNull(),
});

/* ---------------------------------------------------- damage_candidates */
// Candidatos de daño estructural. Presente en prod; legado/externo.
export const damageCandidates = pgTable("damage_candidates", {
  id: text("id").primaryKey(),
  buildingId: text("building_id").notNull(),
  name: text("name").notNull().default(""),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  damageLevel: text("damage_level").notNull(),
  confidence: doublePrecision("confidence").notNull().default(0),
  reviewStatus: text("review_status").notNull().default("needs_review"),
  sourceBefore: text("source_before").notNull().default(""),
  sourceAfter: text("source_after").notNull().default(""),
  sourceUrl: text("source_url").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: epochMs("created_at").notNull(),
  updatedAt: epochMs("updated_at").notNull(),
});

/* ------------------------------------------------- unidentified_persons */
// Personas no identificadas. Presente en prod; legado/externo.
export const unidentifiedPersons = pgTable("unidentified_persons", {
  id: text("id").primaryKey(),
  status: text("status").notNull().default("alive"),
  name: text("name").notNull().default(""),
  surname: text("surname").notNull().default(""),
  locationFound: text("location_found").notNull().default(""),
  description: text("description").notNull().default(""),
  contactName: text("contact_name").notNull().default(""),
  contactPhone: text("contact_phone").notNull().default(""),
  photo: text("photo"),
  createdAt: epochMs("created_at").notNull(),
});

/* =====================================================================
 * Federación opcional con un hub central externo (ver ENABLE_HUB_FEDERATION).
 * Espejo READ-ONLY de los datos de OTROS sitios socios. Ver
 * Módulo opcional; desactivado por defecto.
 *
 * Una tabla por tipo del hub (catálogo cerrado de 5), espejando sus DTOs
 * `*Public`. NUNCA se mezclan con las tablas nativas (evita duplicación: ya
 * somos fuente del hub). Columnas comunes de federación:
 *   hub_id   uuid del hub (identidad estable, UNIQUE -> idempotencia del upsert)
 *   source   sitio socio que lo publicó (excluimos los nuestros al ingerir)
 *   external_id  id del socio dentro de su sistema (puede venir null)
 *   ingested_at  cuándo lo trajimos; updated_at  high-water de cambios vistos
 * Columnas de imagen (mismo patrón que las nativas; la foto se copia a R2):
 *   photo_external_url  la URL del socio (efímera, puede dar 404)
 *   photo_url           la URL de R2 tras copiar
 *   photo_migrated_at   sellado cuando ya está en R2 (NULL = pendiente)
 *   photo_broken        true si la fuente devolvió 404/permanente
 * ===================================================================== */

// Columnas compartidas por todas las tablas hub_*. Se hace spread en cada una.
const hubCommon = {
  id: text("id").primaryKey(), // crypto.randomUUID() local
  hubId: text("hub_id").notNull(), // uuid del hub (único)
  source: text("source").notNull().default(""),
  externalId: text("external_id"),
  city: text("city"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  hubCreatedAt: text("hub_created_at"), // created_at del hub (ISO, tal cual)
  ingestedAt: epochMs("ingested_at").notNull(),
  updatedAt: epochMs("updated_at").notNull(),
};

// Columnas de imagen compartidas (solo en los tipos con foto).
const hubPhoto = {
  photoExternalUrl: text("photo_external_url"),
  photoUrl: text("photo_url"),
  photoMigratedAt: epochMs("photo_migrated_at"),
  photoBroken: boolean("photo_broken").notNull().default(false),
};

export const hubMissingPersons = pgTable(
  "hub_missing_persons",
  {
    ...hubCommon,
    ...hubPhoto,
    name: text("name").notNull().default(""),
    status: text("status"), // LOOKING_FOR_SOMEONE, etc.
    message: text("message"),
    placeName: text("place_name"),
  },
  (t) => [
    uniqueIndex("idx_hub_missing_hubid").on(t.hubId),
    index("idx_hub_missing_source").on(t.source),
    index("idx_hub_missing_photo_pending")
      .on(t.id)
      .where(sql`photo_migrated_at IS NULL AND photo_external_url IS NOT NULL`),
  ],
);

export const hubCheckins = pgTable(
  "hub_checkins",
  {
    ...hubCommon,
    ...hubPhoto,
    name: text("name").notNull().default(""),
    status: text("status"), // SAFE, NEEDS_HELP, LOOKING_FOR_SOMEONE
    message: text("message"),
    placeName: text("place_name"),
  },
  (t) => [
    uniqueIndex("idx_hub_checkins_hubid").on(t.hubId),
    index("idx_hub_checkins_source").on(t.source),
  ],
);

export const hubHelpRequests = pgTable(
  "hub_help_requests",
  {
    ...hubCommon,
    category: text("category"), // medical, food, water, ...
    description: text("description"),
    urgency: text("urgency"), // LOW..CRITICAL
    status: text("status"), // OPEN, IN_PROGRESS, RESOLVED
    placeName: text("place_name"),
  },
  (t) => [
    uniqueIndex("idx_hub_helpreq_hubid").on(t.hubId),
    index("idx_hub_helpreq_source").on(t.source),
  ],
);

export const hubHelpOffers = pgTable(
  "hub_help_offers",
  {
    ...hubCommon,
    category: text("category"), // transportation, food, ...
    description: text("description"),
    availability: text("availability"),
    available: boolean("available"),
  },
  (t) => [
    uniqueIndex("idx_hub_helpoffer_hubid").on(t.hubId),
    index("idx_hub_helpoffer_source").on(t.source),
  ],
);

export const hubDamagedBuildings = pgTable(
  "hub_damaged_buildings",
  {
    ...hubCommon,
    ...hubPhoto,
    placeName: text("place_name"),
    name: text("name"),
    description: text("description"),
    severity: text("severity"), // CRACKS, PARTIAL, COLLAPSE_RISK, COLLAPSED
  },
  (t) => [
    uniqueIndex("idx_hub_damaged_hubid").on(t.hubId),
    index("idx_hub_damaged_source").on(t.source),
  ],
);

/* ------------------------------------------------------- hub_sync_state */
// Cursor de paginación por tipo del hub (created_at|id). Igual que sync_state
// pero para la federación: el backfill/incremental reanudan desde aquí.
export const hubSyncState = pgTable("hub_sync_state", {
  type: text("type").primaryKey(), // missing_person, checkin, ...
  cursor: text("cursor"), // último next_cursor visto (null = desde el inicio)
  lastRunAt: epochMs("last_run_at"),
  cycleCompletedAt: epochMs("cycle_completed_at"),
});

/* ============================================================================
 * AUTH / RBAC — superficie autenticada `api/public/*` (integraciones + admin)
 * ============================================================================
 * Motor de roles+capacidades portado de un diseño RBAC estándar (PermissionGrant
 * + resolución centralizada con short-circuit de admin y cache por-request) PERO con los
 * roles guardados en la DB (creados por admins), no como enum en código.
 *
 * Modelo de decisión (capa que protege cada endpoint nuevo):
 *   capability  = unidad atómica `recurso:verbo` (report:create, role:edit…).
 *                 Catálogo FIJO (sembrado por código, no editable por usuarios).
 *   role        = fila en DB que admins crean; agrupa capacidades (bundle).
 *   role_caps   = M:N rol↔capacidades.
 *   user        = tiene un rol base (bundle) + posibles grants individuales.
 *   grant       = capacidad individual encima del rol (flexibilidad por-persona),
 *                 con expiry/revoke (modelo estándar de grants). Sujeto: user O role.
 *   invitation  = alta por invitación (flujo estándar): token → accept → JWT.
 *   audit_log   = TODA mutación de auth (rol/grant/invite/login) queda registrada.
 *
 * Tenancy por fases: `org_id` viaja en roles/users/grants pero queda NULL (global)
 * hoy. Fase 2 = poblarlo + un filtro de scope en userHasCapability. El core no
 * cambia. NULL = global / aplica en todas las orgs.
 */

/* ------------------------------------------------------------- capabilities */
// Catálogo FIJO de capacidades. Se siembra por migración; NO lo crean usuarios.
// key = `recurso:verbo` (allowlist). category agrupa para la UI de admin.
export const capabilities = pgTable("capabilities", {
  key: text("key").primaryKey(), // "report:create", "user:invite", ...
  description: text("description").notNull().default(""),
  category: text("category").notNull().default(""), // "reports", "auth", ...
});

/* -------------------------------------------------------------------- roles */
// Roles creados por admins (filas, no enum). is_system marca el rol "admin"
// semilla (inmutable: no se borra ni se le quitan capacidades). org_id = fase 2.
export const roles = pgTable(
  "roles",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    isSystem: boolean("is_system").notNull().default(false),
    orgId: text("org_id"), // NULL = global (fase 2: scope por organización)
    createdBy: text("created_by"), // user.id que lo creó (NULL para el semilla)
    createdAt: epochMs("created_at").notNull(),
    updatedAt: epochMs("updated_at"),
  },
  (t) => [
    // Nombre único por org (con org NULL = único global). Dos índices parciales
    // para tratar NULL como "global" sin chocar con orgs concretas.
    uniqueIndex("idx_roles_name_global").on(t.name).where(sql`org_id IS NULL`),
    uniqueIndex("idx_roles_name_org").on(t.orgId, t.name).where(sql`org_id IS NOT NULL`),
  ],
);

/* -------------------------------------------------------- role_capabilities */
// M:N rol↔capacidades. Borrar un rol cae en cascada (FK app-side, sin DDL aquí).
export const roleCapabilities = pgTable(
  "role_capabilities",
  {
    roleId: text("role_id").notNull(),
    capabilityKey: text("capability_key").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.roleId, t.capabilityKey] }),
    index("idx_role_caps_role").on(t.roleId),
  ],
);

/* -------------------------------------------------------------------- users */
// Usuarios autenticados (≠ ciudadanos anónimos del sitio público). password_hash
// es bcrypt; NULL mientras la invitación esté pendiente. status: invited→active.
export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull().default(""),
    passwordHash: text("password_hash"), // NULL hasta aceptar invitación
    roleId: text("role_id"), // rol base (bundle). NULL = sin rol (solo grants)
    orgId: text("org_id"), // fase 2
    status: text("status").notNull().default("invited"), // invited|active|disabled
    // Super admin: tier por ENCIMA del admin semilla. Único que puede gestionar
    // la réplica pública (capability mirror:manage, con corte en resolve.ts). El
    // admin semilla normal NO la tiene. Ver RFC 0006.
    isSuperAdmin: boolean("is_super_admin").notNull().default(false),
    createdAt: epochMs("created_at").notNull(),
    lastLoginAt: epochMs("last_login_at"),
  },
  (t) => [
    uniqueIndex("idx_users_email").on(sql`lower(${t.email})`),
    index("idx_users_role").on(t.roleId),
  ],
);

/* -------------------------------------------------------- permission_grants */
// Capacidad individual encima del rol (modelo estándar de grants). subject = user O role
// (XOR app-side). Activo = revoked_at NULL && (expires_at NULL || > now).
export const permissionGrants = pgTable(
  "permission_grants",
  {
    id: text("id").primaryKey(),
    capabilityKey: text("capability_key").notNull(),
    subjectType: text("subject_type").notNull(), // "user" | "role"
    subjectUserId: text("subject_user_id"), // set si subject_type=user
    subjectRoleId: text("subject_role_id"), // set si subject_type=role
    orgId: text("org_id"), // fase 2: scope del grant
    grantedBy: text("granted_by").notNull(),
    grantedAt: epochMs("granted_at").notNull(),
    expiresAt: epochMs("expires_at"), // NULL = sin expiración
    revokedAt: epochMs("revoked_at"), // NULL = activo
    revokedBy: text("revoked_by"),
    reason: text("reason").notNull().default(""),
  },
  (t) => [
    index("idx_grants_cap_subject").on(t.capabilityKey, t.subjectType, t.revokedAt),
    index("idx_grants_user").on(t.subjectUserId),
    index("idx_grants_role").on(t.subjectRoleId),
  ],
);

/* -------------------------------------------------------------- invitations */
// Alta por invitación (flujo estándar). token_hash = sha256 del token enviado por
// email (nunca guardamos el token en claro). Un solo uso; caduca.
export const invitations = pgTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    roleId: text("role_id"), // rol que tendrá al aceptar
    orgId: text("org_id"), // fase 2
    tokenHash: text("token_hash").notNull(),
    invitedBy: text("invited_by").notNull(),
    createdAt: epochMs("created_at").notNull(),
    expiresAt: epochMs("expires_at").notNull(),
    acceptedAt: epochMs("accepted_at"), // NULL = pendiente
  },
  (t) => [
    uniqueIndex("idx_invitations_token").on(t.tokenHash),
    index("idx_invitations_email").on(sql`lower(${t.email})`),
  ],
);

/* ----------------------------------------------------------- password_resets */
// Recuperación de contraseña por OTP (código de 6 dígitos enviado al email).
// Guardamos solo el HASH del código (sha256), nunca el código en claro. Un solo
// uso, caduca pronto (minutos). attempts limita el fuerza-bruta del código.
export const passwordResets = pgTable(
  "password_resets",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    codeHash: text("code_hash").notNull(),
    createdAt: epochMs("created_at").notNull(),
    expiresAt: epochMs("expires_at").notNull(),
    consumedAt: epochMs("consumed_at"), // NULL = sin usar
    attempts: integer("attempts").notNull().default(0),
  },
  (t) => [
    index("idx_pwreset_user").on(t.userId),
    index("idx_pwreset_expires").on(t.expiresAt),
  ],
);

/* ---------------------------------------------------------------- audit_log */
// Bitácora de TODA mutación sensible (auth + escrituras de api/public/*).
// metadata jsonb lleva el contexto (antes/después, ids afectados, etc.).
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorUserId: text("actor_user_id"), // NULL = sistema/anónimo
    action: text("action").notNull(), // "role.create", "report.delete", ...
    targetType: text("target_type"), // "report", "user", "role", ...
    targetId: text("target_id"),
    metadata: jsonb("metadata"),
    ipHash: text("ip_hash"), // IP hasheada (privacidad), nunca cruda
    createdAt: epochMs("created_at").notNull(),
  },
  (t) => [
    index("idx_audit_created").on(t.createdAt.desc()),
    index("idx_audit_actor").on(t.actorUserId),
    index("idx_audit_target").on(t.targetType, t.targetId),
  ],
);

/* ------------------------------------------------------------- earthquakes */
// Catálogo de sismos de la región configurada, ingerido del USGS por el worker (feed
// realtime cada minuto + backfill puntual vía FDSN). La PK es el `id` de evento
// del USGS (ej. "us7000abcd") → el upsert es onConflictDoUpdate sobre la PK,
// idempotente y a prueba de revisiones (USGS corrige magnitud horas después).
// Datos públicos read-only; una región típica genera pocos sismos/día (catálogo pequeño).
export const earthquakes = pgTable(
  "earthquakes",
  {
    id: text("id").primaryKey(), // id de evento USGS (clave natural)
    magnitude: doublePrecision("magnitude"), // nullable: a veces se publica antes de calcularla
    place: text("place").notNull(), // p. ej. "43 km N of Ciudad Ejemplo"
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    depthKm: doublePrecision("depth_km"),
    alert: text("alert"), // PAGER: green|yellow|orange|red (usualmente null en sismos chicos)
    tsunami: boolean("tsunami").notNull().default(false),
    sig: integer("sig"), // significancia USGS 0–1000
    usgsUpdatedAt: epochMs("usgs_updated_at").notNull(), // 'updated' del USGS → decide si sobreescribir
    occurredAt: epochMs("occurred_at").notNull(), // 'time' del USGS (momento del sismo)
    fetchedAt: epochMs("fetched_at").notNull(), // cuándo lo vio nuestro worker
  },
  (t) => [
    index("idx_earthquakes_occurred").on(t.occurredAt.desc()),
    index("idx_earthquakes_geo").on(t.lat, t.lng),
  ],
);

/* ---------------------------------------------------------------- api_keys */
// API keys self-service por usuario (integraciones máquina-a-máquina contra
// api/public/*). Nunca se guarda la llave cruda: solo su hash SHA-256 (igual que
// hospital_poc_assignments e invitations). `prefix` es los primeros caracteres
// (no secreto) para identificar la llave en la UI. `scopes` acota la llave a un
// SUBCONJUNTO de las capacidades del usuario (least-privilege por integración);
// el permiso efectivo en cada request = scopes ∩ capacidades vivas del usuario.
// Soft-delete vía revokedAt (nunca borrado físico) — espeja el patrón de users.
export const apiKeys = pgTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(), // dueño de la llave
    name: text("name").notNull().default(""), // etiqueta del usuario ("CI", "Postman"…)
    keyHash: text("key_hash").notNull(), // SHA-256(llave cruda), nunca la cruda
    prefix: text("prefix").notNull(), // primeros chars para mostrar (no secreto)
    scopes: jsonb("scopes").notNull(), // string[] de capability keys (subconjunto del usuario)
    createdAt: epochMs("created_at").notNull(),
    lastUsedAt: epochMs("last_used_at"), // se actualiza fire-and-forget en cada uso
    expiresAt: epochMs("expires_at"), // NULL = sin expiración
    revokedAt: epochMs("revoked_at"), // NULL = activa (soft delete)
    revokedBy: text("revoked_by"), // user.id que la revocó (self o admin)
  },
  (t) => [
    uniqueIndex("idx_api_keys_hash").on(t.keyHash), // lookup O(1) en auth
    index("idx_api_keys_user").on(t.userId), // listar "mis llaves"
  ],
);

/* ------------------------------------------------------------ hub_credentials */
// Credenciales de acceso a la RÉPLICA PÚBLICA (hub Postgres, RFC 0006). Cada fila
// representa un consumidor externo al que un super admin le dio acceso SQL crudo.
// El backend, al emitirla: (1) crea un ROL Postgres `consumer_<id>` en el hub con
// password generada, (2) abre la IP del consumidor en el firewall del hub vía
// la API de Hetzner. Esta tabla es el LIBRO MAYOR para poder revocar ambas cosas.
// La password NUNCA se guarda (se muestra una vez, como api_keys). `pgRole` y
// `allowedIp` + `hetznerRuleRef` permiten deshacer rol y regla al revocar.
export const hubCredentials = pgTable(
  "hub_credentials",
  {
    id: text("id").primaryKey(),
    consumerName: text("consumer_name").notNull(), // etiqueta humana ("ONG X")
    pgRole: text("pg_role").notNull(), // rol creado en el hub (consumer_<id>)
    allowedIp: text("allowed_ip").notNull(), // CIDR/IP whitelisteada en el firewall
    hetznerRuleRef: text("hetzner_rule_ref"), // marca para ubicar/quitar la regla
    createdBy: text("created_by").notNull(), // user.id (super admin) que la emitió
    createdAt: epochMs("created_at").notNull(),
    lastRotatedAt: epochMs("last_rotated_at"), // si se rota la password
    revokedAt: epochMs("revoked_at"), // NULL = activa (soft delete)
    revokedBy: text("revoked_by"),
  },
  (t) => [
    uniqueIndex("idx_hub_credentials_role").on(t.pgRole), // un rol por credencial
    index("idx_hub_credentials_active").on(t.revokedAt),
  ],
);
