ALTER TABLE "app_settings" ADD COLUMN "updated_by" integer;--> statement-breakpoint
ALTER TABLE "order_commerce_status" ADD COLUMN "settled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "admin_paused" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "session_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;