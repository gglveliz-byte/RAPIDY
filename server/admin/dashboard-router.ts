/**
 * @archivo app/server/admin/dashboard-router.ts
 * @modulo 01-admin-dashboard (Métricas globales, KPIs y analítica financiera)
 * @proposito
 *   Provee los procedimientos tRPC del Dashboard de Administración con cálculo matemático
 *   riguroso de facturación real, comisiones efectivas por comercio y rendimiento de envíos.
 *
 * @resumen_contenido
 *   - `dashboard`: KPIs globales (ventas netas sin cancelaciones, comisiones reales, choferes).
 *   - `salesByPeriod`: Ventas y volumen agrupados por día/semana/mes/año sin pedidos cancelados.
 *   - `earningsByPeriod`: Desglose cronológico de comisiones y ganancia neta de delivery.
 *   - `topCommerces`: Ranking de tiendas con conteo verídico de pedidos únicos (no unidades).
 *   - `categoryRanking`: Facturación agregada por rubro/categoría.
 *   - `commerceCommissions`: Comisiones liquidadas por comercio sobre órdenes entregadas.
 *   - `adminDeliveryEarnings`: Balance neto de tarifas de envío cobradas vs pagadas a choferes.
 */

import { z } from "zod";
import { adminQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { orders, orderItems, commerces, drivers, driverEarnings, customers, categories } from "@db/schema";
import { eq, sql, and, gte, inArray, notInArray } from "drizzle-orm";

export const adminDashboardProcedures = {
  dashboard: adminQuery.query(async () => {
    const db = getDb();
    
    const [
      totalOrdersResult,
      activeCommercesResult,
      totalCommercesResult,
      driversResult,
      customersResult,
      revenueResult,
      commissionResult,
      pendingOrdersResult,
      deliveredOrdersResult
    ] = await Promise.all([
      db.select({ count: sql<number>`COUNT(*)` }).from(orders),
      db.select({ count: sql<number>`COUNT(*)` }).from(commerces).where(eq(commerces.status, "active")),
      db.select({ count: sql<number>`COUNT(*)` }).from(commerces),
      db.select({ status: drivers.status, count: sql<number>`COUNT(*)` }).from(drivers).groupBy(drivers.status),
      db.select({ count: sql<number>`COUNT(*)` }).from(customers),
      // Facturación real: solo pedidos válidos (excluye cancelados y pagos rechazados)
      db.select({
        totalRevenue: sql<number>`COALESCE(SUM(CAST(${orders.total} AS REAL)), 0)`
      }).from(orders).where(notInArray(orders.status, ["cancelled", "payment_rejected", "pending_payment"])),
      // Comisión real calculada matemáticamente sobre órdenes entregadas
      db.select({
        totalCommission: sql<number>`COALESCE(SUM(CAST(${orderItems.total} AS REAL) * CAST(${commerces.commissionRate} AS REAL) / 100), 0)`
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .innerJoin(commerces, eq(orderItems.commerceId, commerces.id))
      .where(eq(orders.status, "delivered")),
      db.select({ count: sql<number>`COUNT(*)` }).from(orders).where(inArray(orders.status, ["received", "accepted", "preparing", "ready_for_pickup", "driver_assigned", "on_the_way"])),
      db.select({ count: sql<number>`COUNT(*)` }).from(orders).where(eq(orders.status, "delivered"))
    ]);

    const onlineDrivers = driversResult.find(d => d.status === "online")?.count || 0;
    const busyDrivers = driversResult.find(d => d.status === "busy")?.count || 0;
    const totalDrivers = driversResult.reduce((acc, d) => acc + d.count, 0);

    return {
      totalOrders: totalOrdersResult[0]?.count || 0,
      activeCommerces: activeCommercesResult[0]?.count || 0,
      totalCommerces: totalCommercesResult[0]?.count || 0,
      onlineDrivers,
      busyDrivers,
      totalDrivers,
      totalCustomers: customersResult[0]?.count || 0,
      totalRevenue: Number(revenueResult[0]?.totalRevenue || 0).toFixed(2),
      totalCommission: Number(commissionResult[0]?.totalCommission || 0).toFixed(2),
      pendingOrders: pendingOrdersResult[0]?.count || 0,
      deliveredOrders: deliveredOrdersResult[0]?.count || 0,
    };
  }),

  salesByPeriod: adminQuery
    .input(z.object({ period: z.enum(["day", "week", "month", "year"]) }))
    .query(async ({ input }) => {
      const db = getDb();
      
      const cutoff = new Date();
      if (input.period === "day") cutoff.setDate(cutoff.getDate() - 30);
      else if (input.period === "week") cutoff.setDate(cutoff.getDate() - 90);
      else if (input.period === "month") cutoff.setMonth(cutoff.getMonth() - 24);
      else cutoff.setFullYear(cutoff.getFullYear() - 10);

      // Excluye cancelaciones de la curva de ventas reales
      const allOrders = await db.select().from(orders).where(
        and(
          gte(orders.createdAt, cutoff),
          notInArray(orders.status, ["cancelled", "payment_rejected", "pending_payment"])
        )
      );
      const grouped: Record<string, { date: string; sales: number; orders: number }> = {};
      
      for (const order of allOrders) {
        const date = new Date(order.createdAt);
        let key: string;
        
        if (input.period === "day") {
          key = date.toISOString().split("T")[0];
        } else if (input.period === "week") {
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = weekStart.toISOString().split("T")[0];
        } else if (input.period === "month") {
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        } else {
          key = String(date.getFullYear());
        }
        
        if (!grouped[key]) grouped[key] = { date: key, sales: 0, orders: 0 };
        grouped[key].sales += parseFloat(order.total || "0");
        grouped[key].orders += 1;
      }
      
      return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));
    }),

  earningsByPeriod: adminQuery
    .input(z.object({ period: z.enum(["day", "week", "month", "year"]) }))
    .query(async ({ input }) => {
      const db = getDb();
      
      const cutoff = new Date();
      if (input.period === "day") cutoff.setDate(cutoff.getDate() - 30);
      else if (input.period === "week") cutoff.setDate(cutoff.getDate() - 90);
      else if (input.period === "month") cutoff.setMonth(cutoff.getMonth() - 24);
      else cutoff.setFullYear(cutoff.getFullYear() - 10);

      const deliveredOrders = await db.select().from(orders).where(
        and(eq(orders.status, "delivered"), gte(orders.createdAt, cutoff))
      );
      const orderIds = deliveredOrders.map(o => o.id);
      
      const allOrderItems = orderIds.length > 0 ? await db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds)) : [];
      const allCommerces = await db.select().from(commerces);
      const allDriverEarnings = await db.select().from(driverEarnings).where(
        and(eq(driverEarnings.type, "delivery_fee"), gte(driverEarnings.createdAt, cutoff))
      );
      
      const commMap = new Map(allCommerces.map((c) => [c.id, c]));
      const itemsByOrder = new Map<number, typeof allOrderItems>();
      for (const item of allOrderItems) {
        if (!itemsByOrder.has(item.orderId)) itemsByOrder.set(item.orderId, []);
        itemsByOrder.get(item.orderId)!.push(item);
      }
      
      const grouped: Record<string, { date: string; commission: number; deliveryNet: number }> = {};
      
      const getKey = (dateObj: Date) => {
        if (input.period === "day") return dateObj.toISOString().split("T")[0];
        if (input.period === "week") {
          const weekStart = new Date(dateObj);
          weekStart.setDate(dateObj.getDate() - dateObj.getDay());
          key: weekStart.toISOString().split("T")[0];
          return weekStart.toISOString().split("T")[0];
        }
        if (input.period === "month") return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}`;
        return String(dateObj.getFullYear());
      };

      for (const order of deliveredOrders) {
        const date = new Date(order.createdAt);
        const key = getKey(date);
        if (!grouped[key]) grouped[key] = { date: key, commission: 0, deliveryNet: 0 };
        
        grouped[key].deliveryNet += parseFloat(order.deliveryFee || "0");
        
        const items = itemsByOrder.get(order.id) || [];
        for (const item of items) {
          const comm = commMap.get(item.commerceId);
          const rate = parseFloat(comm?.commissionRate || "10.00");
          const itemTotal = parseFloat(item.total || "0");
          grouped[key].commission += itemTotal * (rate / 100);
        }
      }
      
      for (const earning of allDriverEarnings) {
        const date = new Date(earning.createdAt);
        const key = getKey(date);
        if (!grouped[key]) grouped[key] = { date: key, commission: 0, deliveryNet: 0 };
        grouped[key].deliveryNet -= parseFloat(earning.amount || "0");
      }
      
      return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));
    }),

  topCommerces: adminQuery
    .input(z.object({ limit: z.number().default(10) }))
    .query(async ({ input }) => {
      const db = getDb();
      
      // Consulta agregada eficiente sobre pedidos completados
      const rows = await db
        .select({
          commerceId: orderItems.commerceId,
          commerceName: commerces.name,
          orderId: orderItems.orderId,
          total: orderItems.total,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .innerJoin(commerces, eq(orderItems.commerceId, commerces.id))
        .where(eq(orders.status, "delivered"));

      const statsMap = new Map<number, { id: number; name: string; orderSet: Set<number>; revenue: number }>();

      for (const row of rows) {
        if (!statsMap.has(row.commerceId)) {
          statsMap.set(row.commerceId, {
            id: row.commerceId,
            name: row.commerceName,
            orderSet: new Set(),
            revenue: 0,
          });
        }
        const item = statsMap.get(row.commerceId)!;
        item.orderSet.add(row.orderId);
        item.revenue += parseFloat(row.total || "0");
      }

      return Array.from(statsMap.values())
        .map(s => ({
          id: s.id,
          name: s.name,
          orders: s.orderSet.size, // Cantidad real de pedidos únicos
          revenue: s.revenue,
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, input.limit);
    }),

  categoryRanking: adminQuery.query(async () => {
    const db = getDb();
    const rows = await db
      .select({
        categoryId: commerces.categoryId,
        categoryName: categories.name,
        total: orderItems.total,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .innerJoin(commerces, eq(orderItems.commerceId, commerces.id))
      .leftJoin(categories, eq(commerces.categoryId, categories.id))
      .where(eq(orders.status, "delivered"));

    const categoryStats: Record<number, { id: number; name: string; sales: number }> = {};
    
    for (const row of rows) {
      const catId = Number(row.categoryId) || 0;
      if (!categoryStats[catId]) {
        categoryStats[catId] = { id: catId, name: row.categoryName || "General", sales: 0 };
      }
      categoryStats[catId].sales += parseFloat(row.total || "0");
    }
    
    return Object.values(categoryStats).sort((a, b) => b.sales - a.sales);
  }),

  commerceCommissions: adminQuery.query(async () => {
    const db = getDb();

    const items = await db
      .select({
        commerceId: orderItems.commerceId,
        totalSales: sql<string>`sum(${orderItems.total})`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(eq(orders.status, "delivered"))
      .groupBy(orderItems.commerceId);

    const comms = await db.select({
      id: commerces.id,
      name: commerces.name,
      commissionRate: commerces.commissionRate,
    }).from(commerces);

    const commMap = new Map(comms.map(c => [c.id, c]));

    return items.map(item => {
      const comm = commMap.get(item.commerceId);
      const sales = parseFloat(item.totalSales || "0");
      const rate = parseFloat(comm?.commissionRate || "10.00");
      return {
        commerceId: item.commerceId,
        name: comm?.name || "-",
        totalSales: sales.toFixed(2),
        commissionRate: rate.toFixed(2),
        commissionEarned: (sales * rate / 100).toFixed(2),
      };
    }).sort((a, b) => parseFloat(b.commissionEarned) - parseFloat(a.commissionEarned));
  }),

  adminDeliveryEarnings: adminQuery.query(async () => {
    const db = getDb();

    const [feeResult] = await db
      .select({
        total: sql<string>`coalesce(sum(${orders.deliveryFee}), '0')`,
      })
      .from(orders)
      .where(eq(orders.status, "delivered"));

    const [payoutResult] = await db
      .select({
        total: sql<string>`coalesce(sum(${driverEarnings.amount}), '0')`,
      })
      .from(driverEarnings)
      .where(eq(driverEarnings.type, "delivery_fee"));

    const totalFees = parseFloat(feeResult?.total || "0");
    const totalPayouts = parseFloat(payoutResult?.total || "0");

    return {
      totalDeliveryFees: totalFees.toFixed(2),
      totalDriverPayouts: totalPayouts.toFixed(2),
      adminNet: (totalFees - totalPayouts).toFixed(2),
    };
  }),
};
