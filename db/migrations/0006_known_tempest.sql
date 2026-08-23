ALTER TYPE "public"."order_status" ADD VALUE 'pending_payment' BEFORE 'received';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'payment_rejected' BEFORE 'received';--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "quantity" SET DATA TYPE numeric(10, 3);--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "fcm_token" text;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "commission_rate" numeric(5, 2) DEFAULT '75.00';--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "fcm_token" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_receipt" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "commerce_settled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "driver_settled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "unit_type" varchar(20) DEFAULT 'unit' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "fcm_token" text;