CREATE TABLE IF NOT EXISTS "missing_pets" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"species" text DEFAULT '' NOT NULL,
	"breed" text DEFAULT '' NOT NULL,
	"color" text DEFAULT '' NOT NULL,
	"sex" text,
	"age" integer,
	"description" text DEFAULT '' NOT NULL,
	"last_seen" text DEFAULT '' NOT NULL,
	"contact" text DEFAULT '' NOT NULL,
	"microchip" text,
	"photo" text,
	"status" text DEFAULT 'active' NOT NULL,
	"resolution_note" text,
	"resolution_photo" text,
	"resolved_at" bigint,
	"lat" double precision,
	"lng" double precision,
	"created_at" bigint NOT NULL,
	"photo_migrated_at" bigint
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pets_status_created" ON "missing_pets" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pets_map_coords" ON "missing_pets" USING btree ("lat","lng");