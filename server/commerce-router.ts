import { z } from "zod";
import { createRouter, publicQuery, merchantQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { commerces, products, orderItems, orders, orderCommerceStatus, users } from "@db/schema";
import { eq, and, ilike } from "drizzle-orm";
import { emit } from "./events";
import { assertCommerceOwnership, merchantOwnsCommerce } from "./lib/order-access";
import { markCommerceReadyForOrder } from "./lib/order-ready";

const publicCommerceColumns = {
  id: commerces.id,
  name: commerces.name,
  description: commerces.description,
  logo: commerces.logo,
  coverImage: commerces.coverImage,
  categoryId: commerces.categoryId,
  address: commerces.address,
  phone: commerces.phone,
  minOrder: commerces.minOrder,
  deliveryTime: commerces.deliveryTime,
  rating: commerces.rating,
  status: commerces.status,
  isOpen: commerces.isOpen,
  openHours: commerces.openHours,
  lat: commerces.lat,
  lng: commerces.lng,
};

const GUAYAQUIL_TZ = "America/Guayaquil";

function guayaquilDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: GUAYAQUIL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function guayaquilWeekday(date: Date): string {
  const label = new Intl.DateTimeFormat("es-EC", {
    timeZone: GUAYAQUIL_TZ,
    weekday: "short",
  }).format(date);
  const clean = label.replace(/\.$/, "");
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

export const commerceRouter = createRouter({
  list: publicQuery.query(async () => {
    const db = getDb();
    return db
      .select(publicCommerceColumns)
      .from(commerces)
      .where(eq(commerces.status, "active"));
  }),

  // Returns the commerce owned by the currently authenticated merchant
  me: merchantQuery.query(async ({ ctx }) => {
    const db = getDb();
    const rows = await db.select().from(commerces).where(eq(commerces.merchantUserId, ctx.merchant.id));
    return rows[0] || null;
  }),

  getById: publicQuery
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const commerce = await db
        .select(publicCommerceColumns)
        .from(commerces)
        .where(eq(commerces.id, input.id));
      if (commerce.length === 0) return null;
      const isOwner =
        !!ctx.admin || (ctx.merchant ? await merchantOwnsCommerce(ctx, input.id) : false);
      if (!isOwner && commerce[0].status !== "active") return null;
      const prods = await db.select().from(products).where(eq(products.commerceId, input.id));
      return {
        ...commerce[0],
        products: isOwner ? prods : prods.filter((product) => product.isAvailable === "yes"),
      };
    }),

  getByCategory: publicQuery
    .input(z.object({ categoryId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db
        .select(publicCommerceColumns)
        .from(commerces)
        .where(
          and(eq(commerces.categoryId, input.categoryId), eq(commerces.status, "active")),
        );
    }),

  search: publicQuery
    .input(z.object({ query: z.string().trim().min(1).max(100) }))
    .query(async ({ input }) => {
      const db = getDb();
      return db
        .select(publicCommerceColumns)
        .from(commerces)
        .where(
          and(ilike(commerces.name, `%${input.query}%`), eq(commerces.status, "active")),
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
        isOpen: z.enum(["open", "closed"]).optional(),
        openHours: z.string().optional(),
        lat: z.string().optional(),
        lng: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const { id, ...data } = input;

      // Verificación estricta de propiedad anti-IDOR
      const existing = await db.select().from(commerces).where(eq(commerces.id, id));
      if (!existing[0] || existing[0].merchantUserId !== ctx.merchant.id) {
        throw new Error("No tienes autorización para modificar este comercio");
      }

      const updateData: Record<string, any> = {};
      for (const [key, val] of Object.entries(data)) {
        if (val !== undefined) updateData[key] = val;
      }
      if (Object.keys(updateData).length > 0) {
        await db.update(commerces).set(updateData).where(eq(commerces.id, id));
      }
      const result = await db.select().from(commerces).where(eq(commerces.id, id));
      emit("admin:dashboard", { type: "dashboard_update" });
      emit("commerces:global", { type: "commerce_update", commerceId: id });
      emit(`commerce:${id}`, { type: "commerce_update", commerceId: id });
      emit("products:global", { type: "products_update", action: "commerce_update", commerceId: id });
      return result[0];
    }),

  toggleStatus: merchantQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const commerce = await db.select().from(commerces).where(eq(commerces.id, input.id));
      if (commerce.length === 0) return null;

      // Verificación estricta de propiedad anti-IDOR
      if (commerce[0].merchantUserId !== ctx.merchant.id) {
        throw new Error("No tienes autorización para alterar el estado de este comercio");
      }

      const newStatus = commerce[0].isOpen === "open" ? "closed" : "open";
      await db.update(commerces).set({ isOpen: newStatus }).where(eq(commerces.id, input.id));
      emit("admin:dashboard", { type: "dashboard_update" });
      emit("commerces:global", { type: "commerce_update", commerceId: input.id });
      emit(`commerce:${input.id}`, { type: "commerce_update", commerceId: input.id });
      emit("products:global", { type: "products_update", action: "commerce_update", commerceId: input.id });
      return { ...commerce[0], isOpen: newStatus };
    }),

  getStats: merchantQuery
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      await assertCommerceOwnership(ctx, input.id);
      const db = getDb();
      const [commerce] = await db
        .select({ commissionRate: commerces.commissionRate })
        .from(commerces)
        .where(eq(commerces.id, input.id));

      const prods = await db
        .select({
          id: products.id,
          name: products.name,
          price: products.price,
          image: products.image,
          category: products.category,
          unitType: products.unitType,
          isAvailable: products.isAvailable,
          isFeatured: products.isFeatured,
        })
        .from(products)
        .where(eq(products.commerceId, input.id));
      const productMap = new Map(prods.map((product) => [product.id, product]));

      // Una sola consulta agregada; sin N+1 por pedido.
      const rows = await db
        .select({
          orderId: orders.id,
          deliveredAt: orders.deliveredAt,
          createdAt: orders.createdAt,
          productId: orderItems.productId,
          productName: orderItems.productName,
          quantity: orderItems.quantity,
          unitPrice: orderItems.unitPrice,
          total: orderItems.total,
          commissionAmount: orderCommerceStatus.commissionAmount,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .leftJoin(
          orderCommerceStatus,
          and(
            eq(orderCommerceStatus.orderId, orders.id),
            eq(orderCommerceStatus.commerceId, input.id),
          ),
        )
        .where(
          and(
            eq(orderItems.commerceId, input.id),
            eq(orders.status, "delivered"),
          ),
        );

      const orderTotals = new Map<
        number,
        { total: number; deliveredAt: Date | null; commission: number | null }
      >();
      const productSales = new Map<
        number,
        { name: string; qty: number; revenue: number; unitPrice: number; unitType: string }
      >();

      for (const row of rows) {
        const quantity = Number(row.quantity);
        const total = Number(row.total);
        if (!Number.isFinite(quantity) || !Number.isFinite(total)) continue;

        const orderEntry = orderTotals.get(row.orderId) ?? {
          total: 0,
          deliveredAt: row.deliveredAt ?? row.createdAt,
          commission:
            row.commissionAmount !== null && row.commissionAmount !== undefined
              ? Number(row.commissionAmount)
              : null,
        };
        orderEntry.total += total;
        if (
          orderEntry.commission === null &&
          row.commissionAmount !== null &&
          row.commissionAmount !== undefined
        ) {
          orderEntry.commission = Number(row.commissionAmount);
        }
        orderTotals.set(row.orderId, orderEntry);

        const productEntry = productSales.get(row.productId) ?? {
          name: row.productName,
          qty: 0,
          revenue: 0,
          unitPrice: Number(row.unitPrice),
          unitType: productMap.get(row.productId)?.unitType ?? "unit",
        };
        productEntry.qty += quantity;
        productEntry.revenue += total;
        productSales.set(row.productId, productEntry);
      }

      const commissionRate = Number(commerce?.commissionRate ?? "10");
      let totalSales = 0;
      let totalCommission = 0;
      const dailyMap = new Map<string, number>();

      for (const order of orderTotals.values()) {
        totalSales += order.total;
        totalCommission +=
          order.commission !== null
            ? order.commission
            : order.total * (commissionRate / 100);

        const key = guayaquilDateKey(order.deliveredAt ?? new Date());
        dailyMap.set(key, (dailyMap.get(key) ?? 0) + order.total);
      }

      const totalOrders = orderTotals.size;
      const avgTicket = totalOrders > 0 ? totalSales / totalOrders : 0;

      const today = new Date();
      const dailySales = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(today.getTime() - (6 - index) * 86_400_000);
        const key = guayaquilDateKey(date);
        return {
          date: key,
          day: guayaquilWeekday(date),
          sales: Number((dailyMap.get(key) ?? 0).toFixed(2)),
        };
      });

      const topProducts = [...productSales.entries()]
        .map(([productId, value]) => {
          const product = productMap.get(productId);
          return {
            id: productId,
            productId,
            name: product?.name ?? value.name,
            sales: value.qty,
            salesCount: value.qty,
            revenue: Number(value.revenue.toFixed(2)),
            unitPrice: product?.price ?? value.unitPrice.toFixed(2),
            unitType: product?.unitType ?? value.unitType,
            category: product?.category ?? null,
          };
        })
        .sort((a, b) => b.sales - a.sales)
        .slice(0, 10);

      return {
        totalProducts: prods.length,
        availableProducts: prods.filter((product) => product.isAvailable === "yes").length,
        featuredProducts: prods.filter(
          (product) => product.isFeatured === "yes" && product.isAvailable === "yes",
        ).length,
        totalSales: Number(totalSales.toFixed(2)),
        totalOrders,
        avgTicket: Number(avgTicket.toFixed(2)),
        totalCommission: Number(totalCommission.toFixed(2)),
        topProducts,
        dailySales,
      };
    }),

  markReady: merchantQuery
    .input(z.object({ orderId: z.number().int().positive(), commerceId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await assertCommerceOwnership(ctx, input.commerceId);
      return markCommerceReadyForOrder(input.orderId, input.commerceId);
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
