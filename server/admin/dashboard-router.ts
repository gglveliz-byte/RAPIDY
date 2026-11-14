/**
 * @archivo app/server/admin/dashboard-router.ts
 * @modulo 01-admin-dashboard (Métricas globales, KPIs y analítica financiera)
 * @proposito
 *   Provee los procedimientos tRPC del Dashboard de Administración con cálculo
 *   financiero basado en snapshots históricos y fechas de entrega.
 *
 * @resumen_contenido
 *   - `dashboard`: KPIs globales sobre pedidos entregados y comisión snapshot.
 *   - `salesByPeriod`: Ventas entregadas agrupadas por calendario de Guayaquil.
 *   - `salesGrowth`: Comparación de ventanas equivalentes (actual vs anterior).
 *   - `earningsByPeriod`: Comisión snapshot y ganancia neta de delivery.
 *   - `topCommerces`, `categoryRanking`: Rankings sobre pedidos entregados.
 *   - `commerceCommissions`: Comisión histórica por comercio.
 *   - `adminDeliveryEarnings`: Fletes cobrados vs pagados a repartidores.
 */

import { z } from "zod";
import { adminQuery } from "../middleware";
import { getDb } from "../queries/connection";
import {
  orders,
  orderItems,
  commerces,
  drivers,
  driverEarnings,
  customers,
  categories,
  orderCommerceStatus,
} from "@db/schema";
import { eq, sql, and, gte, inArray } from "drizzle-orm";
import { guayaquilDateKey } from "../lib/dates";

type Period = "day" | "week" | "month" | "year";

function cutoffForPeriod(period: Period): Date {
  const cutoff = new Date();
  if (period === "day") cutoff.setDate(cutoff.getDate() - 30);
  else if (period === "week") cutoff.setDate(cutoff.getDate() - 90);
  else if (period === "month") cutoff.setMonth(cutoff.getMonth() - 24);
  else cutoff.setFullYear(cutoff.getFullYear() - 10);
  return cutoff;
}

function bucketKey(value: Date | string, period: Period): string {
  const dayKey = guayaquilDateKey(value);
  if (period === "day") return dayKey;
  if (period === "week") {
    const base = new Date(`${dayKey}T00:00:00Z`);
    const offset = (base.getUTCDay() + 6) % 7; // lunes como inicio
    base.setUTCDate(base.getUTCDate() - offset);
    return base.toISOString().slice(0, 10);
  }
  if (period === "month") return dayKey.slice(0, 7);
  return dayKey.slice(0, 4);
}

/**
 * Comisión histórica por pedido/comercio. Usa el snapshot
 * `order_commerce_status.commission_amount` y cae a la tasa actual solo para
 * pedidos legacy sin snapshot.
 */
