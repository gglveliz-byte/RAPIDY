/**
 * ==============================================================================
 * ENRUTADOR DE PEDIDOS - PANEL ADMINISTRATIVO (ADMIN ORDERS ROUTER)
 * ==============================================================================
 * Maneja la gestión completa de pedidos para el administrador:
 * - Listado enriquecido con desglose contable dinámico multi-comercio
 * - Conciliación y liquidación (toggleCommerceSettled, toggleDriverSettled)
 * - Detalle exhaustivo de pedido (ítems, cliente, repartidor, comercios)
 * - Actualización de estado con soporte para "payment_rejected", liquidación
 *   automática de ganancias de repartidor al entregar y liberación de repartidores
 * - Asignación y reasignación forzosa segura de repartidores con emisión SSE
 * ==============================================================================
 */

import { z } from "zod";
import { eq, desc, inArray } from "drizzle-orm";
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

export const adminOrdersProcedures = {
  // Listado enriquecido de pedidos con desglose financiero multi-comercio
  orders: adminQuery.query(async () => {
    const db = getDb();
    const allOrders = await db.select().from(orders).orderBy(desc(orders.createdAt));

    const enrichedOrders = [];
    for (const order of allOrders) {
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
      
      let customerName = "";
      let customerPhone = order.customerPhone || "";
      if (order.customerId) {
        const cust = await db.select().from(customers).where(eq(customers.id, order.customerId));
        if (cust.length > 0) {
          customerName = `${cust[0].firstName} ${cust[0].lastName}`.trim();
          if (!customerPhone) customerPhone = cust[0].phone;
        }
      }

      let driverName = "";
      let driverCommissionRate = 75;
      if (order.driverId) {
        const drv = await db.select().from(drivers).where(eq(drivers.id, order.driverId));
        if (drv.length > 0) {
          driverName = drv[0].name;
          driverCommissionRate = parseFloat(drv[0].commissionRate || "75.00");
        }
      }

      // Soporte multi-comercio para cálculo de comisiones exacto por ítem
      let totalCommerceCommission = 0;
      let primaryCommerceName = "";
      if (items.length > 0) {
        const commerceIds = [...new Set(items.map((i) => i.commerceId))];
        const coms = await db
          .select()
          .from(commerces)
          .where(inArray(commerces.id, commerceIds));

        const commMap = new Map<number, { name: string; rate: number }>();
        coms.forEach((c) => {
          commMap.set(c.id, {
            name: c.name,
            rate: parseFloat(c.commissionRate || "10.00"),
          });
        });

        if (coms.length > 0) primaryCommerceName = coms[0].name;

        for (const item of items) {
          const itemTotal = parseFloat(item.total || "0");
          const cData = commMap.get(item.commerceId);
          const rate = cData ? cData.rate : 10;
          totalCommerceCommission += itemTotal * (rate / 100);
        }
      }

      const totalFee = parseFloat(order.deliveryFee || "0");
      const subtotal = parseFloat(order.subtotal || "0");

      const driverCut = totalFee * (driverCommissionRate / 100);
      const adminDeliveryCommission = totalFee - driverCut;

      let commerceOwed = 0;
      let commerceAction = "cobrar";
      let driverOwed = 0;
      let driverAction = "cobrar";

      if (order.paymentMethod === "transfer") {
        commerceOwed = subtotal - totalCommerceCommission;
        commerceAction = "pagar";
        driverOwed = driverCut;
        driverAction = "pagar";
      } else {
        commerceOwed = totalCommerceCommission;
        commerceAction = "cobrar";
        driverOwed = adminDeliveryCommission;
        driverAction = "cobrar";
      }

      enrichedOrders.push({
        ...order,
        items,
        customerName,
        customerPhone,
        driverName,
        commerceName: primaryCommerceName,
        commerceCommission: totalCommerceCommission.toFixed(2),
        commerceOwed: Math.max(0, commerceOwed).toFixed(2),
        commerceAction,
        driverOwed: Math.max(0, driverOwed).toFixed(2),
        driverAction,
      });
    }

    return enrichedOrders;
  }),

  // Alternar estado de liquidación de comercio
  toggleCommerceSettled: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const order = await db.select().from(orders).where(eq(orders.id, input.id));
      if (order.length === 0) return { success: false };
      await db
        .update(orders)
        .set({ commerceSettled: !order[0].commerceSettled, updatedAt: new Date() })
        .where(eq(orders.id, input.id));
      emit("admin:dashboard", { type: "dashboard_update" });
      return { success: true };
    }),

  // Alternar estado de liquidación de repartidor
  toggleDriverSettled: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const order = await db.select().from(orders).where(eq(orders.id, input.id));
      if (order.length === 0) return { success: false };
      await db
        .update(orders)
        .set({ driverSettled: !order[0].driverSettled, updatedAt: new Date() })
        .where(eq(orders.id, input.id));
      emit("admin:dashboard", { type: "dashboard_update" });
      return { success: true };
    }),

  // Detalle profundo de pedido para inspección del administrador
  orderDetail: adminQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const order = await db.select().from(orders).where(eq(orders.id, input.id));
      if (order.length === 0) return null;

      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, input.id));
      let customer = null;
      if (order[0].customerId) {
        const cust = await db.select().from(customers).where(eq(customers.id, order[0].customerId));
        if (cust.length > 0) customer = cust[0];
      }
      let driver = null;
      if (order[0].driverId) {
        const drv = await db.select().from(drivers).where(eq(drivers.id, order[0].driverId));
        if (drv.length > 0) {
          const { passwordHash: _, fcmToken: __, ...safeDriver } = drv[0];
          driver = safeDriver;
        }
      }

      const commerceIds = [...new Set(items.map((i) => i.commerceId))];
      const coms =
        commerceIds.length > 0
          ? await db
              .select()
              .from(commerces)
              .where(inArray(commerces.id, commerceIds))
          : [];

      return { ...order[0], items, customer, driver, commerces: coms };
    }),

  // Actualización integral de estado de pedido con contabilidad y sincronización
  updateOrderStatus: adminQuery
    .input(
      z.object({
        id: z.number(),
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
        driverId: z.number().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();

      const result = await db.transaction(async (tx) => {
        const existingOrder = await tx.select().from(orders).where(eq(orders.id, input.id)).for("update");
        if (!existingOrder[0]) throw new Error("Pedido no encontrado");

        const updateData: Partial<typeof orders.$inferInsert> = {
          status: input.status,
          updatedAt: new Date(),
        };
        if (input.driverId !== undefined) updateData.driverId = input.driverId;

        await tx.update(orders).set(updateData).where(eq(orders.id, input.id));

        // Sincronizar estados de comercio
        if (["preparing", "ready_for_pickup", "picked_up"].includes(input.status)) {
          await tx
            .update(orderCommerceStatus)
            .set({ status: input.status as any, updatedAt: new Date() })
            .where(eq(orderCommerceStatus.orderId, input.id));
        }

        // Historial de auditoría de estados
        await tx.insert(orderStatusHistory).values({
          orderId: input.id,
          status: input.status,
          notes: input.notes || `Estado actualizado a ${input.status} por el administrador`,
        });

        // Al asignar repartidor marcar como ocupado
        if (input.driverId) {
          await tx.update(drivers).set({ status: "busy" }).where(eq(drivers.id, input.driverId));
        }

        // Si se entrega el pedido, liberar al repartidor y calcular ganancias oficiales
        const targetDriverId = input.driverId || existingOrder[0].driverId;
        if (input.status === "delivered" && targetDriverId) {
          await tx.update(drivers).set({ status: "online" }).where(eq(drivers.id, targetDriverId));

          // Verificar si ya existe registro en driverEarnings
          const existingEarnings = await tx
            .select()
            .from(driverEarnings)
            .where(eq(driverEarnings.orderId, input.id));

          if (existingEarnings.length === 0) {
            const drv = await tx.select().from(drivers).where(eq(drivers.id, targetDriverId));
            const commRate = drv.length > 0 ? parseFloat(drv[0].commissionRate || "75.00") : 75;
            const deliveryFee = parseFloat(existingOrder[0].deliveryFee || "0");
            const earnedAmount = (deliveryFee * (commRate / 100)).toFixed(2);

            await tx.insert(driverEarnings).values({
              driverId: targetDriverId,
              orderId: input.id,
              amount: earnedAmount,
            });
          }
        }

        // Si se cancela el pedido, liberar al repartidor asignado
        if (input.status === "cancelled" && targetDriverId) {
          await tx.update(drivers).set({ status: "online" }).where(eq(drivers.id, targetDriverId));
        }

        const updated = await tx.select().from(orders).where(eq(orders.id, input.id));
        return updated[0];
      });

      // Notificaciones reactivas en tiempo real (SSE)
      if (input.status === "received") {
        const orderItemsList = await db.select().from(orderItems).where(eq(orderItems.orderId, input.id));
        const cIds = [...new Set(orderItemsList.map((i) => i.commerceId))];
        cIds.forEach((cId) => {
          emit(`commerce:${cId}`, { type: "new_order", orderId: input.id });
        });
      }

      emit(`order:${input.id}`, { type: "status_update", status: input.status, driverId: input.driverId });
      if (result.driverId) {
        emit(`driver:${result.driverId}`, { type: "order_assigned", orderId: input.id });
      }
      emit("admin:dashboard", { type: "dashboard_update" });
      return result;
    }),

  // Asignación y reasignación forzosa de repartidor
  assignDriver: adminQuery
    .input(
      z.object({
        orderId: z.number(),
        driverId: z.number(),
        forceReassign: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();

      let previousDriverId: number | null = null;
      const result = await db.transaction(async (tx) => {
        const orderResult = await tx
          .select()
          .from(orders)
          .where(eq(orders.id, input.orderId))
          .for("update");
        const order = orderResult[0];
        if (!order) throw new Error("Pedido no encontrado");

        if (order.driverId && order.driverId !== input.driverId) {
          if (!input.forceReassign) {
            throw new Error("El pedido ya tiene un repartidor asignado. Utilice reasignación forzosa.");
          }
          previousDriverId = order.driverId;
          // Liberar repartidor anterior
          await tx.update(drivers).set({ status: "online" }).where(eq(drivers.id, previousDriverId));
        }

        await tx
          .update(orders)
          .set({
            driverId: input.driverId,
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
        emit(`driver:${previousDriverId}`, { type: "order_unassigned", orderId: input.orderId });
      }
      emit(`driver:${input.driverId}`, { type: "order_assigned", orderId: input.orderId });
      emit(`order:${input.orderId}`, { type: "driver_assigned", driverId: input.driverId });
      emit("admin:dashboard", { type: "dashboard_update" });
      return result;
    }),
};
