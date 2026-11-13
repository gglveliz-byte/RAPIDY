ALTER TABLE "chat_messages" ADD COLUMN "read_by_customer" "read_status" DEFAULT 'no' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "read_by_driver" "read_status" DEFAULT 'no' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "read_by_commerce" "read_status" DEFAULT 'no' NOT NULL;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "session_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "orders_driver_status_delivered_idx" ON "orders" USING btree ("driver_id","status","delivered_at");--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_phone_unique" UNIQUE("phone");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_unique" UNIQUE("email");