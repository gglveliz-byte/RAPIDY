import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "../queries/connection";
import {
  drivers,
  orderCommerceStatus,
  orderItems,
  orderStatusHistory,
  orders,
} from "@db/schema";
import { emit } from "../events";

/** Estados desde los que un comercio puede declarar su parte lista. */
const READY_ALLOWED = new Set(["received", "accepted", "preparing"]);

export interface MarkReadyResult {
  allReady: boolean;
  changed: boolean;
  statusChanged: boolean;
}

/**
 * Marca la parte de un comercio como lista, de forma atómica e idempotente.
 *
 * Reglas:
 * - El pedido debe existir y el comercio debe tener items en él.
 * - Solo se permite desde received/accepted/preparing.
 * - Nunca se permite desde cancelled, delivered, payment_rejected, pending_payment
 *   ni estados posteriores al retiro.
 * - El paso global a ready_for_pickup solo ocurre cuando TODOS los comercios
 *   con items tienen su fila en ready_for_pickup.
 * - Los eventos se emiten fuera de la transacción y solo si hubo cambio real.
 */
export async function markCommerceReadyForOrder(
  orderId: number,
  commerceId: number,
): Promise<MarkReadyResult> {
  const db = getDb();

  const item = await db
    .select({ id: orderItems.id })
    .from(orderItems)
    .where(and(eq(orderItems.orderId, orderId), eq(orderItems.commerceId, commerceId)))
    .limit(1);
  if (item.length === 0) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Este comercio no tiene productos en el pedido.",
    });
  }

  const result = await db.transaction(async (tx) => {
    // Bloquea el pedido para serializar dos comercios marcando listo a la vez.
    const orderRows = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .for("update")
      .limit(1);
    const order = orderRows[0];
    if (!order) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Pedido no encontrado" });
    }

    if (order.status === "ready_for_pickup") {
      const currentRows = await tx
        .select()
        .from(orderCommerceStatus)
        .where(
          and(
            eq(orderCommerceStatus.orderId, orderId),
            eq(orderCommerceStatus.commerceId, commerceId),
          ),
        )
        .limit(1);
      if (currentRows[0]?.status === "ready_for_pickup") {
        return { allReady: true, changed: false, statusChanged: false } satisfies MarkReadyResult;
      }
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "El pedido ya está listo y este comercio no tiene un estado consistente.",
      });
    }

    if (!READY_ALLOWED.has(order.status)) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "El pedido no está en un estado que permita marcarlo listo.",
      });
    }

    const previousRows = await tx
      .select()
      .from(orderCommerceStatus)
      .where(
        and(
          eq(orderCommerceStatus.orderId, orderId),
          eq(orderCommerceStatus.commerceId, commerceId),
        ),
      )
      .limit(1);

    if (previousRows[0]?.status === "ready_for_pickup") {
      return { allReady: false, changed: false, statusChanged: false } satisfies MarkReadyResult;
    }

    await tx
      .insert(orderCommerceStatus)
      .values({
        orderId,
        commerceId,
        status: "ready_for_pickup",
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [orderCommerceStatus.orderId, orderCommerceStatus.commerceId],
        set: { status: "ready_for_pickup", updatedAt: new Date() },
      });

    const statuses = await tx
      .select()
      .from(orderCommerceStatus)
      .where(eq(orderCommerceStatus.orderId, orderId));

    const commerceIds = await tx
      .selectDistinct({ commerceId: orderItems.commerceId })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));

    const allReady =
      commerceIds.length > 0 &&
      commerceIds.every((row) =>
        statuses.some(
          (status) =>
            status.commerceId === row.commerceId && status.status === "ready_for_pickup",
        ),
      );

    let statusChanged = false;
    if (allReady) {
      await tx
        .update(orders)
        .set({ status: "ready_for_pickup", updatedAt: new Date() })
        .where(eq(orders.id, orderId));
      await tx.insert(orderStatusHistory).values({
        orderId,
        status: "ready_for_pickup",
        notes: "Todos los comercios listos para retirar",
      });
      statusChanged = true;
    }

    return { allReady, changed: true, statusChanged } satisfies MarkReadyResult;
  });

  if (result.changed) {
    emit(`commerce:${commerceId}`, { type: "commerce_ready", orderId });
    emit(`order:${orderId}`, { type: "commerce_ready", commerceId });
    emit("admin:dashboard", { type: "dashboard_update" });
  }

  if (result.statusChanged) {
    emit(`order:${orderId}`, { type: "status_update", status: "ready_for_pickup" });
    const onlineDrivers = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.status, "online"));
    onlineDrivers.forEach((driver) => {
      emit(`driver:${driver.id}`, { type: "new_available", orderId });
    });
  }

  return result;
}

/** Helper de compatibilidad para callers que solo necesitan allReady. */
export async function markReadyForOrder(orderId: number, commerceId: number) {
  const result = await markCommerceReadyForOrder(orderId, commerceId);
  return { allReady: result.allReady };
}