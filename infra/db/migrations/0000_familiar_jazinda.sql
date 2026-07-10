CREATE TABLE IF NOT EXISTS "analytics_events" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"type" text NOT NULL,
	"path" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"referrer" text DEFAULT '' NOT NULL,
	"user_agent" text DEFAULT '' NOT NULL,
	"screen" text DEFAULT '' NOT NULL,
	"language" text DEFAULT '' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"key_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"created_at" bigint NOT NULL,
	"last_used_at" bigint,
	"expires_at" bigint,
	"revoked_at" bigint,
	"revoked_by" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_user_id" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"metadata" jsonb,
	"ip_hash" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "capabilities" (
	"key" text PRIMARY KEY NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text DEFAULT 'Anónimo' NOT NULL,
	"role" text DEFAULT 'ciudadano' NOT NULL,
	"text" text NOT NULL,
	"reply_to" text,
	"reply_preview" text,
	"thread_root_id" text,
	"thread_bumped_at" bigint,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "click_counter_dedup" (
	"counter_key" text NOT NULL,
	"ip_hash" text NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "click_counter_dedup_counter_key_ip_hash_pk" PRIMARY KEY("counter_key","ip_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "click_counters" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contact_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"ip_hash" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "damage_candidates" (
	"id" text PRIMARY KEY NOT NULL,
	"building_id" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"damage_level" text NOT NULL,
	"confidence" double precision DEFAULT 0 NOT NULL,
	"review_status" text DEFAULT 'needs_review' NOT NULL,
	"source_before" text DEFAULT '' NOT NULL,
	"source_after" text DEFAULT '' NOT NULL,
	"source_url" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "data_deletion_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"details" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"ip_hash" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "donations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"amount_usd" integer NOT NULL,
	"ip_hash" text,
	"user_agent" text,
	"created_at" bigint NOT NULL,
	"status" text DEFAULT 'intent' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "earthquakes" (
	"id" text PRIMARY KEY NOT NULL,
	"magnitude" double precision,
	"place" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"depth_km" double precision,
	"alert" text,
	"tsunami" boolean DEFAULT false NOT NULL,
	"sig" integer,
	"usgs_updated_at" bigint NOT NULL,
	"occurred_at" bigint NOT NULL,
	"fetched_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "geocode_cache" (
	"normalized_key" text PRIMARY KEY NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hospital_patients" (
	"id" text PRIMARY KEY NOT NULL,
	"hospital_id" text NOT NULL,
	"name" text NOT NULL,
	"age" integer,
	"condition" text DEFAULT 'unknown' NOT NULL,
	"status" text DEFAULT 'hospitalized' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"contact" text DEFAULT '' NOT NULL,
	"document_hash" text,
	"admitted_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hospital_poc_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"hospital_id" text NOT NULL,
	"display_name" text DEFAULT 'POC hospitalario' NOT NULL,
	"role" text DEFAULT 'hospital_poc' NOT NULL,
	"restricted_contact" text DEFAULT '' NOT NULL,
	"access_token_hash" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hospital_supply_events" (
	"id" text PRIMARY KEY NOT NULL,
	"hospital_id" text NOT NULL,
	"category" text,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"action" text NOT NULL,
	"actor" text DEFAULT 'equipo_operativo' NOT NULL,
	"source" text DEFAULT 'admin_panel' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hospital_supply_help_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"hospital_id" text NOT NULL,
	"category" text NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"urgency" text DEFAULT 'yellow' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"requested_by" text DEFAULT 'poc_hospitalario' NOT NULL,
	"source" text DEFAULT 'admin_panel' NOT NULL,
	"restricted_note" text DEFAULT '' NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hospital_supply_needs" (
	"id" text PRIMARY KEY NOT NULL,
	"hospital_id" text NOT NULL,
	"category" text NOT NULL,
	"item_type" text NOT NULL,
	"quantity" integer,
	"unit" text DEFAULT '' NOT NULL,
	"urgency" text DEFAULT 'yellow' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"public_note" text DEFAULT '' NOT NULL,
	"restricted_note" text DEFAULT '' NOT NULL,
	"last_confirmed_at" bigint NOT NULL,
	"updated_by" text DEFAULT 'equipo_operativo' NOT NULL,
	"source" text DEFAULT 'admin_panel' NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hospital_supply_statuses" (
	"id" text PRIMARY KEY NOT NULL,
	"hospital_id" text NOT NULL,
	"category" text NOT NULL,
	"status" text DEFAULT 'unknown' NOT NULL,
	"public_note" text DEFAULT '' NOT NULL,
	"restricted_note" text DEFAULT '' NOT NULL,
	"stale_after_hours" integer DEFAULT 12 NOT NULL,
	"last_updated_at" bigint NOT NULL,
	"last_confirmed_at" bigint NOT NULL,
	"updated_by" text DEFAULT 'equipo_operativo' NOT NULL,
	"source" text DEFAULT 'admin_panel' NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hospitals" (
	"id" text PRIMARY KEY NOT NULL,
	"external_id" text,
	"name" text NOT NULL,
	"facility_type" text DEFAULT 'hospital' NOT NULL,
	"state" text DEFAULT '' NOT NULL,
	"municipality" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"level" text,
	"priority_zone" text DEFAULT 'P3' NOT NULL,
	"is_priority" boolean DEFAULT false NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hub_checkins" (
	"id" text PRIMARY KEY NOT NULL,
	"hub_id" text NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"external_id" text,
	"city" text,
	"lat" double precision,
	"lng" double precision,
	"hub_created_at" text,
	"ingested_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"photo_external_url" text,
	"photo_url" text,
	"photo_migrated_at" bigint,
	"photo_broken" boolean DEFAULT false NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"status" text,
	"message" text,
	"place_name" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hub_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"consumer_name" text NOT NULL,
	"pg_role" text NOT NULL,
	"allowed_ip" text NOT NULL,
	"hetzner_rule_ref" text,
	"created_by" text NOT NULL,
	"created_at" bigint NOT NULL,
	"last_rotated_at" bigint,
	"revoked_at" bigint,
	"revoked_by" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hub_damaged_buildings" (
	"id" text PRIMARY KEY NOT NULL,
	"hub_id" text NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"external_id" text,
	"city" text,
	"lat" double precision,
	"lng" double precision,
	"hub_created_at" text,
	"ingested_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"photo_external_url" text,
	"photo_url" text,
	"photo_migrated_at" bigint,
	"photo_broken" boolean DEFAULT false NOT NULL,
	"place_name" text,
	"name" text,
	"description" text,
	"severity" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hub_help_offers" (
	"id" text PRIMARY KEY NOT NULL,
	"hub_id" text NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"external_id" text,
	"city" text,
	"lat" double precision,
	"lng" double precision,
	"hub_created_at" text,
	"ingested_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"category" text,
	"description" text,
	"availability" text,
	"available" boolean
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hub_help_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"hub_id" text NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"external_id" text,
	"city" text,
	"lat" double precision,
	"lng" double precision,
	"hub_created_at" text,
	"ingested_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"category" text,
	"description" text,
	"urgency" text,
	"status" text,
	"place_name" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hub_missing_persons" (
	"id" text PRIMARY KEY NOT NULL,
	"hub_id" text NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"external_id" text,
	"city" text,
	"lat" double precision,
	"lng" double precision,
	"hub_created_at" text,
	"ingested_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"photo_external_url" text,
	"photo_url" text,
	"photo_migrated_at" bigint,
	"photo_broken" boolean DEFAULT false NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"status" text,
	"message" text,
	"place_name" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hub_sync_state" (
	"type" text PRIMARY KEY NOT NULL,
	"cursor" text,
	"last_run_at" bigint,
	"cycle_completed_at" bigint
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"role_id" text,
	"org_id" text,
	"token_hash" text NOT NULL,
	"invited_by" text NOT NULL,
	"created_at" bigint NOT NULL,
	"expires_at" bigint NOT NULL,
	"accepted_at" bigint
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "missing_person_suppressions" (
	"legacy_id" text PRIMARY KEY NOT NULL,
	"source" text,
	"external_id" text,
	"reason" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "missing_persons" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"age" integer,
	"nationality" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"last_seen" text DEFAULT '' NOT NULL,
	"contact" text DEFAULT '' NOT NULL,
	"photo" text,
	"status" text DEFAULT 'active' NOT NULL,
	"resolution_note" text,
	"resolution_photo" text,
	"resolved_at" bigint,
	"external_id" text,
	"source" text,
	"source_url" text,
	"photo_external_url" text,
	"lat" double precision,
	"lng" double precision,
	"created_at" bigint NOT NULL,
	"photo_migrated_at" bigint
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "password_resets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"code_hash" text NOT NULL,
	"created_at" bigint NOT NULL,
	"expires_at" bigint NOT NULL,
	"consumed_at" bigint,
	"attempts" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "patient_import_rows" (
	"id" text PRIMARY KEY NOT NULL,
	"import_id" text NOT NULL,
	"row_index" integer NOT NULL,
	"source_hospital" text DEFAULT '' NOT NULL,
	"hospital_id" text,
	"name" text DEFAULT '' NOT NULL,
	"normalized_key" text DEFAULT '' NOT NULL,
	"age" integer,
	"condition" text,
	"status" text,
	"raw_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"document_hash" text,
	"validation_errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"validation_warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dedup_status" text DEFAULT 'pending' NOT NULL,
	"dedup_candidates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence" double precision DEFAULT 0 NOT NULL,
	"row_status" text DEFAULT 'pending' NOT NULL,
	"patient_id" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "patient_imports" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"failed_stage" text,
	"source" text DEFAULT 'api' NOT NULL,
	"source_record_id" text,
	"integration" text,
	"content_type" text DEFAULT 'application/json' NOT NULL,
	"job_id" text,
	"idempotency_key_hash" text,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"valid_rows" integer DEFAULT 0 NOT NULL,
	"invalid_rows" integer DEFAULT 0 NOT NULL,
	"duplicate_rows" integer DEFAULT 0 NOT NULL,
	"review_rows" integer DEFAULT 0 NOT NULL,
	"applied_rows" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"error_summary" text,
	"created_at" bigint NOT NULL,
	"processed_at" bigint,
	"applied_at" bigint,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "permission_grants" (
	"id" text PRIMARY KEY NOT NULL,
	"capability_key" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_user_id" text,
	"subject_role_id" text,
	"org_id" text,
	"granted_by" text NOT NULL,
	"granted_at" bigint NOT NULL,
	"expires_at" bigint,
	"revoked_at" bigint,
	"revoked_by" text,
	"reason" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "report_confirmations" (
	"report_id" text NOT NULL,
	"ip_hash" text NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "report_confirmations_report_id_ip_hash_pk" PRIMARY KEY("report_id","ip_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"place" text NOT NULL,
	"affected" integer DEFAULT 0 NOT NULL,
	"needs" text DEFAULT '' NOT NULL,
	"photo" text,
	"confirmations" integer DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL,
	"photo_migrated_at" bigint
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "role_capabilities" (
	"role_id" text NOT NULL,
	"capability_key" text NOT NULL,
	CONSTRAINT "role_capabilities_role_id_capability_key_pk" PRIMARY KEY("role_id","capability_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "roles" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"org_id" text,
	"created_by" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sync_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"trigger" text,
	"ok" boolean NOT NULL,
	"fetched" integer DEFAULT 0 NOT NULL,
	"inserted" integer DEFAULT 0 NOT NULL,
	"updated" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"errors" integer DEFAULT 0 NOT NULL,
	"from_page" integer,
	"to_page" integer,
	"next_page" integer,
	"cycle_completed" boolean,
	"error" text,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"started_at" bigint NOT NULL,
	"finished_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sync_state" (
	"source" text PRIMARY KEY NOT NULL,
	"next_page" integer DEFAULT 1 NOT NULL,
	"total_pages" integer,
	"last_run_at" bigint,
	"last_cycle_completed_at" bigint,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "unidentified_persons" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'alive' NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"surname" text DEFAULT '' NOT NULL,
	"location_found" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"contact_name" text DEFAULT '' NOT NULL,
	"contact_phone" text DEFAULT '' NOT NULL,
	"photo" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"password_hash" text,
	"role_id" text,
	"org_id" text,
	"status" text DEFAULT 'invited' NOT NULL,
	"is_super_admin" boolean DEFAULT false NOT NULL,
	"created_at" bigint NOT NULL,
	"last_login_at" bigint
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hospital_patients" ADD CONSTRAINT "hospital_patients_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hospital_poc_assignments" ADD CONSTRAINT "hospital_poc_assignments_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hospital_supply_events" ADD CONSTRAINT "hospital_supply_events_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hospital_supply_help_requests" ADD CONSTRAINT "hospital_supply_help_requests_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hospital_supply_needs" ADD CONSTRAINT "hospital_supply_needs_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hospital_supply_statuses" ADD CONSTRAINT "hospital_supply_statuses_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "patient_import_rows" ADD CONSTRAINT "patient_import_rows_import_id_patient_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."patient_imports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "report_confirmations" ADD CONSTRAINT "report_confirmations_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_api_keys_hash" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_api_keys_user" ON "api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_created" ON "audit_log" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_actor" ON "audit_log" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_target" ON "audit_log" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_thread_bumped" ON "chat_messages" USING btree ("thread_bumped_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_reply" ON "chat_messages" USING btree ("reply_to");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_messages_created_at_idx" ON "contact_messages" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_messages_unread_idx" ON "contact_messages" USING btree ("read","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ddr_created_at_idx" ON "data_deletion_requests" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ddr_status_idx" ON "data_deletion_requests" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "donations_created_at_idx" ON "donations" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_earthquakes_occurred" ON "earthquakes" USING btree ("occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_earthquakes_geo" ON "earthquakes" USING btree ("lat","lng");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hospital_patients_hospital" ON "hospital_patients" USING btree ("hospital_id","status","admitted_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hospital_patients_document_hash" ON "hospital_patients" USING btree ("hospital_id","document_hash") WHERE document_hash IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_hospital_patients_document_hash_unique" ON "hospital_patients" USING btree ("document_hash") WHERE document_hash IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hospital_poc_assignments_hospital" ON "hospital_poc_assignments" USING btree ("hospital_id","active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hospital_poc_assignments_token" ON "hospital_poc_assignments" USING btree ("hospital_id","access_token_hash","active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hospital_supply_events_hospital" ON "hospital_supply_events" USING btree ("hospital_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hospital_supply_events_entity" ON "hospital_supply_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hospital_supply_help_open" ON "hospital_supply_help_requests" USING btree ("status","urgency","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hospital_supply_help_hospital" ON "hospital_supply_help_requests" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hospital_supply_needs_active" ON "hospital_supply_needs" USING btree ("hospital_id","status","urgency","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hospital_supply_needs_category" ON "hospital_supply_needs" USING btree ("category","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_hospital_supply_status_unique" ON "hospital_supply_statuses" USING btree ("hospital_id","category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hospital_supply_status_stale" ON "hospital_supply_statuses" USING btree ("category","status","last_confirmed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hospital_supply_status_hospital" ON "hospital_supply_statuses" USING btree ("hospital_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_hospitals_external" ON "hospitals" USING btree ("external_id") WHERE external_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hospitals_state" ON "hospitals" USING btree ("state","priority_zone","name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_hub_checkins_hubid" ON "hub_checkins" USING btree ("hub_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hub_checkins_source" ON "hub_checkins" USING btree ("source");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_hub_credentials_role" ON "hub_credentials" USING btree ("pg_role");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hub_credentials_active" ON "hub_credentials" USING btree ("revoked_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_hub_damaged_hubid" ON "hub_damaged_buildings" USING btree ("hub_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hub_damaged_source" ON "hub_damaged_buildings" USING btree ("source");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_hub_helpoffer_hubid" ON "hub_help_offers" USING btree ("hub_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hub_helpoffer_source" ON "hub_help_offers" USING btree ("source");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_hub_helpreq_hubid" ON "hub_help_requests" USING btree ("hub_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hub_helpreq_source" ON "hub_help_requests" USING btree ("source");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_hub_missing_hubid" ON "hub_missing_persons" USING btree ("hub_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hub_missing_source" ON "hub_missing_persons" USING btree ("source");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hub_missing_photo_pending" ON "hub_missing_persons" USING btree ("id") WHERE photo_migrated_at IS NULL AND photo_external_url IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_invitations_token" ON "invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_invitations_email" ON "invitations" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "missing_person_suppressions_source_external_idx" ON "missing_person_suppressions" USING btree ("source","external_id") WHERE source IS NOT NULL AND external_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_missing_status_created" ON "missing_persons" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_missing_map_coords" ON "missing_persons" USING btree ("lat","lng");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_missing_photo_pending" ON "missing_persons" USING btree ("id") WHERE photo_migrated_at IS NULL AND (photo IS NOT NULL OR photo_external_url IS NOT NULL);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "missing_persons_source_external_id_idx" ON "missing_persons" USING btree ("source","external_id") WHERE external_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pwreset_user" ON "password_resets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pwreset_expires" ON "password_resets" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_import_rows_import" ON "patient_import_rows" USING btree ("import_id","row_index");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_import_rows_status" ON "patient_import_rows" USING btree ("import_id","row_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_imports_status" ON "patient_imports" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_patient_imports_actor_idempotency" ON "patient_imports" USING btree ("created_by","idempotency_key_hash") WHERE idempotency_key_hash IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_grants_cap_subject" ON "permission_grants" USING btree ("capability_key","subject_type","revoked_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_grants_user" ON "permission_grants" USING btree ("subject_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_grants_role" ON "permission_grants" USING btree ("subject_role_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_reports_created_at" ON "reports" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_reports_photo_pending" ON "reports" USING btree ("id") WHERE photo_migrated_at IS NULL AND photo IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_role_caps_role" ON "role_capabilities" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_roles_name_global" ON "roles" USING btree ("name") WHERE org_id IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_roles_name_org" ON "roles" USING btree ("org_id","name") WHERE org_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sync_runs_started" ON "sync_runs" USING btree ("started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_users_email" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_role" ON "users" USING btree ("role_id");