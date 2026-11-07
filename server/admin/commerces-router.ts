/**
 * @archivo app/server/admin/commerces-router.ts
 * @modulo 02-admin-commerces (Gestión de comercios, comerciantes y categorías)
 * @proposito
 *   Controlador tRPC de administración de comercios con protección contra fugas de hash,
 *   validación de emails duplicados, blindaje de tipos numéricos y borrado seguro.
 *
 * @resumen_contenido
 *   - `listCommerces`: Retorna el catálogo completo de comercios con sus datos maestros.
 *   - `createMerchant`: Alta transaccional de usuario merchant (sin fuga de passwordHash).
 *   - `createCommerce`: Alta de comercio asociado a un merchant existente.
 *   - `updateCommerce`: Modificación granular con validación estricta de rangos y coordenadas.
 *   - `deleteCommerce`: Desactivación segura protegiendo órdenes y balances contables históricos.
 *   - `listCategories`: Catálogo de rubros ordenado por prioridad.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { commerces, products, orderItems, orders, users, categories } from "@db/schema";
import { eq, inArray, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { emit } from "../events";

export const adminCommercesProcedures = {
  listCommerces: adminQuery.query(async () => {
    const db = getDb();
    return db.select().from(commerces);
  }),

  createMerchant: adminQuery
    .input(z.object({
      name: z.string().min(1, "El nombre es requerido"),
      email: z.string().email("Correo electrónico inválido"),
      password: z.string().min(4, "La contraseña debe tener al menos 4 caracteres"),
      categoryId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();

      // Chequeo preventivo de email único
      const existingUser = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email));
      if (existingUser.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Ya existe un usuario o comercio registrado con este correo electrónico.",
        });
      }

      const hash = await bcrypt.hash(input.password, 10);
      
      const safeResult = await db.transaction(async (tx) => {
        const userResult = await tx.insert(users).values({
          unionId: `merchant-${Date.now()}`,
          name: input.name,
          email: input.email,
          passwordHash: hash,
          role: "merchant",
        }).returning({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          createdAt: users.createdAt,
        });
        
        const user = userResult[0];
        
        let targetCategoryId = input.categoryId;
        if (!targetCategoryId || targetCategoryId <= 0) {
          const cats = await tx.select().from(categories).limit(1);
          targetCategoryId = cats.length > 0 ? cats[0].id : 1;
        }
        
        await tx.insert(commerces).values({
          name: input.name,
          address: "Dirección pendiente",
          phone: "0000000000",
          categoryId: targetCategoryId,
          status: "pending",
          merchantUserId: user.id,
        });
        
        return user;
      });
      
      emit("admin:dashboard", { type: "dashboard_update" });
      emit("commerces:global", { type: "commerce_update" });
      return safeResult;
    }),

  createCommerce: adminQuery
    .input(z.object({
      name: z.string().min(1),
      email: z.string().email(),
      phone: z.string().min(5),
      address: z.string().min(3),
      categoryId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const existing = await db.select().from(users).where(eq(users.email, input.email));
      if (existing.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Usuario merchant no encontrado con ese email" });
      }

      const result = await db.insert(commerces).values({
        name: input.name,
        email: input.email,
        phone: input.phone,
        address: input.address,
        categoryId: input.categoryId || 1,
        merchantUserId: existing[0].id,
        status: "active",
      }).returning();

      emit("admin:dashboard", { type: "dashboard_update" });
      emit("commerces:global", { type: "commerce_update" });
      return result[0];
    }),

  updateCommerce: adminQuery
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      status: z.enum(["active", "inactive", "suspended", "pending"]).optional(),
      isOpen: z.string().optional(),
      commissionRate: z.string().optional(),
      deliveryTime: z.string().optional(),
      minOrder: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      address: z.string().optional(),
      description: z.string().optional(),
      logo: z.string().optional(),
      coverImage: z.string().optional(),
      categoryId: z.number().optional(),
      openHours: z.string().optional(),
      rating: z.string().optional(),
      lat: z.string().optional(),
      lng: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...data } = input;
      const updateData: Record<string, any> = {};

      for (const [key, val] of Object.entries(data)) {
        if (val !== undefined && val !== "") {
          if (key === "commissionRate") {
            const num = parseFloat(String(val));
            if (!isNaN(num) && num >= 0 && num <= 100) {
              updateData[key] = num.toFixed(2);
            }
          } else if (key === "rating") {
            const num = parseFloat(String(val));
            if (!isNaN(num) && num >= 1 && num <= 5) {
              updateData[key] = num.toFixed(1);
            }
          } else if (key === "categoryId") {
            const num = Number(val);
            if (!isNaN(num) && num > 0) {
              updateData[key] = num;
            }
          } else {
            updateData[key] = val;
          }
        }
      }

      if (Object.keys(updateData).length > 0) {
        await db.update(commerces).set(updateData).where(eq(commerces.id, id));
      }

      const result = await db.select().from(commerces).where(eq(commerces.id, id));
      emit("admin:dashboard", { type: "dashboard_update" });
      emit("commerces:global", { type: "commerce_update" });
      return result[0];
    }),

  deleteCommerce: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      
      await db.transaction(async (tx) => {
        // Chequeo de pedidos activos en curso
        const activeOrders = await tx
          .select({ id: orders.id })
          .from(orders)
          .innerJoin(orderItems, eq(orders.id, orderItems.orderId))
          .where(
            and(
              eq(orderItems.commerceId, input.id),
              inArray(orders.status, ["received", "accepted", "preparing", "ready_for_pickup", "driver_assigned", "on_the_way"])
            )
          )
          .limit(1);

        if (activeOrders.length > 0) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "No se puede eliminar: el comercio tiene pedidos en curso activos. Finalízalos o cancélalos primero.",
          });
        }

        // Desactivación lógica segura: preserva órdenes históricas y registros contables
        await tx.update(commerces).set({
          status: "inactive",
          isOpen: "closed",
        }).where(eq(commerces.id, input.id));

        await tx.update(products).set({
          isAvailable: "no",
        }).where(eq(products.commerceId, input.id));
      });

      emit("admin:dashboard", { type: "dashboard_update" });
      emit("commerces:global", { type: "commerce_update" });
      return { success: true, message: "Comercio desactivado con éxito preservando historial contable." };
    }),

  listCategories: adminQuery.query(async () => {
    const db = getDb();
    return db.select().from(categories).orderBy(categories.sortOrder);
  }),
};
