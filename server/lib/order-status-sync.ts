import { and, eq, inArray } from "drizzle-orm";
import { orderCommerceStatus } from "@db/schema";

/**
 * Estados que se reflejan en la tabla por comercio.
 * Los estados de reparto (driver_assigned/picked_up/on_the_way/delivered)
 * se manejan en `orders.status` y, para el retiro, en `order_commerce_status`.
 */
const KITCHEN_STATUSES = new Set([
  "pending_payment",
  "payment_rejected",
  "received",
  "accepted",
  "preparing",
  "ready_for_pickup",
  "cancelled",
]);

export async function syncAllCommerceStatuses(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  orderId: number,
  status: string,
): Promise<void> {
  if (!KITCHEN_STATUSES.has(status)) return;
  await tx
    .update(orderCommerceStatus)
    .set({ status, updatedAt: new Date() })
    .where(eq(orderCommerceStatus.orderId, orderId));
}

export async function syncCommerceStatuses(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  orderId: number,
  commerceIds: number[],
  status: string,
): Promise<void> {
  if (!KITCHEN_STATUSES.has(status) || commerceIds.length === 0) return;
  await tx
    .update(orderCommerceStatus)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(orderCommerceStatus.orderId, orderId),
        inArray(orderCommerceStatus.commerceId, commerceIds),
      ),
    );
}