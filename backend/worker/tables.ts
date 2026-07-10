/**
 * Table migration manifest: which public tables to copy Neon -> Hetzner `app`,
 * their conflict key, and the on-conflict policy.
 *
 *  - "update": mutable rows that can change in the source between syncs
 *    (INSERT ... ON CONFLICT (pk) DO UPDATE SET col = EXCLUDED.col ...).
 *  - "ignore": append-only / immutable logs & dedup rows that never change
 *    (INSERT ... ON CONFLICT DO NOTHING) — re-running just skips existing.
 *
 * neon_auth.* is intentionally excluded (Neon-managed auth, empty, unused here).
 * Column lists are introspected at runtime from the source, so adding a column
 * upstream doesn't require editing this file — only PK + policy live here.
 */
export type ConflictPolicy = "update" | "ignore";

export interface TableSpec {
  name: string;
  /** Columns forming the conflict target (the PK / unique key). */
  conflict: string[];
  policy: ConflictPolicy;
}

export const TABLES: TableSpec[] = [
  // Mutable — upsert.
  { name: "missing_persons", conflict: ["id"], policy: "update" },
  { name: "reports", conflict: ["id"], policy: "update" },
  { name: "hospitals", conflict: ["id"], policy: "update" },
  { name: "hospital_patients", conflict: ["id"], policy: "update" },
  { name: "geocode_cache", conflict: ["normalized_key"], policy: "update" },
  { name: "sync_state", conflict: ["source"], policy: "update" },
  { name: "click_counters", conflict: ["key"], policy: "update" },
  { name: "chat_messages", conflict: ["id"], policy: "update" },
  // Extra tables present in Neon (keep the data; harmless if empty).
  { name: "analytics_events", conflict: ["id"], policy: "update" },
  { name: "damage_candidates", conflict: ["id"], policy: "update" },
  { name: "contact_messages", conflict: ["id"], policy: "update" },
  { name: "unidentified_persons", conflict: ["id"], policy: "update" },
  // Append-only / dedup / logs — insert-or-ignore.
  { name: "report_confirmations", conflict: ["report_id", "ip_hash"], policy: "ignore" },
  { name: "click_counter_dedup", conflict: ["counter_key", "ip_hash"], policy: "ignore" },
  // donations has a `status` column, but the app never UPDATEs it (insert-only;
  // admin route is GET-only). Append-only in practice -> ignore is correct.
  // If a status-mutation feature ships later, switch this to "update".
  { name: "donations", conflict: ["id"], policy: "ignore" },
  { name: "sync_runs", conflict: ["id"], policy: "ignore" },
];