async function loadDeliveredCommissions(cutoff?: Date) {
  const db = getDb();
  const rows = await db
    .select({
      orderId: orderCommerceStatus.orderId,
      commerceId: orderCommerceStatus.commerceId,
      commissionAmount: orderCommerceStatus.commissionAmount,
      sales: sql<string>`coalesce(sum(${orderItems.total}), 0)`,
      createdAt: orders.createdAt,
      deliveredAt: orders.deliveredAt,
      rate: commerces.commissionRate,
    })
    .from(orderCommerceStatus)
    .innerJoin(orders, eq(orderCommerceStatus.orderId, orders.id))
    .innerJoin(commerces, eq(orderCommerceStatus.commerceId, commerces.id))
    .leftJoin(
      orderItems,
      and(
        eq(orderItems.orderId, orderCommerceStatus.orderId),
        eq(orderItems.commerceId, orderCommerceStatus.commerceId),
      ),
    )
    .where(
      and(
        eq(orders.status, "delivered"),
        cutoff ? gte(sql`coalesce(${orders.deliveredAt}, ${orders.createdAt})`, cutoff) : undefined,
      ),
    )
    .groupBy(
      orderCommerceStatus.orderId,
      orderCommerceStatus.commerceId,
      orderCommerceStatus.commissionAmount,
      orders.createdAt,
      orders.deliveredAt,
      commerces.commissionRate,
    );

  const withCommission = rows.map((row) => {
    const sales = Number(row.sales || 0);
    const commission =
      row.commissionAmount !== null && row.commissionAmount !== undefined
        ? Number(row.commissionAmount)
        : sales * (Number(row.rate || "10") / 100);
    return {
      ...row,
      sales,
      commission,
      effectiveAt: row.deliveredAt ?? row.createdAt,
    };
  });

  // Pedidos legacy sin filas en order_commerce_status: se reconstruye la
  // comisión por comercio con la tasa actual solo para no perder la venta.
  const existingKeys = new Set(
    withCommission.map((row) => `${row.orderId}:${row.commerceId}`),
  );
  const legacyGroups = await db
    .select({
      orderId: orderItems.orderId,
      commerceId: orderItems.commerceId,
      sales: sql<string>`coalesce(sum(${orderItems.total}), 0)`,
      createdAt: orders.createdAt,
      deliveredAt: orders.deliveredAt,
      rate: commerces.commissionRate,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(commerces, eq(orderItems.commerceId, commerces.id))
    .where(
      and(
        eq(orders.status, "delivered"),
        cutoff ? gte(sql`coalesce(${orders.deliveredAt}, ${orders.createdAt})`, cutoff) : undefined,
      ),
    )
    .groupBy(
      orderItems.orderId,
      orderItems.commerceId,
      orders.createdAt,
      orders.deliveredAt,
      commerces.commissionRate,
    );

  for (const row of legacyGroups) {
    const key = `${row.orderId}:${row.commerceId}`;
    if (existingKeys.has(key)) continue;
    const sales = Number(row.sales || 0);
    withCommission.push({
      orderId: row.orderId,
      commerceId: row.commerceId,
      commissionAmount: null,
      sales: Number(row.sales || 0),
      createdAt: row.createdAt,
      deliveredAt: row.deliveredAt,
      rate: row.rate,
      commission: sales * (Number(row.rate || "10") / 100),
      effectiveAt: row.deliveredAt ?? row.createdAt,
    });
  }

  return withCommission;
}

async function periodSalesTotal(from: Date, to: Date) {
  const db = getDb();
  const rows = await db
    .select({
      total: sql<string>`coalesce(sum(${orders.total}), 0)`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.status, "delivered"),
        gte(sql`coalesce(${orders.deliveredAt}, ${orders.createdAt})`, from),
        sql`coalesce(${orders.deliveredAt}, ${orders.createdAt}) < ${to}`,
      ),
    );
  return Number(rows[0]?.total || 0);
}

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
      commissions,
      pendingOrdersResult,
      deliveredOrdersResult,
    ] = await Promise.all([
      db.select({ count: sql<number>`COUNT(*)` }).from(orders),
      db.select({ count: sql<number>`COUNT(*)` }).from(commerces).where(eq(commerces.status, "active")),
      db.select({ count: sql<number>`COUNT(*)` }).from(commerces),
      db.select({ status: drivers.status, count: sql<number>`COUNT(*)` }).from(drivers).groupBy(drivers.status),
      db.select({ count: sql<number>`COUNT(*)` }).from(customers),
      // Facturación entregada: misma base que Stats del comercio.
      db.select({
        totalRevenue: sql<number>`COALESCE(SUM(CAST(${orders.total} AS REAL)), 0)`,
      }).from(orders).where(eq(orders.status, "delivered")),
      loadDeliveredCommissions(),
      db.select({ count: sql<number>`COUNT(*)` }).from(orders).where(inArray(orders.status, ["received", "accepted", "preparing", "ready_for_pickup", "driver_assigned", "on_the_way"])),
      db.select({ count: sql<number>`COUNT(*)` }).from(orders).where(eq(orders.status, "delivered")),
    ]);

    const totalCommission = commissions.reduce((sum, row) => sum + row.commission, 0);
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
      totalCommission: totalCommission.toFixed(2),
      pendingOrders: pendingOrdersResult[0]?.count || 0,
      deliveredOrders: deliveredOrdersResult[0]?.count || 0,
    };
  }),

  salesByPeriod: adminQuery
    .input(z.object({ period: z.enum(["day", "week", "month", "year"]) }))
    .query(async ({ input }) => {
      const db = getDb();
      const cutoff = cutoffForPeriod(input.period);
      const rows = await db
        .select({
          total: orders.total,
          deliveredAt: orders.deliveredAt,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .where(
          and(
            eq(orders.status, "delivered"),
            gte(sql`coalesce(${orders.deliveredAt}, ${orders.createdAt})`, cutoff),
          ),
        );

      const grouped: Record<string, { date: string; sales: number; orders: number }> = {};
      for (const order of rows) {
        const effectiveAt = order.deliveredAt ?? order.createdAt;
        const key = bucketKey(effectiveAt, input.period);
        if (!grouped[key]) grouped[key] = { date: key, sales: 0, orders: 0 };
        grouped[key].sales += Number(order.total || 0);
        grouped[key].orders += 1;
      }
      return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));
    }),

  salesGrowth: adminQuery
    .input(z.object({ period: z.enum(["day", "week", "month", "year"]) }))
    .query(async ({ input }) => {
      const now = new Date();
      const spanDays = input.period === "day" ? 30 : input.period === "week" ? 90 : input.period === "month" ? 730 : 3650;
      const currentFrom = new Date(now);
      currentFrom.setDate(currentFrom.getDate() - spanDays);
      const previousFrom = new Date(currentFrom);
      previousFrom.setDate(previousFrom.getDate() - spanDays);

      const [current, previous] = await Promise.all([
        periodSalesTotal(currentFrom, now),
        periodSalesTotal(previousFrom, currentFrom),
      ]);
      return {
        current: current.toFixed(2),
        previous: previous.toFixed(2),
        growthPercent:
          previous > 0
            ? Number((((current - previous) / previous) * 100).toFixed(1))
            : null,
        windowDays: spanDays,
      };
    }),

  earningsByPeriod: adminQuery
    .input(z.object({ period: z.enum(["day", "week", "month", "year"]) }))
    .query(async ({ input }) => {
      const db = getDb();
      const cutoff = cutoffForPeriod(input.period);

      const [commissions, payouts] = await Promise.all([
        loadDeliveredCommissions(cutoff),
        db
          .select({
            amount: driverEarnings.amount,
            deliveredAt: orders.deliveredAt,
            createdAt: orders.createdAt,
          })
          .from(driverEarnings)
          .innerJoin(orders, eq(driverEarnings.orderId, orders.id))
          .where(
            and(
              eq(driverEarnings.type, "delivery_fee"),
              eq(orders.status, "delivered"),
              gte(sql`coalesce(${orders.deliveredAt}, ${orders.createdAt})`, cutoff),
            ),
          ),
      ]);

      const grouped: Record<string, { date: string; commission: number; deliveryNet: number }> = {};
      const ensure = (key: string) => {
        if (!grouped[key]) grouped[key] = { date: key, commission: 0, deliveryNet: 0 };
        return grouped[key];
      };

      for (const row of commissions) {
        const key = bucketKey(row.effectiveAt, input.period);
        ensure(key).commission += row.commission;
      }

      const db2 = getDb();
      const fees = await db2
        .select({
          deliveryFee: orders.deliveryFee,
          deliveredAt: orders.deliveredAt,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .where(
          and(
            eq(orders.status, "delivered"),
            gte(sql`coalesce(${orders.deliveredAt}, ${orders.createdAt})`, cutoff),
          ),
        );
      for (const fee of fees) {
        const key = bucketKey(fee.deliveredAt ?? fee.createdAt, input.period);
        ensure(key).deliveryNet += Number(fee.deliveryFee || 0);
      }
      for (const payout of payouts) {
        const key = bucketKey(payout.deliveredAt ?? payout.createdAt, input.period);
        ensure(key).deliveryNet -= Number(payout.amount || 0);
      }

      return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));
    }),

  topCommerces: adminQuery
    .input(z.object({ limit: z.number().int().min(1).max(50).default(10) }))
    .query(async ({ input }) => {
      const db = getDb();
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
        item.revenue += Number(row.total || 0);
      }

      return Array.from(statsMap.values())
        .map(s => ({ id: s.id, name: s.name, orders: s.orderSet.size, revenue: s.revenue }))
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
      categoryStats[catId].sales += Number(row.total || 0);
    }
    return Object.values(categoryStats).sort((a, b) => b.sales - a.sales);
  }),

  commerceCommissions: adminQuery.query(async () => {
    const db = getDb();
    const rows = await loadDeliveredCommissions();
    const comms = await db
      .select({ id: commerces.id, name: commerces.name, commissionRate: commerces.commissionRate })
      .from(commerces);
    const commMap = new Map(comms.map((commerce) => [commerce.id, commerce]));

    const grouped = new Map<number, { sales: number; commission: number }>();
    for (const row of rows) {
      const current = grouped.get(row.commerceId) ?? { sales: 0, commission: 0 };
      current.sales += row.sales;
      current.commission += row.commission;
      grouped.set(row.commerceId, current);
    }

    return [...grouped.entries()]
      .map(([commerceId, values]) => {
        const commerce = commMap.get(commerceId);
        return {
          commerceId,
          name: commerce?.name || "-",
          totalSales: values.sales.toFixed(2),
          commissionRate: Number(commerce?.commissionRate || 0).toFixed(2),
          commissionEarned: values.commission.toFixed(2),
        };
      })
      .sort((a, b) => parseFloat(b.commissionEarned) - parseFloat(a.commissionEarned));
  }),

  adminDeliveryEarnings: adminQuery.query(async () => {
    const db = getDb();
    const [feeResult] = await db
      .select({ total: sql<string>`coalesce(sum(${orders.deliveryFee}), '0')` })
      .from(orders)
      .where(eq(orders.status, "delivered"));
    const [payoutResult] = await db
      .select({ total: sql<string>`coalesce(sum(${driverEarnings.amount}), '0')` })
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