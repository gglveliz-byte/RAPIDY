/**
 * ==============================================================================
 * ENRUTADOR DE CONFIGURACIÓN Y REPORTES - PANEL ADMIN (ADMIN SETTINGS ROUTER)
 * ==============================================================================
 * Gestiona los parámetros operativos de la plataforma y el generador de reportes:
 * - settings: Lectura de variables del sistema (comisiones, datos bancarios, etc.)
 * - updateSetting: Mutación individual atómica de configuración
 * - updateSettingsBulk: Mutación masiva transaccional de configuración
 * - getReports: Exportación estructurada de auditoría contable y operacional
 * ==============================================================================
 */

import { z } from "zod";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { getDb } from "../queries/connection";
import {
  appSettings,
  orders,
  orderItems,
  commerces,
  drivers,
  driverEarnings,
} from "@db/schema";
import { adminQuery } from "../middleware";
import { emit } from "../events";

export const adminSettingsProcedures = {
  // Lectura de todas las configuraciones del sistema
  settings: adminQuery.query(async () => {
    const db = getDb();
    return db.select().from(appSettings);
  }),

  // Actualización individual de una clave de configuración
  updateSetting: adminQuery
    .input(z.object({ key: z.string(), value: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const existing = await db.select().from(appSettings).where(eq(appSettings.key, input.key));
      if (existing.length > 0) {
        await db
          .update(appSettings)
          .set({ value: input.value, updatedAt: new Date() })
          .where(eq(appSettings.key, input.key));
      } else {
        await db
          .insert(appSettings)
          .values({ key: input.key, value: input.value, updatedAt: new Date() });
      }
      emit("admin:dashboard", { type: "settings_update" });
      return { success: true };
    }),

  // Actualización transaccional masiva de múltiples configuraciones simultáneas
  updateSettingsBulk: adminQuery
    .input(
      z.object({
        settings: z.array(z.object({ key: z.string(), value: z.string() })),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.transaction(async (tx) => {
        for (const item of input.settings) {
          const existing = await tx.select().from(appSettings).where(eq(appSettings.key, item.key));
          if (existing.length > 0) {
            await tx
              .update(appSettings)
              .set({ value: item.value, updatedAt: new Date() })
              .where(eq(appSettings.key, item.key));
          } else {
            await tx
              .insert(appSettings)
              .values({ key: item.key, value: item.value, updatedAt: new Date() });
          }
        }
      });
      emit("admin:dashboard", { type: "settings_update" });
      return { success: true };
    }),

  // Generador analítico de reportes para exportación y auditoría administrativa
  getReports: adminQuery
    .input(
      z.object({
        type: z.enum(["sales", "orders", "commerces", "drivers", "earnings", "commissions"]),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const dateFrom = input.startDate ? new Date(input.startDate) : undefined;
      const dateTo = input.endDate ? new Date(input.endDate + "T23:59:59") : undefined;

      const withDate =
        dateFrom || dateTo
          ? and(
              dateFrom ? gte(orders.createdAt, dateFrom) : undefined,
              dateTo ? lte(orders.createdAt, dateTo) : undefined
            )
          : undefined;

      // Reporte de Ventas
      if (input.type === "sales") {
        const all = await db
          .select({
            date: sql<string>`${orders.createdAt}::date`,
            orders: sql<number>`count(*)`,
            revenue: sql<string>`sum(${orders.total})`,
            commission: sql<string>`sum(${orders.commission})`,
          })
          .from(orders)
          .where(and(withDate, sql`${orders.status} NOT IN ('cancelled', 'payment_rejected')`))
          .groupBy(sql`${orders.createdAt}::date`)
          .orderBy(sql`${orders.createdAt}::date`);

        return {
          type: "sales",
          generatedAt: new Date().toISOString(),
          columns: ["Fecha", "Pedidos", "Ingresos", "Comisiones"],
          rows: all.map((r: { date: string; orders: number; revenue: string | null; commission: string | null }) => ({
            Fecha: r.date,
            Pedidos: r.orders,
            Ingresos: parseFloat(r.revenue || "0").toFixed(2),
            Comisiones: parseFloat(r.commission || "0").toFixed(2),
          })),
        };
      }

      // Reporte de Pedidos
      if (input.type === "orders") {
        const all = await db
          .select()
          .from(orders)
          .where(withDate)
          .orderBy(desc(orders.createdAt));

        return {
          type: "orders",
          generatedAt: new Date().toISOString(),
          columns: ["ID", "Estado", "Total", "Metodo Pago", "Direccion", "Telefono", "Fecha"],
          rows: all.map((r) => ({
            ID: r.id,
            Estado: r.status,
            Total: parseFloat(r.total).toFixed(2),
            "Metodo Pago": r.paymentMethod,
            Direccion: r.deliveryAddress,
            Telefono: r.customerPhone || "-",
            Fecha: r.createdAt?.toISOString().split("T")[0],
          })),
        };
      }

      // Reporte de Comercios
      if (input.type === "commerces") {
        const items =
          dateFrom || dateTo
            ? await db
                .select({
                  commerceId: orderItems.commerceId,
                  orders: sql<number>`count(distinct ${orderItems.orderId})`,
                  revenue: sql<string>`sum(${orderItems.total})`,
                })
                .from(orderItems)
                .innerJoin(orders, eq(orderItems.orderId, orders.id))
                .where(and(withDate, sql`${orders.status} NOT IN ('cancelled', 'payment_rejected')`))
                .groupBy(orderItems.commerceId)
            : await db
                .select({
                  commerceId: orderItems.commerceId,
                  orders: sql<number>`count(distinct ${orderItems.orderId})`,
                  revenue: sql<string>`sum(${orderItems.total})`,
                })
                .from(orderItems)
                .innerJoin(orders, eq(orderItems.orderId, orders.id))
                .where(sql`${orders.status} NOT IN ('cancelled', 'payment_rejected')`)
                .groupBy(orderItems.commerceId);

        const comms = await db
          .select({ id: commerces.id, name: commerces.name, status: commerces.status })
          .from(commerces);
        const map = new Map(comms.map((c) => [c.id, c]));

        return {
          type: "commerces",
          generatedAt: new Date().toISOString(),
          columns: ["Comercio", "Pedidos", "Ingresos", "Estado"],
          rows: items.map((r: { commerceId: number; orders: number; revenue: string | null }) => {
            const c = map.get(r.commerceId);
            return {
              Comercio: c?.name || "-",
              Pedidos: r.orders,
              Ingresos: parseFloat(r.revenue || "0").toFixed(2),
              Estado: c?.status || "-",
            };
          }),
        };
      }

      // Reporte de Repartidores
      if (input.type === "drivers") {
        const revDriverId = sql<number>`${orders.driverId}`;
        const stats =
          dateFrom || dateTo
            ? await db
                .select({ driverId: revDriverId, deliveries: sql<number>`count(*)` })
                .from(orders)
                .where(and(eq(orders.status, "delivered"), withDate))
                .groupBy(revDriverId)
            : await db
                .select({ driverId: revDriverId, deliveries: sql<number>`count(*)` })
                .from(orders)
                .where(eq(orders.status, "delivered"))
                .groupBy(revDriverId);

        const d = await db
          .select({
            id: drivers.id,
            name: drivers.name,
            phone: drivers.phone,
            rating: drivers.rating,
            totalEarnings: drivers.totalEarnings,
          })
          .from(drivers);
        const statsMap = new Map(stats.map((s: { driverId: number; deliveries: number }) => [s.driverId, s.deliveries]));

        return {
          type: "drivers",
          generatedAt: new Date().toISOString(),
          columns: ["Repartidor", "Telefono", "Entregas", "Ganancias", "Calif."],
          rows: d.map((r) => ({
            Repartidor: r.name,
            Telefono: r.phone,
            Entregas: statsMap.get(r.id) || 0,
            Ganancias: parseFloat(r.totalEarnings || "0").toFixed(2),
            "Calif.": r.rating || "4.5",
          })),
        };
      }

      // Reporte de Ganancias de Repartidores
      if (input.type === "earnings") {
        const e = await db
          .select({
            driverId: driverEarnings.driverId,
            orderId: driverEarnings.orderId,
            amount: driverEarnings.amount,
            type: driverEarnings.type,
            date: driverEarnings.date,
          })
          .from(driverEarnings)
          .orderBy(desc(driverEarnings.date));

        const d = await db.select({ id: drivers.id, name: drivers.name }).from(drivers);
        const dMap = new Map(d.map((r) => [r.id, r.name]));

        return {
          type: "earnings",
          generatedAt: new Date().toISOString(),
          columns: ["Repartidor", "Pedido ID", "Monto", "Tipo", "Fecha"],
          rows: e.map((r) => ({
            Repartidor: dMap.get(r.driverId) || "-",
            "Pedido ID": r.orderId,
            Monto: parseFloat(r.amount || "0").toFixed(2),
            Tipo: r.type === "delivery_fee" ? "Envio" : r.type === "tip" ? "Propina" : "Bono",
            Fecha: r.date,
          })),
        };
      }

      // Reporte de Comisiones de Plataforma
      if (input.type === "commissions") {
        const all = await db
          .select({
            orderId: orders.id,
            commission: orders.commission,
            total: orders.total,
            createdAt: orders.createdAt,
          })
          .from(orders)
          .where(and(withDate, sql`${orders.status} NOT IN ('cancelled', 'payment_rejected')`))
          .orderBy(desc(orders.createdAt));

        const items = await db
          .select({ orderId: orderItems.orderId, commerceId: orderItems.commerceId })
          .from(orderItems);
        const comms = await db.select({ id: commerces.id, name: commerces.name }).from(commerces);
        const cMap = new Map(comms.map((c) => [c.id, c.name]));
        const orderCommerces = new Map<number, string>();
        for (const it of items) {
          if (!orderCommerces.has(it.orderId)) {
            orderCommerces.set(it.orderId, cMap.get(it.commerceId) || "-");
          }
        }

        return {
          type: "commissions",
          generatedAt: new Date().toISOString(),
          columns: ["Comercio", "Pedido ID", "Comision", "Total Pedido", "Fecha"],
          rows: all.map((r) => ({
            Comercio: orderCommerces.get(r.orderId) || "-",
            "Pedido ID": r.orderId,
            Comision: parseFloat(r.commission || "0").toFixed(2),
            "Total Pedido": parseFloat(r.total || "0").toFixed(2),
            Fecha: r.createdAt?.toISOString().split("T")[0],
          })),
        };
      }

      return { type: input.type, generatedAt: new Date().toISOString(), columns: [], rows: [] };
    }),
};
