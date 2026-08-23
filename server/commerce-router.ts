import { z } from "zod";
import { createRouter, publicQuery, merchantQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { commerces, products, orderItems, orders, orderCommerceStatus, drivers, orderStatusHistory, users } from "@db/schema";
import { eq, and, like } from "drizzle-orm";
import { emit } from "./events";

export const commerceRouter = createRouter({
  list: publicQuery.query(async () => {
    const db = getDb();
    return db.select().from(commerces).where(eq(commerces.status, "active"));
  }),

  // Returns the commerce owned by the currently authenticated merchant
  me: merchantQuery.query(async ({ ctx }) => {
    const db = getDb();
    const rows = await db.select().from(commerces).where(eq(commerces.merchantUserId, ctx.merchant.id));
    return rows[0] || null;
  }),

  getById: publicQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const commerce = await db.select().from(commerces).where(eq(commerces.id, input.id));
      if (commerce.length === 0) return null;
      const prods = await db.select().from(products).where(eq(products.commerceId, input.id));
      return { ...commerce[0], products: prods };
    }),

  getByCategory: publicQuery
    .input(z.object({ categoryId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db.select().from(commerces).where(
        and(eq(commerces.categoryId, input.categoryId), eq(commerces.status, "active"))
      );
    }),

  search: publicQuery
    .input(z.object({ query: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db.select().from(commerces).where(
        and(like(commerces.name, `%${input.query}%`), eq(commerces.status, "active"))
      );
    }),

  update: merchantQuery
    .input(
      z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        address: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        logo: z.string().optional(),
        coverImage: z.string().optional(),
        minOrder: z.string().optional(),
        deliveryTime: z.string().optional(),
        status: z.enum(["active", "inactive", "suspended", "pending"]).optional(),
        isOpen: z.enum(["open", "closed"]).optional(),
        openHours: z.string().optional(),
        commissionRate: z.string().optional(),
        lat: z.string().optional(),
        lng: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const { id, ...data } = input;
      const updateData: Record<string, any> = {};
      for (const [key, val] of Object.entries(data)) {
        if (val !== undefined) updateData[key] = val;
      }
      if (Object.keys(updateData).length > 0) {
        await db.update(commerces).set(updateData).where(eq(commerces.id, id));
      }
      const result = await db.select().from(commerces).where(eq(commerces.id, id));
      emit("admin:dashboard", { type: "dashboard_update" });
      return result[0];
    }),

  toggleStatus: merchantQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const commerce = await db.select().from(commerces).where(eq(commerces.id, input.id));
      if (commerce.length === 0) return null;
      const newStatus = commerce[0].isOpen === "open" ? "closed" : "open";
      await db.update(commerces).set({ isOpen: newStatus }).where(eq(commerces.id, input.id));
      emit("admin:dashboard", { type: "dashboard_update" });
      return { ...commerce[0], isOpen: newStatus };
    }),

  getStats: publicQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const [commerce] = await db.select().from(commerces).where(eq(commerces.id, input.id));
      const prods = await db.select().from(products).where(eq(products.commerceId, input.id));

      const orderItemsForCommerce = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.commerceId, input.id));

      const orderIds = [...new Set(orderItemsForCommerce.map(i => i.orderId))];

      let totalSales = 0;
      let totalOrders = 0;
      const productSales: Record<number, { name: string; qty: number; revenue: number }> = {};

      const dailyMap: Record<string, number> = {};

      for (const oid of orderIds) {
        const [order] = await db.select().from(orders).where(eq(orders.id, oid));
        if (!order) continue;

        const dayKey = new Date(order.createdAt).toLocaleDateString("es-ES", { weekday: "short" });

        if (order.status === "delivered") {
          const items = orderItemsForCommerce.filter(i => i.orderId === oid);
          let orderCommerceTotal = 0;
          for (const item of items) {
            orderCommerceTotal += parseFloat(item.total);
            if (!productSales[item.productId]) {
              productSales[item.productId] = { name: item.productName, qty: 0, revenue: 0 };
            }
            productSales[item.productId].qty += parseFloat(item.quantity);
            productSales[item.productId].revenue += parseFloat(item.total);
          }
          totalSales += orderCommerceTotal;
          totalOrders++;
          if (!dailyMap[dayKey]) dailyMap[dayKey] = 0;
          dailyMap[dayKey] += orderCommerceTotal;
        }
      }

      const dayNames = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
      const dailySales = dayNames.map((day) => ({
        day: day.charAt(0).toUpperCase() + day.slice(1),
        sales: Math.round(dailyMap[day] || 0),
      }));

      const topProducts = Object.entries(productSales)
        .map(([, v]) => ({ name: v.name, sales: v.qty, revenue: v.revenue.toFixed(2) }))
        .sort((a, b) => b.sales - a.sales)
        .slice(0, 10);

      const avgTicket = totalOrders > 0 ? totalSales / totalOrders : 0;
      const commissionRate = parseFloat(commerce?.commissionRate || "10");
      const totalCommission = totalSales * (commissionRate / 100);

      return {
        totalProducts: prods.length,
        featuredProducts: prods.filter(p => p.isFeatured === "yes").length,
        totalSales: Number(totalSales.toFixed(2)),
        totalOrders,
        avgTicket: Number(avgTicket.toFixed(2)),
        totalCommission: Number(totalCommission.toFixed(2)),
        topProducts,
        dailySales,
      };
    }),

  markReady: merchantQuery
    .input(z.object({ orderId: z.number(), commerceId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();

      // Verify the commerce owns items in this order
      const orderItemsResult = await db
        .select()
        .from(orderItems)
        .where(and(eq(orderItems.orderId, input.orderId), eq(orderItems.commerceId, input.commerceId)));

      if (orderItemsResult.length === 0) {
        throw new Error("Este comercio no tiene items en este pedido");
      }

      // Update the commerce status to ready_for_pickup
      const result = await db.transaction(async (tx) => {
        await tx
          .update(orderCommerceStatus)
          .set({ status: "ready_for_pickup", updatedAt: new Date() })
          .where(and(eq(orderCommerceStatus.orderId, input.orderId), eq(orderCommerceStatus.commerceId, input.commerceId)));

        // Check if all commerces for this order are ready
        const allStatuses = await tx
          .select()
          .from(orderCommerceStatus)
          .where(eq(orderCommerceStatus.orderId, input.orderId));

        const allReady = allStatuses.every(s => s.status === "ready_for_pickup");

        if (allReady) {
          // Update order status to ready_for_pickup
          await tx
            .update(orders)
            .set({ status: "ready_for_pickup", updatedAt: new Date() })
            .where(eq(orders.id, input.orderId));

          await tx.insert(orderStatusHistory).values({
            orderId: input.orderId,
            status: "ready_for_pickup",
            notes: "Todos los comercios listos para retirar",
          });

          // Notify online drivers
          const onlineDrivers = await tx.select({ id: drivers.id }).from(drivers).where(eq(drivers.status, "online"));
          onlineDrivers.forEach((driver) => {
            emit(`driver:${driver.id}`, { type: "new_available", orderId: input.orderId });
          });

          emit(`order:${input.orderId}`, { type: "status_update", status: "ready_for_pickup" });
        }

        // Emit commerce ready event
        emit(`commerce:${input.commerceId}`, { type: "commerce_ready", orderId: input.orderId });
        emit(`order:${input.orderId}`, { type: "commerce_ready", commerceId: input.commerceId });
        emit("admin:dashboard", { type: "dashboard_update" });

        return { allReady };
      });

      return result;
    }),

  registerDeviceToken: merchantQuery
    .input(z.object({ token: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!ctx.merchant?.id) return { success: false };
      await db.update(users).set({ fcmToken: input.token }).where(eq(users.id, ctx.merchant.id));
      return { success: true };
    }),
});
