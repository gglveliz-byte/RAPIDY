CREATE TABLE "account_deletion_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" varchar(40) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"full_name" varchar(200) NOT NULL,
	"role" varchar(20) DEFAULT 'customer' NOT NULL,
	"reason" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"ip" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "account_deletion_requests_ticket_id_unique" UNIQUE("ticket_id")
);
--> statement-breakpoint
CREATE TABLE "otp_verifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"phone" varchar(20) NOT NULL,
	"otp_id" varchar(120),
	"code_hash" varchar(255),
	"provider" varchar(30) DEFAULT 'neurochat' NOT NULL,
	"purpose" varchar(30) DEFAULT 'login' NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"ip" varchar(64),
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "session_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "idempotency_key" varchar(100);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancelled_by" varchar(20);--> statement-breakpoint
CREATE INDEX "account_deletion_requests_phone_idx" ON "account_deletion_requests" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "account_deletion_requests_status_idx" ON "account_deletion_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "otp_verifications_phone_created_idx" ON "otp_verifications" USING btree ("phone","created_at");--> statement-breakpoint
CREATE INDEX "otp_verifications_otp_id_idx" ON "otp_verifications" USING btree ("otp_id");--> statement-breakpoint
CREATE INDEX "otp_verifications_status_expires_idx" ON "otp_verifications" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "chat_messages_order_created_idx" ON "chat_messages" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_messages_read_idx" ON "chat_messages" USING btree ("is_read");--> statement-breakpoint
CREATE INDEX "commerces_category_id_idx" ON "commerces" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "commerces_merchant_user_id_idx" ON "commerces" USING btree ("merchant_user_id");--> statement-breakpoint
CREATE INDEX "commerces_status_open_idx" ON "commerces" USING btree ("status","is_open");--> statement-breakpoint
CREATE INDEX "customers_deleted_at_idx" ON "customers" USING btree ("deleted_at");--> statement-breakpoint
DELETE FROM "driver_earnings" a USING "driver_earnings" b WHERE a.id > b.id AND a.order_id = b.order_id AND a.type = b.type;--> statement-breakpoint
CREATE UNIQUE INDEX "driver_earnings_order_type_idx" ON "driver_earnings" USING btree ("order_id","type");--> statement-breakpoint
CREATE INDEX "driver_earnings_driver_id_idx" ON "driver_earnings" USING btree ("driver_id");--> statement-breakpoint
DELETE FROM "order_commerce_status" a USING "order_commerce_status" b WHERE a.id > b.id AND a.order_id = b.order_id AND a.commerce_id = b.commerce_id;--> statement-breakpoint
CREATE UNIQUE INDEX "order_commerce_status_order_commerce_idx" ON "order_commerce_status" USING btree ("order_id","commerce_id");--> statement-breakpoint
CREATE INDEX "order_commerce_status_commerce_id_idx" ON "order_commerce_status" USING btree ("commerce_id");--> statement-breakpoint
CREATE INDEX "order_items_order_id_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_commerce_id_idx" ON "order_items" USING btree ("commerce_id");--> statement-breakpoint
CREATE INDEX "order_items_product_id_idx" ON "order_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "order_status_history_order_id_idx" ON "order_status_history" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_status_history_created_at_idx" ON "order_status_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "orders_customer_id_idx" ON "orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "orders_driver_id_idx" ON "orders" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_created_at_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "orders_customer_created_idx" ON "orders" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_idempotency_key_idx" ON "orders" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "products_commerce_id_idx" ON "products" USING btree ("commerce_id");--> statement-breakpoint
CREATE INDEX "products_available_featured_idx" ON "products" USING btree ("is_available","is_featured");--> statement-breakpoint
CREATE INDEX "products_name_idx" ON "products" USING btree ("name");--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("category");