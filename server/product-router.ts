import { z } from "zod";
import { createRouter, publicQuery, merchantQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { products, commerces, orderItems } from "@db/schema";
import { eq, like, and, sql, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { emit } from "./events";

export const productRouter = createRouter({
  list: publicQuery.query(async () => {
    const db = getDb();
    return db.select().from(products).where(eq(products.isAvailable, "yes"));
  }),

  getById: publicQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const result = await db.select().from(products).where(eq(products.id, input.id));
      return result[0] || null;
    }),

  getByCommerce: publicQuery
    .input(z.object({ commerceId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db.select().from(products).where(eq(products.commerceId, input.commerceId));
    }),

  getFeatured: publicQuery.query(async () => {
    const db = getDb();
    const rows = await db
      .select({
        id: products.id,
        commerceId: products.commerceId,
        name: products.name,
        description: products.description,
        price: products.price,
        image: products.image,
        category: products.category,
        isFeatured: products.isFeatured,
        isAvailable: products.isAvailable,
        preparationTime: products.preparationTime,
        unitType: products.unitType,
        commerceName: commerces.name,
      })
      .from(products)
      .leftJoin(commerces, eq(products.commerceId, commerces.id))
      .where(and(eq(products.isFeatured, "yes"), eq(products.isAvailable, "yes")));
    return rows;
  }),

  getTopOrdered: publicQuery.query(async () => {
    const db = getDb();
    const orderStats = await db
      .select({
        productId: orderItems.productId,
        orderCount: sql<number>`cast(count(${orderItems.id}) as int)`,
        totalQty: sql<number>`cast(sum(${orderItems.quantity}) as float)`,
      })
      .from(orderItems)
      .groupBy(orderItems.productId)
      .orderBy(sql`sum(${orderItems.quantity}) desc`)
      .limit(8);

    const countMap = new Map<number, number>();
    orderStats.forEach((stat) => {
      countMap.set(stat.productId, stat.totalQty || stat.orderCount || 1);
    });

    const allProducts = await db
      .select({
        id: products.id,
        commerceId: products.commerceId,
        name: products.name,
        description: products.description,
        price: products.price,
        image: products.image,
        category: products.category,
        isFeatured: products.isFeatured,
        isAvailable: products.isAvailable,
        preparationTime: products.preparationTime,
        unitType: products.unitType,
        commerceName: commerces.name,
      })
      .from(products)
      .leftJoin(commerces, eq(products.commerceId, commerces.id))
      .where(eq(products.isAvailable, "yes"));

    const sorted = [...allProducts].sort((a, b) => {
      const salesA = countMap.get(a.id) ?? (a.isFeatured === "yes" ? 20 - a.id : 0);
      const salesB = countMap.get(b.id) ?? (b.isFeatured === "yes" ? 20 - b.id : 0);
      return salesB - salesA;
    });

    return sorted.slice(0, 6);
  }),

  search: publicQuery
    .input(z.object({ query: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db.select().from(products).where(
        and(like(products.name, `%${input.query}%`), eq(products.isAvailable, "yes"))
      );
    }),

  create: merchantQuery
    .input(
      z.object({
        commerceId: z.number(),
        name: z.string().min(1),
        description: z.string().optional(),
        price: z.string(),
        image: z.string().optional(),
        category: z.string().optional(),
        isFeatured: z.enum(["yes", "no"]).default("no"),
        isAvailable: z.enum(["yes", "no"]).default("yes"),
        unitType: z.enum(["unit", "kg"]).default("unit"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!Number.isFinite(input.commerceId) || input.commerceId < 1) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "commerceId inválido" });
      }
      const db = getDb();
      try {
        const commerce = await db.select({ id: commerces.id }).from(commerces).where(eq(commerces.id, input.commerceId));
        if (!commerce.length) throw new TRPCError({ code: "NOT_FOUND", message: "Comercio no encontrado" });
        const result = await db.insert(products).values(input).returning();

        emit(`commerce:${input.commerceId}`, { type: "products_update", action: "create" });
        emit("products:global", { type: "products_update", action: "create" });

        return result[0];
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        console.error("[product.create] DB error:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "No se pudo crear el producto",
          cause: err,
        });
      }
    }),

  update: merchantQuery
    .input(
      z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        price: z.string().optional(),
        image: z.string().optional(),
        category: z.string().optional(),
        isFeatured: z.enum(["yes", "no"]).optional(),
        isAvailable: z.enum(["yes", "no"]).optional(),
        unitType: z.enum(["unit", "kg"]).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...data } = input;

      try {
        const existing = await db.select({ id: products.id, commerceId: products.commerceId }).from(products).where(eq(products.id, id));
        if (!existing.length) throw new TRPCError({ code: "NOT_FOUND", message: "Producto no encontrado" });
        const commerceId = existing[0].commerceId;

        const updateData: Record<string, any> = {};
        for (const [key, val] of Object.entries(data)) {
          if (val !== undefined) updateData[key] = val;
        }

        if (Object.keys(updateData).length > 0) {
          await db.update(products).set(updateData).where(eq(products.id, id));
        }
        const result = await db.select().from(products).where(eq(products.id, id));

        emit(`commerce:${commerceId}`, { type: "products_update", action: "update", productId: id });
        emit("products:global", { type: "products_update", action: "update", productId: id });

        return result[0];
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        console.error("[product.update] DB error:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "No se pudo actualizar el producto",
          cause: err,
        });
      }
    }),

  delete: merchantQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      try {
        const existing = await db.select({ id: products.id, commerceId: products.commerceId }).from(products).where(eq(products.id, input.id));
        if (!existing.length) throw new TRPCError({ code: "NOT_FOUND", message: "Producto no encontrado" });
        const commerceId = existing[0].commerceId;

        await db.delete(products).where(eq(products.id, input.id));

        emit(`commerce:${commerceId}`, { type: "products_update", action: "delete", productId: input.id });
        emit("products:global", { type: "products_update", action: "delete", productId: input.id });

        return { success: true };
      } catch (err: any) {
        if (err instanceof TRPCError) throw err;
        console.error("[product.delete] DB error:", err);
        
        if (err?.code === '23503' || err?.message?.includes('foreign key constraint')) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "No se puede eliminar un producto con historial de pedidos. Por favor, márquelo como inactivo.",
          });
        }
        
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "No se pudo eliminar el producto",
          cause: err,
        });
      }
    }),
});
