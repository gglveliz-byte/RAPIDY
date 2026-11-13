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
        id: z.number().int().positive(),
        name: z.string().trim().min(1, "El nombre es obligatorio").max(200).optional(),
        description: z.string().trim().max(2000).optional(),
        address: z.string().trim().min(3, "La dirección es obligatoria").max(500).optional(),
        phone: z
          .string()
          .trim()
          .max(20)
          .refine(
            (value) => value === "" || /^[+0-9 ()-]{6,20}$/.test(value),
            "El teléfono no es válido",
          )
          .optional(),
        logo: z
          .string()
          .trim()
          .max(2_000_000, "El logo es demasiado grande")
          .refine(
            (value) =>
              value === "" ||
              /^https:\/\//i.test(value) ||
              /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(value),
            "El logo debe ser una URL HTTPS o una imagen JPG/PNG/WEBP",
          )
          .optional(),
        coverImage: z
          .string()
          .trim()
          .max(2_000_000, "La portada es demasiado grande")
          .refine(
            (value) =>
              value === "" ||
              /^https:\/\//i.test(value) ||
              /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(value),
            "La portada debe ser una URL HTTPS o una imagen JPG/PNG/WEBP",
          )
          .optional(),
        minOrder: z
          .string()
          .trim()
          .regex(
            /^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/,
            "El mínimo debe ser un decimal válido",
          )
          .optional()
          .or(z.literal("")),
        deliveryTime: z.string().trim().max(50).optional(),
        isOpen: z.enum(["open", "closed"]).optional(),
        openHours: z.string().trim().max(200).optional(),
        lat: z
          .string()
          .trim()
          .regex(/^-?\d{1,2}(\.\d{1,8})?$/, "Latitud inválida")
          .optional()
          .or(z.literal("")),
        lng: z
          .string()
          .trim()
          .regex(/^-?\d{1,3}(\.\d{1,8})?$/, "Longitud inválida")
          .optional()
          .or(z.literal("")),
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
        if (val === undefined) continue;
        if (val === "" && ["minOrder", "lat", "lng"].includes(key)) continue;
        updateData[key] = key === "minOrder" ? Number(val).toFixed(2) : val;
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
      const updated = await db.transaction(async (tx) => {
        const rows = await tx
          .select()
          .from(commerces)
          .where(eq(commerces.id, input.id))
          .for("update")
          .limit(1);
        const commerce = rows[0];
        if (!commerce) return null;
        if (commerce.merchantUserId !== ctx.merchant.id) {
          throw new Error("No tienes autorización para alterar el estado de este comercio");
        }

        const newStatus = commerce.isOpen === "open" ? "closed" : "open";
        const result = await tx
          .update(commerces)
          .set({ isOpen: newStatus })
          .where(eq(commerces.id, input.id))
          .returning();
        return result[0];
      });

      if (!updated) return null;
      emit("admin:dashboard", { type: "dashboard_update" });
      emit("commerces:global", { type: "commerce_update", commerceId: input.id });
      emit(`commerce:${input.id}`, { type: "commerce_update", commerceId: input.id });
      emit("products:global", { type: "products_update", action: "commerce_update", commerceId: input.id });
      return updated;
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
    .input(z.object({ token: z.string().max(4096) }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!ctx.merchant?.id) return { success: false };
      await db.update(users).set({ fcmToken: input.token }).where(eq(users.id, ctx.merchant.id));
      return { success: true };
    }),

  unregisterDeviceToken: merchantQuery.mutation(async ({ ctx }) => {
    const db = getDb();
    await db.update(users).set({ fcmToken: null }).where(eq(users.id, ctx.merchant.id));
    return { success: true };
  }),
});
