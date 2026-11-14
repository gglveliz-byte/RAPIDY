/**
 * ==============================================================================
 * ENRUTADOR DE PEDIDOS - PANEL ADMINISTRATIVO (ADMIN ORDERS ROUTER)
 * ==============================================================================
 * Maneja la gestión completa de pedidos para el administrador:
 * - Listado paginado con desglose contable por comercio (sin N+1 ni comprobantes)
 * - Conciliación y liquidación por comercio + liquidación de repartidor
 * - Detalle exhaustivo de pedido (ítems, cliente, repartidor, comercios)
 * - Actualización de estado con transiciones seguras y ganancias idempotentes
 * - Asignación y reasignación forzosa con validación de capacidad del driver
 * ==============================================================================
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, desc, inArray, and, sql } from "drizzle-orm";
import { getDb } from "../queries/connection";
import {
  orders,
  orderItems,
  customers,
  drivers,
  commerces,
  orderStatusHistory,
  orderCommerceStatus,
  driverEarnings,
} from "@db/schema";
import { adminQuery } from "../middleware";
import { emit } from "../events";
import { syncAllCommerceStatuses } from "../lib/order-status-sync";
import { guayaquilDateKey } from "../lib/dates";

const ACTIVE_ORDER_STATUSES = [
  "driver_assigned",
  "ready_for_pickup",
  "picked_up",
  "on_the_way",
] as const;

async function driverHasOtherActiveOrders(
  tx: any,
  driverId: number,
  excludeOrderId: number,
) {
  const rows = await tx
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.driverId, driverId),
        inArray(orders.status, [...ACTIVE_ORDER_STATUSES]),
        sql`${orders.id} <> ${excludeOrderId}`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export const adminOrdersProcedures = {
  // Listado paginado con desglose financiero multi-comercio.
  orders: adminQuery
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(200).default(100),
          offset: z.number().int().min(0).default(0),
        })
        .default({ limit: 100, offset: 0 }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const page = await db
        .select()
        .from(orders)
        .orderBy(desc(orders.id))
        .limit(input.limit)
        .offset(input.offset);
      if (page.length === 0) return [];

      const orderIds = page.map((order) => order.id);
      const [items, statuses, earnings] = await Promise.all([
        db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds)),
        db
          .select()
          .from(orderCommerceStatus)
          .where(inArray(orderCommerceStatus.orderId, orderIds)),
        db
          .select({
            orderId: driverEarnings.orderId,
            amount: driverEarnings.amount,
            type: driverEarnings.type,
          })
          .from(driverEarnings)
          .where(inArray(driverEarnings.orderId, orderIds)),
      ]);

      const customerIds = [...new Set(page.map((order) => order.customerId))];
      const driverIds = [
        ...new Set(page.map((order) => order.driverId).filter((id): id is number => id !== null)),
      ];
      const commerceIds = [...new Set(items.map((item) => item.commerceId))];

      const [customerRows, driverRows, commerceRows] = await Promise.all([
        db
          .select({
            id: customers.id,
            firstName: customers.firstName,
            lastName: customers.lastName,
            phone: customers.phone,
          })
          .from(customers)
          .where(inArray(customers.id, customerIds)),
        driverIds.length
          ? db
              .select({
                id: drivers.id,
                name: drivers.name,
                commissionRate: drivers.commissionRate,
              })
              .from(drivers)
              .where(inArray(drivers.id, driverIds))
          : [],
        commerceIds.length
          ? db
              .select({
                id: commerces.id,
                name: commerces.name,
                commissionRate: commerces.commissionRate,
              })
              .from(commerces)
              .where(inArray(commerces.id, commerceIds))
          : [],
      ]);

      const itemsByOrder = new Map<number, typeof items>();
      for (const item of items) {
        if (!itemsByOrder.has(item.orderId)) itemsByOrder.set(item.orderId, []);
        itemsByOrder.get(item.orderId)!.push(item);
      }
      const statusByKey = new Map(
        statuses.map((status) => [`${status.orderId}:${status.commerceId}`, status]),
      );
      const customerMap = new Map(customerRows.map((customer) => [customer.id, customer]));
      const driverMap = new Map(driverRows.map((driver) => [driver.id, driver]));
      const commerceMap = new Map(commerceRows.map((commerce) => [commerce.id, commerce]));
      const earningMap = new Map(
        earnings
          .filter((earning) => earning.type === "delivery_fee")
          .map((earning) => [earning.orderId, Number(earning.amount)]),
      );

      return page.map((order) => {
        const orderItemsList = itemsByOrder.get(order.id) ?? [];
        const customer = customerMap.get(order.customerId);
        const driver = order.driverId ? driverMap.get(order.driverId) : undefined;

        const grouped = new Map<number, { commerceId: number; total: number }>();
        for (const item of orderItemsList) {
          const current = grouped.get(item.commerceId) ?? {
            commerceId: item.commerceId,
            total: 0,
          };
          current.total += Number(item.total || 0);
          grouped.set(item.commerceId, current);
        }

        const commerceSettlements = [...grouped.values()].map((group) => {
          const commerce = commerceMap.get(group.commerceId);
          const status = statusByKey.get(`${order.id}:${group.commerceId}`);
          const rate = Number(commerce?.commissionRate ?? "10");
          const commission =
            status?.commissionAmount !== null && status?.commissionAmount !== undefined
              ? Number(status.commissionAmount)
              : group.total * (rate / 100);
          const owed =
            order.paymentMethod === "transfer" ? group.total - commission : commission;
          return {
            commerceId: group.commerceId,
            commerceName: commerce?.name || `Comercio #${group.commerceId}`,
            totalSales: Number(group.total.toFixed(2)),
            commission: Number(commission.toFixed(2)),
            owed: Number(Math.max(0, owed).toFixed(2)),
            action: order.paymentMethod === "transfer" ? "pagar" : "cobrar",
            settledAt: status?.settledAt ?? null,
            settled: Boolean(status?.settledAt),
          };
        });

        const totalCommerceCommission = commerceSettlements.reduce(
          (sum, settlement) => sum + settlement.commission,
          0,
        );
        const totalFee = Number(order.deliveryFee || 0);
        const storedDriverEarning = earningMap.get(order.id);
        const driverCut =
          storedDriverEarning !== undefined
            ? storedDriverEarning
            : totalFee * (Number(driver?.commissionRate ?? "75") / 100);
        const adminDeliveryCommission = totalFee - driverCut;
        const isTransfer = order.paymentMethod === "transfer";
        const commerceSettled =
          commerceSettlements.length > 0 &&
          commerceSettlements.every((settlement) => settlement.settled);

        return {
          id: order.id,
          customerId: order.customerId,
          driverId: order.driverId,
          status: order.status,
          subtotal: order.subtotal,
          deliveryFee: order.deliveryFee,
          commission: order.commission,
          total: order.total,
          paymentMethod: order.paymentMethod,
          deliveryAddress: order.deliveryAddress,
          customerPhone: order.customerPhone || customer?.phone || "",
          notes: order.notes,
          commerceSettled,
          driverSettled: order.driverSettled,
          cancellationReason: order.cancellationReason,
          cancelledBy: order.cancelledBy,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
          deliveredAt: order.deliveredAt,
          customerName: customer
            ? `${customer.firstName} ${customer.lastName}`.trim()
            : "",
          driverName: driver?.name || "",
          commerceName:
            commerceSettlements[0]?.commerceName || "",
          commerceCommission: totalCommerceCommission.toFixed(2),
          commerceOwed: Math.max(
            0,
            isTransfer
              ? Number(order.subtotal) - totalCommerceCommission
              : totalCommerceCommission,
          ).toFixed(2),
          commerceAction: isTransfer ? "pagar" : "cobrar",
          driverOwed: Math.max(
            0,
            isTransfer ? driverCut : adminDeliveryCommission,
          ).toFixed(2),
          driverAction: isTransfer ? "pagar" : "cobrar",
          commerceSettlements,
        };
      });
    }),

  // Alternar liquidación por comercio. Sin commerceId se concilia el pedido completo.
  toggleCommerceSettled: adminQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        commerceId: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const result = await db.transaction(async (tx) => {
        const orderRows = await tx
          .select()
          .from(orders)
          .where(eq(orders.id, input.id))
          .for("update");
        const order = orderRows[0];
        if (!order) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Pedido no encontrado" });
        }
        if (order.status !== "delivered") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Solo se liquidan pedidos entregados.",
          });
        }

        const rows = await tx
          .select()
          .from(orderCommerceStatus)
          .where(eq(orderCommerceStatus.orderId, input.id));
        if (rows.length === 0) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "El pedido no tiene comercios para liquidar.",
          });
        }

        if (input.commerceId) {
          const target = rows.find((row) => row.commerceId === input.commerceId);
          if (!target) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "El comercio no participa en este pedido.",
            });
          }
          await tx
            .update(orderCommerceStatus)
            .set({ settledAt: target.settledAt ? null : new Date() })
            .where(
              and(
                eq(orderCommerceStatus.orderId, input.id),
                eq(orderCommerceStatus.commerceId, input.commerceId),
              ),
            );
        } else {
          const allSettled = rows.every((row) => row.settledAt !== null);
          await tx
            .update(orderCommerceStatus)
            .set({ settledAt: allSettled ? null : new Date() })
            .where(eq(orderCommerceStatus.orderId, input.id));
        }

        const updatedRows = await tx
          .select()
          .from(orderCommerceStatus)
          .where(eq(orderCommerceStatus.orderId, input.id));
        const commerceSettled = updatedRows.every((row) => row.settledAt !== null);
        await tx
          .update(orders)
          .set({ commerceSettled })
          .where(eq(orders.id, input.id));

        return {
          commerceSettled,
          settlements: updatedRows.map((row) => ({
            commerceId: row.commerceId,
            settledAt: row.settledAt,
            settled: Boolean(row.settledAt),
          })),
        };
      });

      emit("admin:dashboard", { type: "dashboard_update" });
      return { success: true, ...result };
    }),

  // Alternar estado de liquidación de repartidor.
  toggleDriverSettled: adminQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const result = await db.transaction(async (tx) => {
        const rows = await tx
          .select()
          .from(orders)
          .where(eq(orders.id, input.id))
          .for("update");
        const order = rows[0];
        if (!order) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Pedido no encontrado" });
        }
        if (order.status !== "delivered") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Solo se liquidan pedidos entregados.",
          });
        }
        const driverSettled = !order.driverSettled;
        await tx.update(orders).set({ driverSettled }).where(eq(orders.id, input.id));
        return { driverSettled };
      });
      emit("admin:dashboard", { type: "dashboard_update" });
      return { success: true, ...result };
    }),

  // Detalle profundo de pedido para inspección del administrador.
  orderDetail: adminQuery
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = getDb();
      const orderRows = await db.select().from(orders).where(eq(orders.id, input.id));
      const order = orderRows[0];
      if (!order) return null;

      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, input.id));
      const customerRows = order.customerId
        ? await db.select().from(customers).where(eq(customers.id, order.customerId))
        : [];
      const driverRows = order.driverId
        ? await db.select().from(drivers).where(eq(drivers.id, order.driverId))
        : [];
      const commerceIds = [...new Set(items.map((item) => item.commerceId))];
      const coms = commerceIds.length
        ? await db
            .select()
            .from(commerces)
            .where(inArray(commerces.id, commerceIds))
        : [];
      const statuses = await db
        .select()
        .from(orderCommerceStatus)
        .where(eq(orderCommerceStatus.orderId, input.id));

      const driver = driverRows[0]
        ? (() => {
            const { passwordHash: _passwordHash, fcmToken: _fcmToken, ...safe } = driverRows[0];
            return safe;
          })()
        : null;
      const { idempotencyKey: _idempotencyKey, ...safeOrder } = order;

      return {
        ...safeOrder,
        items,
        customer: customerRows[0] ?? null,
        driver,
        commerces: coms,
        commerceStatuses: statuses,
      };
    }),

  // Actualización integral de estado con transiciones seguras e idempotencia.
  updateOrderStatus: adminQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        status: z.enum([
          "pending_payment",
          "payment_rejected",
          "received",
          "accepted",
          "preparing",
          "ready_for_pickup",
          "driver_assigned",
          "picked_up",
          "on_the_way",
          "delivered",
          "cancelled",
        ]),
        driverId: z.number().int().positive().optional(),
        notes: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();

      const result = await db.transaction(async (tx) => {
        const existingOrder = await tx
          .select()
          .from(orders)
          .where(eq(orders.id, input.id))
          .for("update");
        const current = existingOrder[0];
        if (!current) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Pedido no encontrado" });
        }

        // Repetir el mismo estado es un no-op: no reescribe delivered_at,
        // no crea historial duplicado y no mueve dinero.
        if (current.status === input.status) {
          return { order: current, changed: false, targetDriverId: current.driverId };
        }

        if (["delivered", "cancelled"].includes(current.status)) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Un pedido entregado o cancelado es terminal y no se puede cambiar.",
          });
        }

        if (input.driverId !== undefined && current.status === "delivered") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "No se puede cambiar el repartidor de un pedido entregado.",
          });
        }

        const commerceRows = await tx
          .select({ commerceId: orderItems.commerceId })
          .from(orderItems)
          .where(eq(orderItems.orderId, input.id));
        const commerceIds = [...new Set(commerceRows.map((row) => row.commerceId))];
        const statusRows = await tx
          .select()
          .from(orderCommerceStatus)
          .where(eq(orderCommerceStatus.orderId, input.id));
        const pickedUp = new Set(current.pickedUpCommerceIds ?? []);

        if (input.status === "picked_up") {
          const allReady = commerceIds.every((commerceId) => {
            const row = statusRows.find((status) => status.commerceId === commerceId);
            return row?.status === "ready_for_pickup" || row?.status === "picked_up";
          });
          if (!allReady) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: "Todos los comercios deben estar listos antes de marcar el retiro.",
            });
          }
          if (input.driverId === undefined && !current.driverId) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: "Asigna un repartidor antes de marcar el retiro.",
            });
          }
        }

        if (input.status === "on_the_way" && current.status !== "picked_up") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "El pedido debe estar retirado antes de salir en camino.",
          });
        }

        if (input.status === "delivered") {
          if (current.status !== "on_the_way") {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: "El pedido debe estar en camino antes de marcarlo entregado.",
            });
          }
          const allPicked =
            commerceIds.length > 0 &&
            commerceIds.every((commerceId) => pickedUp.has(commerceId));
          if (!allPicked) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message:
                "No se puede entregar: falta el retiro por comercio en el checklist.",
            });
          }
          if (input.driverId !== undefined && input.driverId !== current.driverId) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: "No se puede cambiar el repartidor al entregar el pedido.",
            });
          }
        }

        const targetDriverId = input.driverId ?? current.driverId;
        let assignedCommissionRate: string | null = null;

        // Si se asigna o reasigna, el driver debe existir, estar online y no
        // tener otro pedido activo.
        if (input.driverId !== undefined && input.driverId !== current.driverId) {
          const driverRows = await tx
            .select()
            .from(drivers)
            .where(eq(drivers.id, input.driverId))
            .for("update");
          const driver = driverRows[0];
          if (!driver) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Repartidor no encontrado" });
          }
          if (driver.status === "offline") {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: "El repartidor está desconectado.",
            });
          }
          assignedCommissionRate = driver.commissionRate;
          if (await driverHasOtherActiveOrders(tx, driver.id, input.id)) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "El repartidor ya tiene otro pedido activo.",
            });
          }
          if (current.driverId) {
            const previousHasOther = await driverHasOtherActiveOrders(
              tx,
              current.driverId,
              input.id,
            );
            if (!previousHasOther) {
              await tx
                .update(drivers)
                .set({ status: "online" })
                .where(eq(drivers.id, current.driverId));
            }
          }
          await tx.update(drivers).set({ status: "busy" }).where(eq(drivers.id, driver.id));
        }

        const updateData: Partial<typeof orders.$inferInsert> = {
          status: input.status,
          updatedAt: new Date(),
        };
        if (input.status === "delivered" && !current.deliveredAt) {
          updateData.deliveredAt = new Date();
        }
        if (input.driverId !== undefined) updateData.driverId = input.driverId;
        if (assignedCommissionRate !== null) {
          updateData.driverCommissionRate = assignedCommissionRate;
        }
        if (input.status === "picked_up") {
          updateData.pickedUpCommerceIds = commerceIds;
        }

        await tx.update(orders).set(updateData).where(eq(orders.id, input.id));

        await syncAllCommerceStatuses(tx, input.id, input.status);
        if (input.status === "picked_up") {
          await tx
            .update(orderCommerceStatus)
            .set({ status: "picked_up", updatedAt: new Date() })
            .where(eq(orderCommerceStatus.orderId, input.id));
        }

        await tx.insert(orderStatusHistory).values({
          orderId: input.id,
          status: input.status,
          notes: input.notes || `Estado actualizado a ${input.status} por el administrador`,
        });

        if (input.status === "delivered" && targetDriverId) {
          const stillActive = await driverHasOtherActiveOrders(tx, targetDriverId, input.id);
          if (!stillActive) {
            await tx
              .update(drivers)
              .set({ status: "online" })
              .where(eq(drivers.id, targetDriverId));
          }

          const existingEarnings = await tx
            .select()
            .from(driverEarnings)
            .where(
              and(
                eq(driverEarnings.orderId, input.id),
                eq(driverEarnings.type, "delivery_fee"),
              ),
            );
          if (existingEarnings.length === 0) {
            const drv = await tx.select().from(drivers).where(eq(drivers.id, targetDriverId));
            const commRate = Number(
              current.driverCommissionRate ?? drv[0]?.commissionRate ?? "75",
            );
            const deliveryFee = Number(current.deliveryFee || 0);
            const earnedAmount = (deliveryFee * (commRate / 100)).toFixed(2);

            await tx
              .insert(driverEarnings)
              .values({
                driverId: targetDriverId,
                orderId: input.id,
                amount: earnedAmount,
                date: guayaquilDateKey(),
              })
              .onConflictDoNothing();
          }
        }

        if (input.status === "cancelled" && targetDriverId) {
          const stillActive = await driverHasOtherActiveOrders(tx, targetDriverId, input.id);
          if (!stillActive) {
            await tx
              .update(drivers)
              .set({ status: "online" })
              .where(eq(drivers.id, targetDriverId));
          }
        }

        const updated = await tx.select().from(orders).where(eq(orders.id, input.id));
        return { order: updated[0], changed: true, targetDriverId };
      });

      if (result.changed) {
        const orderItemsList = await db
          .select({ commerceId: orderItems.commerceId })
          .from(orderItems)
          .where(eq(orderItems.orderId, input.id));
        const cIds = [...new Set(orderItemsList.map((item) => item.commerceId))];
        cIds.forEach((commerceId) => {
          emit(`commerce:${commerceId}`, {
            type: input.status === "received" ? "new_order" : "order_status",
            orderId: input.id,
            status: input.status,
          });
        });

        emit(`order:${input.id}`, {
          type: "status_update",
          status: input.status,
          driverId: result.targetDriverId ?? undefined,
        });
        if (result.targetDriverId) {
          emit(`driver:${result.targetDriverId}`, {
            type: input.status === "driver_assigned" ? "order_assigned" : "order_status",
            orderId: input.id,
            status: input.status,
          });
        }
        emit("admin:dashboard", { type: "dashboard_update" });
      }

      const { paymentReceipt: _receipt, idempotencyKey: _key, ...safeOrder } = result.order;
      return safeOrder;
    }),

  // Asignación y reasignación forzosa con capacidad validada.
  assignDriver: adminQuery
    .input(
      z.object({
        orderId: z.number().int().positive(),
        driverId: z.number().int().positive(),
        forceReassign: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();

      let previousDriverId: number | null = null;
      const result = await db.transaction(async (tx) => {
        const driverRows = await tx
          .select()
          .from(drivers)
          .where(eq(drivers.id, input.driverId))
          .for("update");
        const driver = driverRows[0];
        if (!driver) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Repartidor no encontrado" });
        }
        if (driver.status === "offline") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "El repartidor está desconectado. Actívalo antes de asignarlo.",
          });
        }
        if (await driverHasOtherActiveOrders(tx, driver.id, input.orderId)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "El repartidor ya tiene otro pedido activo.",
          });
        }

        const orderResult = await tx
          .select()
          .from(orders)
          .where(eq(orders.id, input.orderId))
          .for("update");
        const order = orderResult[0];
        if (!order) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Pedido no encontrado" });
        }
        if (["delivered", "cancelled", "picked_up", "on_the_way"].includes(order.status)) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "No se puede asignar o reasignar un pedido terminal o ya retirado.",
          });
        }
        if (!["ready_for_pickup", "driver_assigned"].includes(order.status)) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "El pedido debe estar listo para retirar antes de asignar un repartidor.",
          });
        }

        if (order.driverId && order.driverId !== input.driverId) {
          if (!input.forceReassign) {
            throw new TRPCError({
              code: "CONFLICT",
              message:
                "El pedido ya tiene un repartidor asignado. Utiliza la reasignación forzosa.",
            });
          }
          previousDriverId = order.driverId;
          const previousHasOther = await driverHasOtherActiveOrders(
            tx,
            previousDriverId,
            input.orderId,
          );
          if (!previousHasOther) {
            await tx
              .update(drivers)
              .set({ status: "online" })
              .where(eq(drivers.id, previousDriverId));
          }
        }

        await tx
          .update(orders)
          .set({
            driverId: input.driverId,
            driverCommissionRate: driver.commissionRate,
            status: "driver_assigned",
            updatedAt: new Date(),
          })
          .where(eq(orders.id, input.orderId));

        await tx.insert(orderStatusHistory).values({
          orderId: input.orderId,
          status: "driver_assigned",
          notes: previousDriverId
            ? `Reasignado por admin de repartidor #${previousDriverId} a #${input.driverId}`
            : "Repartidor asignado por admin",
        });

        await tx.update(drivers).set({ status: "busy" }).where(eq(drivers.id, input.driverId));

        const updated = await tx.select().from(orders).where(eq(orders.id, input.orderId));
        return updated[0];
      });

      if (previousDriverId) {
        emit(`driver:${previousDriverId}`, {
          type: "order_unassigned",
          orderId: input.orderId,
        });
      }
      emit(`driver:${input.driverId}`, { type: "order_assigned", orderId: input.orderId });
      emit(`order:${input.orderId}`, { type: "driver_assigned", driverId: input.driverId });

      const commerceRows = await db
        .select({ commerceId: orderItems.commerceId })
        .from(orderItems)
        .where(eq(orderItems.orderId, input.orderId));
      for (const commerceId of new Set(commerceRows.map((row) => row.commerceId))) {
        emit(`commerce:${commerceId}`, {
          type: "order_status",
          orderId: input.orderId,
          status: "driver_assigned",
        });
      }
      emit("admin:dashboard", { type: "dashboard_update" });

      const { paymentReceipt: _receipt, idempotencyKey: _key, ...safeOrder } = result;
      return safeOrder;
    }),
};