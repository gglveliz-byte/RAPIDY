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
import { eq, and, notInArray, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { emit } from "../events";

const MAX_IMAGE_CHARS = 4_000_000;
const decimal = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .refine((value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed >= min && parsed <= max;
    }, `${label} debe ser un número entre ${min} y ${max}`);

const optionalImage = z.string().max(MAX_IMAGE_CHARS, "La imagen supera el máximo de 3 MB").optional();

export const adminCommercesProcedures = {
  listCommerces: adminQuery.query(async () => {
    const db = getDb();
    const rows = await db
      .select({
        commerce: commerces,
        merchantEmail: users.email,
        merchantName: users.name,
      })
      .from(commerces)
      .leftJoin(users, eq(users.id, commerces.merchantUserId))
      .orderBy(commerces.name);

    return rows.map((row) => ({
      ...row.commerce,
      merchantEmail: row.merchantEmail,
      merchantName: row.merchantName,
    }));
  }),

  createMerchant: adminQuery
    .input(z.object({
      name: z.string().trim().min(2, "El nombre es requerido").max(255),
      email: z.string().trim().email("Correo electrónico inválido").max(320),
      password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres").max(72),
      categoryId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const email = input.email.trim().toLowerCase();

      // Chequeo preventivo de email único, insensible a mayúsculas.
      const existingUser = await db
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${email}`);
      if (existingUser.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Ya existe un usuario o comercio registrado con este correo electrónico.",
        });
      }

      let targetCategoryId = input.categoryId;
      if (targetCategoryId) {
        const category = await db
          .select({ id: categories.id })
          .from(categories)
          .where(eq(categories.id, targetCategoryId))
          .limit(1);
        if (category.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "La categoría no existe." });
        }
      } else {
        const cats = await db.select().from(categories).limit(1);
        targetCategoryId = cats.length > 0 ? cats[0].id : undefined;
      }
      if (!targetCategoryId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No hay categorías configuradas para crear el comercio.",
        });
      }

      const hash = await bcrypt.hash(input.password, 10);

      const safeResult = await db.transaction(async (tx) => {
        const userResult = await tx.insert(users).values({
          unionId: `merchant-${Date.now()}`,
          name: input.name,
          email,
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
      name: z.string().trim().min(2).max(200),
      email: z.string().trim().email(),
      phone: z.string().trim().min(7).max(20),
      address: z.string().trim().min(5).max(500),
      categoryId: z.number().int().positive(),
      lat: decimal("La latitud", -90, 90).optional(),
      lng: decimal("La longitud", -180, 180).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const email = input.email.trim().toLowerCase();
      const existing = await db.select().from(users).where(eq(users.email, email));
      const merchant = existing[0];
      if (!merchant || merchant.role !== "merchant") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Usuario merchant no encontrado con ese email",
        });
      }
      const owned = await db
        .select({ id: commerces.id })
        .from(commerces)
        .where(eq(commerces.merchantUserId, merchant.id))
        .limit(1);
      if (owned.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Ese usuario ya tiene un comercio asociado.",
        });
      }
      const category = await db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.id, input.categoryId))
        .limit(1);
      if (category.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "La categoría no existe." });
      }

      const result = await db.insert(commerces).values({
        name: input.name,
        email,
        phone: input.phone.replace(/\D/g, ""),
        address: input.address,
        categoryId: input.categoryId,
        lat: input.lat,
        lng: input.lng,
        merchantUserId: merchant.id,
        status: "pending",
      }).returning();

      emit("admin:dashboard", { type: "dashboard_update" });
      emit("commerces:global", { type: "commerce_update" });
      return result[0];
    }),

  updateCommerce: adminQuery
    .input(z.object({
      id: z.number().int().positive(),
      name: z.string().trim().min(2).max(200).optional(),
      status: z.enum(["active", "inactive", "suspended", "pending"]).optional(),
      isOpen: z.enum(["open", "closed"]).optional(),
      commissionRate: decimal("La comisión", 0, 100).optional(),
      deliveryTime: z.string().trim().max(50).optional(),
      minOrder: decimal("El pedido mínimo", 0, 100_000).optional(),
      phone: z.string().trim().max(20).optional(),
      email: z.union([z.string().trim().email(), z.literal("")]).optional(),
      address: z.string().trim().min(5).max(500).optional(),
      description: z.string().max(2_000).optional(),
      logo: optionalImage,
      coverImage: optionalImage,
      categoryId: z.number().int().positive().optional(),
      openHours: z.string().max(500).optional(),
      rating: decimal("La calificación", 1, 5).optional(),
      lat: decimal("La latitud", -90, 90).optional(),
      lng: decimal("La longitud", -180, 180).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...data } = input;

      const result = await db.transaction(async (tx) => {
        const existingRows = await tx
          .select()
          .from(commerces)
          .where(eq(commerces.id, id))
          .for("update");
        const existing = existingRows[0];
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Comercio no encontrado" });
        }

        if (data.categoryId !== undefined) {
          const category = await tx
            .select({ id: categories.id })
            .from(categories)
            .where(eq(categories.id, data.categoryId))
            .limit(1);
          if (category.length === 0) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "La categoría no existe." });
          }
        }

        if (data.status === "active") {
          const address = data.address ?? existing.address;
          const phone = (data.phone ?? existing.phone).replace(/\D/g, "");
          const lat = data.lat ?? existing.lat;
          const lng = data.lng ?? existing.lng;
          const merchantUserId = existing.merchantUserId;
          if (
            !address ||
            address.toLowerCase().includes("pendiente") ||
            phone.length < 7 ||
            phone === "0000000000" ||
            lat === null ||
            lng === null ||
            !merchantUserId
          ) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message:
                "Para activar el comercio completa dirección real, teléfono, coordenadas y un merchant asignado.",
            });
          }
        }

        const updateData: Partial<typeof commerces.$inferInsert> = {};

        if (data.name !== undefined) updateData.name = data.name;
        if (data.status !== undefined) updateData.status = data.status;
        if (data.isOpen !== undefined) updateData.isOpen = data.isOpen;
        if (data.commissionRate !== undefined) {
          updateData.commissionRate = Number(data.commissionRate).toFixed(2);
        }
        if (data.rating !== undefined) updateData.rating = Number(data.rating).toFixed(1);
        if (data.categoryId !== undefined) updateData.categoryId = data.categoryId;
        if (data.minOrder !== undefined) updateData.minOrder = Number(data.minOrder).toFixed(2);
        if (data.lat !== undefined) updateData.lat = Number(data.lat).toFixed(8);
        if (data.lng !== undefined) updateData.lng = Number(data.lng).toFixed(8);
        if (data.deliveryTime !== undefined) {
          updateData.deliveryTime = data.deliveryTime || null;
        }
        if (data.openHours !== undefined) updateData.openHours = data.openHours || null;
        if (data.phone !== undefined) {
          const normalized = data.phone.replace(/\D/g, "");
          if (normalized.length < 7) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "El teléfono debe tener al menos 7 dígitos.",
            });
          }
          updateData.phone = normalized;
        }
        if (data.email !== undefined) updateData.email = data.email || null;
        if (data.address !== undefined) updateData.address = data.address;
        if (data.description !== undefined) updateData.description = data.description || null;
        if (data.logo !== undefined) updateData.logo = data.logo || null;
        if (data.coverImage !== undefined) updateData.coverImage = data.coverImage || null;

        if (Object.keys(updateData).length > 0) {
          await tx.update(commerces).set(updateData).where(eq(commerces.id, id));
        }

        const updated = await tx.select().from(commerces).where(eq(commerces.id, id));
        return updated[0];
      });

      emit("admin:dashboard", { type: "dashboard_update" });
      emit("commerces:global", { type: "commerce_update", commerceId: id });
      emit(`commerce:${id}`, { type: "commerce_update", commerceId: id });
      for (const productEvent of ["products:global"]) {
        emit(productEvent, { type: "catalog_update", commerceId: id });
      }
      return result;
    }),

  deleteCommerce: adminQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = getDb();

      const merchantUserId = await db.transaction(async (tx) => {
        const commerceRows = await tx
          .select()
          .from(commerces)
          .where(eq(commerces.id, input.id))
          .for("update");
        const commerce = commerceRows[0];
        if (!commerce) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Comercio no encontrado" });
        }

        // Todo estado no terminal bloquea la desactivación: pendientes de pago,
        // recibidos, en preparación, retirados y en camino.
        const activeOrders = await tx
          .select({ id: orders.id })
          .from(orders)
          .innerJoin(orderItems, eq(orders.id, orderItems.orderId))
          .where(
            and(
              eq(orderItems.commerceId, input.id),
              notInArray(orders.status, ["delivered", "cancelled"]),
            ),
          )
          .limit(1);

        if (activeOrders.length > 0) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "No se puede desactivar: el comercio tiene pedidos en curso. Finalízalos o cancélalos primero.",
          });
        }

        await tx.update(commerces).set({
          status: "inactive",
          isOpen: "closed",
        }).where(eq(commerces.id, input.id));

        await tx.update(products).set({
          isAvailable: "no",
          adminPaused: true,
        }).where(eq(products.commerceId, input.id));

        // Revoca tokens vigentes del merchant. El login también se bloquea si
        // todos sus comercios están inactivos.
        if (commerce.merchantUserId) {
          await tx
            .update(users)
            .set({ sessionVersion: sql`coalesce(${users.sessionVersion}, 0) + 1` })
            .where(eq(users.id, commerce.merchantUserId));
        }

        return commerce.merchantUserId;
      });

      emit("admin:dashboard", { type: "dashboard_update" });
      emit("commerces:global", { type: "commerce_update", commerceId: input.id });
      emit("products:global", { type: "catalog_update", commerceId: input.id });
      emit(`commerce:${input.id}`, { type: "commerce_update", commerceId: input.id });
      return {
        success: true,
        merchantUserId,
        message: "Comercio desactivado con éxito preservando historial contable.",
      };
    }),

  listCategories: adminQuery.query(async () => {
    const db = getDb();
    return db.select().from(categories).orderBy(categories.sortOrder);
  }),
};