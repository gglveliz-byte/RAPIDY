/**
 * @archivo app/server/admin/drivers-router.ts
 * @modulo 03-admin-drivers (Gestión de repartidores, balances y liquidaciones)
 * @proposito
 *   Controlador tRPC para la administración de choferes con protección estricta de credenciales
 *   (sin fuga de passwordHash ni fcmToken), cálculo exacto de ganancias y borrado seguro.
 *
 * @resumen_contenido
 *   - `createDriver`: Alta de repartidor con normalización de teléfono y retorno sanitizado.
 *   - `updateDriver`: Edición de datos y contraseña con chequeo de duplicados.
 *   - `deleteDriver`: Eliminación segura con protección de pedidos activos y conservación contable.
 *   - `driverPerformance`: Rendimiento con sumatoria real de ganancias (sin filtrar secretos).
 *   - `driverEarningsBreakdown`: Balance cruzado de fletes pagados a choferes vs comisión del admin.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { drivers, driverEarnings, orders } from "@db/schema";
import { eq, sql, inArray, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { emit } from "../events";

export const adminDriversProcedures = {
  createDriver: adminQuery
    .input(z.object({
      name: z.string().min(1, "El nombre es requerido"),
      phone: z.string().min(5, "El teléfono debe tener al menos 5 dígitos"),
      password: z.string().min(4, "La contraseña debe tener al menos 4 caracteres"),
      vehicle: z.string().optional(),
      licensePlate: z.string().optional(),
      commissionRate: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const normalizedPhone = input.phone.replace(/\D/g, "");
      
      const existing = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.phone, normalizedPhone));
      if (existing.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Ya existe un repartidor registrado con ese número de teléfono",
        });
      }

      const hash = await bcrypt.hash(input.password, 10);
      const result = await db.insert(drivers).values({
        name: input.name,
        phone: normalizedPhone,
        passwordHash: hash,
        vehicle: input.vehicle || null,
        licensePlate: input.licensePlate || null,
        commissionRate: input.commissionRate || "75.00",
      }).returning({
        id: drivers.id,
        name: drivers.name,
        phone: drivers.phone,
        vehicle: drivers.vehicle,
        licensePlate: drivers.licensePlate,
        status: drivers.status,
        rating: drivers.rating,
        commissionRate: drivers.commissionRate,
        createdAt: drivers.createdAt,
      });

      emit("admin:dashboard", { type: "dashboard_update" });
      return result[0];
    }),

  updateDriver: adminQuery
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      phone: z.string().optional(),
      password: z.string().optional(),
      vehicle: z.string().optional(),
      licensePlate: z.string().optional(),
      commissionRate: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, password, phone, ...data } = input;
      const updateData: Record<string, any> = { ...data };

      if (phone !== undefined) {
        const normalizedPhone = phone.replace(/\D/g, "");
        const existing = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.phone, normalizedPhone));
        if (existing.length > 0 && existing[0].id !== id) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Ya existe otro repartidor con ese número de teléfono",
          });
        }
        updateData.phone = normalizedPhone;
      }

      if (password && password.trim().length >= 4) {
        updateData.passwordHash = await bcrypt.hash(password, 10);
      }

      if (Object.keys(updateData).length > 0) {
        await db.update(drivers).set(updateData).where(eq(drivers.id, id));
      }

      const result = await db.select({
        id: drivers.id,
        name: drivers.name,
        phone: drivers.phone,
        vehicle: drivers.vehicle,
        licensePlate: drivers.licensePlate,
        status: drivers.status,
        rating: drivers.rating,
        commissionRate: drivers.commissionRate,
        createdAt: drivers.createdAt,
      }).from(drivers).where(eq(drivers.id, id));

      emit("admin:dashboard", { type: "dashboard_update" });
      return result[0];
    }),

  deleteDriver: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      
      await db.transaction(async (tx) => {
        // Bloqueo preventivo si el chofer tiene pedidos activos en tránsito
        const activeOrders = await tx
          .select({ id: orders.id })
          .from(orders)
          .where(
            and(
              eq(orders.driverId, input.id),
              inArray(orders.status, ["driver_assigned", "picked_up", "on_the_way"])
            )
          )
          .limit(1);

        if (activeOrders.length > 0) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "No se puede eliminar el repartidor: tiene pedidos en curso asignados. Reasigna o finaliza sus pedidos primero.",
          });
        }

        // Desvincula pedidos ya completados o cancelados para integridad referencial
        await tx.update(orders).set({ driverId: null }).where(eq(orders.driverId, input.id));

        // Borrado del conductor (sus ganancias históricas en driverEarnings se conservan para auditoría si no hay cascada forzada)
        await tx.delete(drivers).where(eq(drivers.id, input.id));
      });

      emit("admin:dashboard", { type: "dashboard_update" });
      return { success: true, message: "Repartidor eliminado correctamente." };
    }),

  driverPerformance: adminQuery.query(async () => {
    const db = getDb();

    // Consulta segura excluyendo passwordHash y fcmToken
    const allDrivers = await db.select({
      id: drivers.id,
      name: drivers.name,
      phone: drivers.phone,
      vehicle: drivers.vehicle,
      licensePlate: drivers.licensePlate,
      status: drivers.status,
      rating: drivers.rating,
      commissionRate: drivers.commissionRate,
      createdAt: drivers.createdAt,
    }).from(drivers);

    // Sumatoria real de ganancias históricas desde driverEarnings
    const earningsSum = await db
      .select({
        driverId: driverEarnings.driverId,
        total: sql<string>`coalesce(sum(${driverEarnings.amount}), '0')`,
      })
      .from(driverEarnings)
      .groupBy(driverEarnings.driverId);

    const earningsMap = new Map(earningsSum.map(e => [e.driverId, parseFloat(e.total || "0")]));

    return allDrivers.map(d => ({
      ...d,
      earnings: earningsMap.get(d.id) || 0,
    }));
  }),

  driverEarningsBreakdown: adminQuery.query(async () => {
    const db = getDb();
    
    const earnings = await db
      .select({
        driverId: driverEarnings.driverId,
        type: driverEarnings.type,
        amount: sql<string>`coalesce(sum(${driverEarnings.amount}), '0')`,
      })
      .from(driverEarnings)
      .groupBy(driverEarnings.driverId, driverEarnings.type);

    const driverOrders = await db
      .select({
        driverId: orders.driverId,
        totalFees: sql<string>`coalesce(sum(${orders.deliveryFee}), '0')`,
      })
      .from(orders)
      .where(eq(orders.status, "delivered"))
      .groupBy(orders.driverId);

    const d = await db.select({
      id: drivers.id,
      name: drivers.name,
      commissionRate: drivers.commissionRate,
    }).from(drivers);

    const driverMap = new Map(d.map(r => [r.id, r]));
    const feeMap = new Map(driverOrders.map(r => [r.driverId, parseFloat(r.totalFees || "0")]));
    
    const grouped = new Map<number, { driverId: number; name: string; commissionRate: string; deliveryFee: string; adminCommission: string; total: string }>();

    for (const entry of d) {
      grouped.set(entry.id, {
        driverId: entry.id,
        name: entry.name,
        commissionRate: entry.commissionRate || "75.00",
        deliveryFee: "0.00",
        adminCommission: "0.00",
        total: "0.00",
      });
    }

    for (const e of earnings) {
      if (grouped.has(e.driverId)) {
        const item = grouped.get(e.driverId)!;
        const val = parseFloat(e.amount || "0");
        if (e.type === "delivery_fee") item.deliveryFee = val.toFixed(2);
        item.total = (parseFloat(item.total) + val).toFixed(2);
      }
    }

    for (const entry of grouped.values()) {
      const totalFee = feeMap.get(entry.driverId) || 0;
      const driverFee = parseFloat(entry.deliveryFee);
      entry.adminCommission = (totalFee - driverFee).toFixed(2);
    }

    return Array.from(grouped.values());
  }),
};
