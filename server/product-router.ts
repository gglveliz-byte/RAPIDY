import { z } from "zod";
import { createRouter, publicQuery, merchantQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { products, commerces, orderItems } from "@db/schema";
import { eq, and, or, ilike, sql, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { emit } from "./events";
import { assertCommerceOwnership, merchantOwnsCommerce } from "./lib/order-access";

const priceSchema = z
  .string()
  .trim()
  .regex(/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/, "El precio debe ser un decimal válido")
  .refine((value) => Number.isFinite(Number(value)) && Number(value) > 0, {
    message: "El precio debe ser mayor que cero",
  })
  .transform((value) => Number(value).toFixed(2));

const imageSchema = z
  .string()
  .trim()
  .max(2_000_000, "La imagen es demasiado grande")
  .refine(
    (value) =>
      value === "" ||
      /^https:\/\//i.test(value) ||
      /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(value),
    "La imagen debe ser una URL HTTPS o una imagen JPG/PNG/WEBP",
  );

const productCreateSchema = z.object({
  commerceId: z.number().int().positive(),
  name: z.string().trim().min(1, "El nombre es obligatorio").max(200),
  description: z.string().trim().max(2000).optional(),
  price: priceSchema,
  image: imageSchema.optional(),
  category: z.string().trim().max(100).optional(),
  isFeatured: z.enum(["yes", "no"]).default("no"),
  isAvailable: z.enum(["yes", "no"]).default("yes"),
  unitType: z.enum(["unit", "kg"]).default("unit"),
});

const productUpdateSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1, "El nombre es obligatorio").max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  price: priceSchema.optional(),
  image: imageSchema.optional(),
  category: z.string().trim().max(100).optional(),
  isFeatured: z.enum(["yes", "no"]).optional(),
  isAvailable: z.enum(["yes", "no"]).optional(),
  unitType: z.enum(["unit", "kg"]).optional(),
});

const catalogProductColumns = {
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
  commerceLogo: commerces.logo,
  commerceCategoryId: commerces.categoryId,
  commerceIsOpen: commerces.isOpen,
  commerceStatus: commerces.status,
};

export const productRouter = createRouter({
  list: publicQuery.query(async () => {
    const db = getDb();
    return db
      .select(catalogProductColumns)
      .from(products)
      .innerJoin(commerces, eq(products.commerceId, commerces.id))
      .where(
        and(
          eq(products.isAvailable, "yes"),
          eq(products.adminPaused, false),
          eq(commerces.status, "active"),
          eq(commerces.isOpen, "open"),
        ),
      );
  }),

  getById: publicQuery
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = getDb();
      const result = await db
        .select(catalogProductColumns)
        .from(products)
        .innerJoin(commerces, eq(products.commerceId, commerces.id))
        .where(
          and(
            eq(products.id, input.id),
            eq(products.isAvailable, "yes"),
            eq(products.adminPaused, false),
            eq(commerces.status, "active"),
            eq(commerces.isOpen, "open"),
          ),
        );
      return result[0] || null;
    }),

  getByCommerce: publicQuery
    .input(z.object({ commerceId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const isOwner =
        !!ctx.admin || (ctx.merchant ? await merchantOwnsCommerce(ctx, input.commerceId) : false);
      const rows = await db
        .select({ product: products, commerceStatus: commerces.status })
        .from(products)
        .innerJoin(commerces, eq(products.commerceId, commerces.id))
        .where(eq(products.commerceId, input.commerceId));
      if (isOwner) return rows.map((row) => row.product);
      return rows
        .filter(
          (row) =>
            row.commerceStatus === "active" &&
            row.product.isAvailable === "yes" &&
            !row.product.adminPaused,
        )
        .map((row) => row.product);
    }),

  getFeatured: publicQuery.query(async () => {
    const db = getDb();
    return db
      .select(catalogProductColumns)
      .from(products)
      .innerJoin(commerces, eq(products.commerceId, commerces.id))
      .where(
        and(
          eq(products.isFeatured, "yes"),
          eq(products.isAvailable, "yes"),
          eq(products.adminPaused, false),
          eq(commerces.status, "active"),
          eq(commerces.isOpen, "open"),
        ),
      );
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
      .select(catalogProductColumns)
      .from(products)
      .innerJoin(commerces, eq(products.commerceId, commerces.id))
      .where(
        and(
          eq(products.isAvailable, "yes"),
          eq(products.adminPaused, false),
          eq(commerces.status, "active"),
          eq(commerces.isOpen, "open"),
        ),
      );

    const sorted = [...allProducts].sort((a, b) => {
      const salesA = countMap.get(a.id) ?? (a.isFeatured === "yes" ? 20 - a.id : 0);
      const salesB = countMap.get(b.id) ?? (b.isFeatured === "yes" ? 20 - b.id : 0);
      return salesB - salesA;
    });

    return sorted.slice(0, 6);
  }),

  search: publicQuery
    .input(z.object({ query: z.string().trim().min(1).max(100) }))
    .query(async ({ input }) => {
      const db = getDb();
      const term = `%${input.query}%`;
      return db
        .select(catalogProductColumns)
        .from(products)
        .innerJoin(commerces, eq(products.commerceId, commerces.id))
        .where(
          and(
            or(ilike(products.name, term), ilike(commerces.name, term)),
            eq(products.isAvailable, "yes"),
            eq(products.adminPaused, false),
            eq(commerces.status, "active"),
            eq(commerces.isOpen, "open"),
          ),
        )
        .orderBy(desc(products.isFeatured), products.name)
        .limit(30);
    }),

  create: merchantQuery
    .input(productCreateSchema)
    .mutation(async ({ input, ctx }) => {
      await assertCommerceOwnership(ctx, input.commerceId);
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
    .input(productUpdateSchema)
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const { id, ...data } = input;

      try {
        const existing = await db
          .select({
            id: products.id,
            commerceId: products.commerceId,
            adminPaused: products.adminPaused,
          })
          .from(products)
          .where(eq(products.id, id));
        if (!existing.length) throw new TRPCError({ code: "NOT_FOUND", message: "Producto no encontrado" });
        const commerceId = existing[0].commerceId;
        await assertCommerceOwnership(ctx, commerceId);

        if (existing[0].adminPaused && data.isAvailable === "yes") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Este producto está pausado por la administración. Contacta al administrador para reactivarlo.",
          });
        }

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
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      try {
        const existing = await db.select({ id: products.id, commerceId: products.commerceId }).from(products).where(eq(products.id, input.id));
        if (!existing.length) throw new TRPCError({ code: "NOT_FOUND", message: "Producto no encontrado" });
        const commerceId = existing[0].commerceId;
        await assertCommerceOwnership(ctx, commerceId);

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
