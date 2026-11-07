/**
 * ==============================================================================
 * ENRUTADOR DE PRODUCTOS - PANEL ADMINISTRATIVO (ADMIN PRODUCTS ROUTER)
 * ==============================================================================
 * Gestiona la supervisión, auditoría y moderación global del catálogo de productos:
 * - listProducts: Consulta de inventario completo con comercio asignado y tipo de unidad
 * - topProducts: Ranking de productos con mayor recaudación y volumen en pedidos entregados
 * - listCategories: Listado de categorías de la plataforma ordenadas
 * - toggleProductAvailability: Moderación administrativa de disponibilidad
 * - deleteProduct: Eliminación administrativa segura de productos
 * ==============================================================================
 */

import { z } from "zod";
import { eq, desc, sql, inArray } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { products, commerces, categories, orderItems, orders } from "@db/schema";
import { adminQuery } from "../middleware";
import { emit } from "../events";

export const adminProductsProcedures = {
  // Listado exhaustivo de productos de todos los comercios
  listProducts: adminQuery.query(async () => {
    const db = getDb();
    return db
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
        createdAt: products.createdAt,
        unitType: products.unitType,
        commerceName: commerces.name,
      })
      .from(products)
      .leftJoin(commerces, eq(products.commerceId, commerces.id))
      .orderBy(desc(products.createdAt));
  }),

  // Ranking de productos más vendidos considerando únicamente pedidos válidos/entregados
  topProducts: adminQuery
    .input(z.object({ limit: z.number().default(10) }))
    .query(async ({ input }) => {
      const db = getDb();

      // Consultar únicamente ítems de pedidos entregados o activos no cancelados
      const validItems = await db
        .select({
          productId: orderItems.productId,
          productName: orderItems.productName,
          quantity: orderItems.quantity,
          total: orderItems.total,
          commerceId: orderItems.commerceId,
          orderStatus: orders.status,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .where(sql`${orders.status} NOT IN ('cancelled', 'payment_rejected')`);

      const productStats: Record<
        number,
        { id: number; name: string; commerceName: string; sold: number; revenue: number }
      > = {};

      const commerceIds = [...new Set(validItems.map((v) => v.commerceId))];
      const commMap = new Map<number, string>();
      if (commerceIds.length > 0) {
        const comms = await db
          .select({ id: commerces.id, name: commerces.name })
          .from(commerces)
          .where(inArray(commerces.id, commerceIds));
        comms.forEach((c) => commMap.set(c.id, c.name));
      }

      for (const item of validItems) {
        if (!productStats[item.productId]) {
          productStats[item.productId] = {
            id: item.productId,
            name: item.productName,
            commerceName: commMap.get(item.commerceId) || "",
            sold: 0,
            revenue: 0,
          };
        }
        productStats[item.productId].sold += parseFloat(String(item.quantity) || "0");
        productStats[item.productId].revenue += parseFloat(item.total || "0");
      }

      return Object.values(productStats)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, input.limit);
    }),

  // Listado de categorías maestras de la plataforma
  listCategories: adminQuery.query(async () => {
    const db = getDb();
    return db.select().from(categories).orderBy(categories.sortOrder);
  }),

  // Moderación administrativa: pausar o activar disponibilidad de un producto
  toggleProductAvailability: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const prod = await db.select().from(products).where(eq(products.id, input.id));
      if (!prod[0]) throw new Error("Producto no encontrado");

      const newAvailability = !prod[0].isAvailable;
      await db
        .update(products)
        .set({ isAvailable: newAvailability, updatedAt: new Date() })
        .where(eq(products.id, input.id));

      emit(`commerce:${prod[0].commerceId}`, { type: "catalog_update" });
      emit("admin:dashboard", { type: "dashboard_update" });
      return { success: true, isAvailable: newAvailability };
    }),

  // Moderación administrativa: eliminar un producto infractor
  deleteProduct: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const prod = await db.select().from(products).where(eq(products.id, input.id));
      if (!prod[0]) throw new Error("Producto no encontrado");

      await db.delete(products).where(eq(products.id, input.id));

      emit(`commerce:${prod[0].commerceId}`, { type: "catalog_update" });
      emit("admin:dashboard", { type: "dashboard_update" });
      return { success: true };
    }),
};
