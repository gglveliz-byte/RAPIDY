/**
 * ==============================================================================
 * ENRUTADOR DE PRODUCTOS - PANEL ADMINISTRATIVO (ADMIN PRODUCTS ROUTER)
 * ==============================================================================
 * Gestiona la supervisión, auditoría y moderación global del catálogo de productos:
 * - listProducts: inventario paginado con comercio asignado
 * - topProducts: ranking agregado en SQL sobre pedidos entregados
 * - listCategories: catálogo de categorías
 * - toggleProductAvailability: pausa administrativa irreversible por el merchant
 * - toggleProductFeatured: moderación de destacados
 * - deleteProduct: eliminación segura con historial protegido
 * ==============================================================================
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, desc, sql, inArray } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { products, commerces, categories, orderItems, orders } from "@db/schema";
import { adminQuery } from "../middleware";
import { emit } from "../events";

export const adminProductsProcedures = {
  // Listado paginado de productos de todos los comercios.
  listProducts: adminQuery
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(500).default(200),
          offset: z.number().int().min(0).default(0),
        })
        .default({ limit: 200, offset: 0 }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      return db
        .select({
          id: products.id,
          commerceId: products.commerceId,
          name: products.name,
          price: products.price,
          image: products.image,
          category: products.category,
          isFeatured: products.isFeatured,
          isAvailable: products.isAvailable,
          adminPaused: products.adminPaused,
          preparationTime: products.preparationTime,
          createdAt: products.createdAt,
          unitType: products.unitType,
          commerceName: commerces.name,
        })
        .from(products)
        .leftJoin(commerces, eq(products.commerceId, commerces.id))
        .orderBy(desc(products.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  // Ranking agregado en SQL: no materializa todo el historial en JS.
  topProducts: adminQuery
    .input(z.object({ limit: z.number().int().min(1).max(100).default(10) }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select({
          productId: orderItems.productId,
          productName: sql<string>`max(${orderItems.productName})`,
          commerceId: orderItems.commerceId,
          sold: sql<string>`sum(${orderItems.quantity})`,
          revenue: sql<string>`sum(${orderItems.total})`,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .where(eq(orders.status, "delivered"))
        .groupBy(orderItems.productId, orderItems.commerceId)
        .orderBy(sql`sum(${orderItems.total}) desc`)
        .limit(input.limit);

      const commerceIds = [...new Set(rows.map((row) => row.commerceId))];
      const comms = commerceIds.length
        ? await db
            .select({ id: commerces.id, name: commerces.name })
            .from(commerces)
            .where(inArray(commerces.id, commerceIds))
        : [];
      const commMap = new Map(comms.map((commerce) => [commerce.id, commerce.name]));

      return rows.map((row) => ({
        id: row.productId,
        name: row.productName,
        commerceName: commMap.get(row.commerceId) || "",
        sold: Number(row.sold || 0),
        revenue: Number(row.revenue || 0),
      }));
    }),

  listCategories: adminQuery.query(async () => {
    const db = getDb();
    return db.select().from(categories).orderBy(categories.sortOrder);
  }),

  // Moderación administrativa: pausar o reactivar un producto. El merchant no
  // puede revertir la pausa: product.update rechaza isAvailable=yes.
  toggleProductAvailability: adminQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const result = await db.transaction(async (tx) => {
        const rows = await tx
          .select()
          .from(products)
          .where(eq(products.id, input.id))
          .for("update");
        const product = rows[0];
        if (!product) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Producto no encontrado" });
        }
        const nextPaused = !product.adminPaused;
        await tx
          .update(products)
          .set({
            adminPaused: nextPaused,
            isAvailable: nextPaused ? "no" : "yes",
          })
          .where(eq(products.id, input.id));
        return { product, nextPaused };
      });

      emit(`commerce:${result.product.commerceId}`, {
        type: "catalog_update",
        productId: input.id,
      });
      emit("products:global", {
        type: "catalog_update",
        productId: input.id,
        commerceId: result.product.commerceId,
      });
      emit("admin:dashboard", { type: "dashboard_update" });
      return {
        success: true,
        adminPaused: result.nextPaused,
        isAvailable: result.nextPaused ? "no" : "yes",
      };
    }),

  toggleProductFeatured: adminQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const rows = await db.select().from(products).where(eq(products.id, input.id));
      const product = rows[0];
      if (!product) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Producto no encontrado" });
      }
      const nextFeatured = product.isFeatured === "yes" ? "no" : "yes";
      await db
        .update(products)
        .set({ isFeatured: nextFeatured })
        .where(eq(products.id, input.id));
      emit(`commerce:${product.commerceId}`, {
        type: "catalog_update",
        productId: input.id,
      });
      emit("products:global", {
        type: "catalog_update",
        productId: input.id,
        commerceId: product.commerceId,
      });
      emit("admin:dashboard", { type: "dashboard_update" });
      return { success: true, isFeatured: nextFeatured };
    }),

  // El borrado físico solo se permite si el producto nunca participó en un
  // pedido; de lo contrario se conserva el snapshot histórico.
  deleteProduct: adminQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const rows = await db.select().from(products).where(eq(products.id, input.id));
      const product = rows[0];
      if (!product) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Producto no encontrado" });
      }

      const used = await db
        .select({ id: orderItems.id })
        .from(orderItems)
        .where(eq(orderItems.productId, input.id))
        .limit(1);
      if (used.length > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "El producto tiene ventas registradas. Pausarlo en lugar de borrarlo para conservar el historial.",
        });
      }

      await db.delete(products).where(eq(products.id, input.id));

      emit(`commerce:${product.commerceId}`, { type: "catalog_update", productId: input.id });
      emit("products:global", {
        type: "catalog_update",
        productId: input.id,
        commerceId: product.commerceId,
      });
      emit("admin:dashboard", { type: "dashboard_update" });
      return { success: true };
    }),
};