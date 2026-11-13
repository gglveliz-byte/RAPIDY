ALTER TYPE "public"."order_commerce_status_enum" ADD VALUE 'pending_payment' BEFORE 'preparing';--> statement-breakpoint
ALTER TYPE "public"."order_commerce_status_enum" ADD VALUE 'payment_rejected' BEFORE 'preparing';--> statement-breakpoint
ALTER TYPE "public"."order_commerce_status_enum" ADD VALUE 'received' BEFORE 'preparing';--> statement-breakpoint
ALTER TYPE "public"."order_commerce_status_enum" ADD VALUE 'accepted' BEFORE 'preparing';--> statement-breakpoint
ALTER TYPE "public"."order_commerce_status_enum" ADD VALUE 'cancelled';--> statement-breakpoint
ALTER TABLE "order_commerce_status" ALTER COLUMN "status" SET DEFAULT 'received';--> statement-breakpoint
ALTER TABLE "order_commerce_status" ADD COLUMN "commission_amount" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "order_items_commerce_order_idx" ON "order_items" USING btree ("commerce_id","order_id");--> statement-breakpoint
CREATE INDEX "orders_delivered_at_idx" ON "orders" USING btree ("delivered_at");