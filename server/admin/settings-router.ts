/**
 * ==============================================================================
 * ENRUTADOR DE CONFIGURACIÓN Y REPORTES - PANEL ADMIN (ADMIN SETTINGS ROUTER)
 * ==============================================================================
 * Gestiona los parámetros operativos de la plataforma y el generador de reportes:
 * - settings: Lectura de variables del sistema
 * - updateSetting / updateSettingsBulk: mutaciones validadas y auditadas
 * - getReports: exportación contable basada en snapshots y fecha de entrega
 * ==============================================================================
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { getDb } from "../queries/connection";
import {
  appSettings,
  orders,
  orderItems,
  commerces,
  drivers,
  driverEarnings,
  orderCommerceStatus,
} from "@db/schema";
import { adminQuery } from "../middleware";
import { emit } from "../events";
import { guayaquilDateKey } from "../lib/dates";

const SETTING_KEYS = [
  "app_name",
  "support_phone",
  "delivery_fee",
  "min_order_amount",
  "bank_transfer_info",
] as const;

type SettingKey = (typeof SETTING_KEYS)[number];

const moneySetting = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Usa un número positivo con hasta 2 decimales")
  .refine((value) => Number(value) <= 100_000, "El monto es demasiado alto");

const settingValueSchemas: Record<SettingKey, z.ZodTypeAny> = {
  app_name: z.string().trim().min(1, "El nombre es obligatorio").max(80),
  support_phone: z.string().trim().max(30),
  delivery_fee: moneySetting,
  min_order_amount: moneySetting,
  bank_transfer_info: z.string().max(2_000),
};

function validateSetting(key: string, value: string): { key: SettingKey; value: string } {
  if (!(SETTING_KEYS as readonly string[]).includes(key)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Configuración desconocida: ${key}`,
    });
  }
  const parsed = settingValueSchemas[key as SettingKey].safeParse(value);
  if (!parsed.success) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${key}: ${parsed.error.issues[0]?.message ?? "valor inválido"}`,
    });
  }
  return { key: key as SettingKey, value: parsed.data as string };
}

const reportDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato YYYY-MM-DD")
  .optional();

function guayaquilDayStart(value: string): Date {
  return new Date(`${value}T00:00:00-05:00`);
}

function guayaquilNextDayStart(value: string): Date {
  const date = guayaquilDayStart(value);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

async function upsertSetting(
  tx: any,
  key: SettingKey,
  value: string,
  adminId: number,
) {
  const existing = await tx.select().from(appSettings).where(eq(appSettings.key, key));
  if (existing.length > 0) {
    await tx
      .update(appSettings)
      .set({ value, updatedBy: adminId, updatedAt: new Date() })
      .where(eq(appSettings.key, key));
  } else {
    await tx
      .insert(appSettings)
      .values({ key, value, updatedBy: adminId, updatedAt: new Date() });
  }
}

export const adminSettingsProcedures = {
  settings: adminQuery.query(async () => {
    const db = getDb();
    return db.select().from(appSettings);
  }),

  updateSetting: adminQuery
    .input(z.object({ key: z.string().max(100), value: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const setting = validateSetting(input.key, input.value);
      const db = getDb();
      await db.transaction(async (tx) => {
        await upsertSetting(tx, setting.key, setting.value, ctx.admin!.id);
      });
      emit("admin:dashboard", { type: "settings_update" });
      return { success: true };
    }),

  updateSettingsBulk: adminQuery
    .input(
      z.object({
        settings: z
          .array(z.object({ key: z.string().max(100), value: z.string() }))
          .min(1)
          .max(SETTING_KEYS.length),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const validated = input.settings.map((item) => validateSetting(item.key, item.value));
      const keys = validated.map((item) => item.key);
      if (new Set(keys).size !== keys.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No se puede enviar la misma configuración dos veces.",
        });
      }

      const db = getDb();
      await db.transaction(async (tx) => {
        for (const item of validated) {
          await upsertSetting(tx, item.key, item.value, ctx.admin!.id);
        }
      });
      emit("admin:dashboard", { type: "settings_update" });
      return { success: true };
    }),

  // Generador de reportes con fechas de calendario de Guayaquil y snapshots.
  getReports: adminQuery
    .input(
      z
        .object({
          type: z.enum(["sales", "orders", "commerces", "drivers", "earnings", "commissions"]),
          startDate: reportDate,
          endDate: reportDate,
        })
        .refine(
          (value) => {
            if (!value.startDate || !value.endDate) return true;
            return value.startDate <= value.endDate;
          },
          { message: "La fecha inicial no puede ser posterior a la final." },
        ),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const from = input.startDate ? guayaquilDayStart(input.startDate) : undefined;
      const to = input.endDate ? guayaquilNextDayStart(input.endDate) : undefined;
      if (from && to) {
        const days = (to.getTime() - from.getTime()) / 86_400_000;
        if (days > 731) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "El rango máximo de reportes es de 2 años.",
          });
        }
      }

      const effectiveInRange = () =>
        and(
          from ? gte(sql`coalesce(${orders.deliveredAt}, ${orders.createdAt})`, from) : undefined,
          to ? sql`coalesce(${orders.deliveredAt}, ${orders.createdAt}) < ${to}` : undefined,
        );

      if (input.type === "sales") {
        const [orderRows, commissionRows] = await Promise.all([
          db
            .select({
              id: orders.id,
              total: orders.total,
              deliveredAt: orders.deliveredAt,
              createdAt: orders.createdAt,
            })
            .from(orders)
            .where(and(eq(orders.status, "delivered"), effectiveInRange())),
          db
            .select({
              orderId: orderCommerceStatus.orderId,
              commissionAmount: orderCommerceStatus.commissionAmount,
              sales: sql<string>`coalesce(sum(${orderItems.total}), 0)`,
              rate: commerces.commissionRate,
            })
            .from(orderCommerceStatus)
            .innerJoin(orders, eq(orderCommerceStatus.orderId, orders.id))
            .innerJoin(commerces, eq(orderCommerceStatus.commerceId, commerces.id))
            .leftJoin(
              orderItems,
              and(
                eq(orderItems.orderId, orderCommerceStatus.orderId),
                eq(orderItems.commerceId, orderCommerceStatus.commerceId),
              ),
            )
            .where(and(eq(orders.status, "delivered"), effectiveInRange()))
            .groupBy(
              orderCommerceStatus.orderId,
              orderCommerceStatus.commissionAmount,
              commerces.commissionRate,
            ),
        ]);

        const commissionByOrder = new Map<number, number>();
        for (const row of commissionRows) {
          const commission =
            row.commissionAmount !== null && row.commissionAmount !== undefined
              ? Number(row.commissionAmount)
              : Number(row.sales || 0) * (Number(row.rate || "10") / 100);
          commissionByOrder.set(
            row.orderId,
            (commissionByOrder.get(row.orderId) ?? 0) + commission,
          );
        }

        const grouped = new Map<string, { orders: number; revenue: number; commission: number }>();
        for (const order of orderRows) {
          const key = guayaquilDateKey(order.deliveredAt ?? order.createdAt);
          const row = grouped.get(key) ?? { orders: 0, revenue: 0, commission: 0 };
          row.orders += 1;
          row.revenue += Number(order.total || 0);
          row.commission += commissionByOrder.get(order.id) ?? 0;
          grouped.set(key, row);
        }

        return {
          type: "sales",
          generatedAt: new Date().toISOString(),
          columns: ["Fecha", "Pedidos", "Ingresos", "Comisiones"],
          rows: [...grouped.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, row]) => ({
              Fecha: date,
              Pedidos: row.orders,
              Ingresos: Number(row.revenue.toFixed(2)),
              Comisiones: Number(row.commission.toFixed(2)),
            })),
        };
      }

      if (input.type === "orders") {
        const rows = await db
          .select({
            id: orders.id,
            status: orders.status,
            total: orders.total,
            paymentMethod: orders.paymentMethod,
            deliveryAddress: orders.deliveryAddress,
            customerPhone: orders.customerPhone,
            createdAt: orders.createdAt,
            deliveredAt: orders.deliveredAt,
          })
          .from(orders)
          .where(effectiveInRange())
          .orderBy(desc(sql`coalesce(${orders.deliveredAt}, ${orders.createdAt})`))
          .limit(5_000);

        return {
          type: "orders",
          generatedAt: new Date().toISOString(),
          columns: ["ID", "Estado", "Total", "Metodo Pago", "Direccion", "Telefono", "Fecha"],
          rows: rows.map((row) => ({
            ID: row.id,
            Estado: row.status,
            Total: Number(row.total || 0),
            "Metodo Pago": row.paymentMethod,
            Direccion: row.deliveryAddress,
            Telefono: row.customerPhone || "-",
            Fecha: guayaquilDateKey(row.deliveredAt ?? row.createdAt),
          })),
        };
      }

      if (input.type === "commerces") {
        const rows = await db
          .select({
            commerceId: orderItems.commerceId,
            orders: sql<number>`count(distinct ${orderItems.orderId})`,
            revenue: sql<string>`sum(${orderItems.total})`,
          })
          .from(orderItems)
          .innerJoin(orders, eq(orderItems.orderId, orders.id))
          .where(and(eq(orders.status, "delivered"), effectiveInRange()))
          .groupBy(orderItems.commerceId);

        const comms = await db
          .select({ id: commerces.id, name: commerces.name, status: commerces.status })
          .from(commerces);
        const map = new Map(comms.map((commerce) => [commerce.id, commerce]));

        return {
          type: "commerces",
          generatedAt: new Date().toISOString(),
          columns: ["Comercio", "Pedidos", "Ingresos", "Estado"],
          rows: rows.map((row) => {
            const commerce = map.get(row.commerceId);
            return {
              Comercio: commerce?.name || "-",
              Pedidos: row.orders,
              Ingresos: Number(Number(row.revenue || 0).toFixed(2)),
              Estado: commerce?.status || "-",
            };
          }),
        };
      }

      if (input.type === "drivers") {
        const stats = await db
          .select({
            driverId: orders.driverId,
            deliveries: sql<number>`count(*)`,
          })
          .from(orders)
          .where(and(eq(orders.status, "delivered"), effectiveInRange()))
          .groupBy(orders.driverId);

        const earningsConditions = [
          input.startDate ? gte(driverEarnings.date, input.startDate) : undefined,
          input.endDate ? lte(driverEarnings.date, input.endDate) : undefined,
        ].filter(Boolean) as any[];
        const earnings = await db
          .select({
            driverId: driverEarnings.driverId,
            total: sql<string>`coalesce(sum(${driverEarnings.amount}), 0)`,
          })
          .from(driverEarnings)
          .where(earningsConditions.length > 0 ? and(...earningsConditions) : undefined)
          .groupBy(driverEarnings.driverId);

        const d = await db
          .select({
            id: drivers.id,
            name: drivers.name,
            phone: drivers.phone,
            rating: drivers.rating,
          })
          .from(drivers)
          .orderBy(drivers.name);

        const deliveryMap = new Map(stats.map((row) => [row.driverId, row.deliveries]));
        const earningMap = new Map(
          earnings.map((row) => [row.driverId, Number(row.total || 0)]),
        );

        return {
          type: "drivers",
          generatedAt: new Date().toISOString(),
          columns: ["Repartidor", "Telefono", "Entregas", "Ganancias", "Calif."],
          rows: d.map((row) => ({
            Repartidor: row.name,
            Telefono: row.phone,
            Entregas: deliveryMap.get(row.id) || 0,
            Ganancias: Number((earningMap.get(row.id) || 0).toFixed(2)),
            "Calif.": row.rating ? Number(row.rating).toFixed(1) : "Sin calificar",
          })),
        };
      }

      if (input.type === "earnings") {
        const conditions = [
          input.startDate ? gte(driverEarnings.date, input.startDate) : undefined,
          input.endDate ? lte(driverEarnings.date, input.endDate) : undefined,
        ].filter(Boolean) as any[];
        const earnings = await db
          .select({
            driverId: driverEarnings.driverId,
            orderId: driverEarnings.orderId,
            amount: driverEarnings.amount,
            type: driverEarnings.type,
            date: driverEarnings.date,
          })
          .from(driverEarnings)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(driverEarnings.date))
          .limit(10_000);

        const d = await db.select({ id: drivers.id, name: drivers.name }).from(drivers);
        const dMap = new Map(d.map((row) => [row.id, row.name]));

        return {
          type: "earnings",
          generatedAt: new Date().toISOString(),
          columns: ["Repartidor", "Pedido ID", "Monto", "Tipo", "Fecha"],
          rows: earnings.map((row) => ({
            Repartidor: dMap.get(row.driverId) || "-",
            "Pedido ID": row.orderId,
            Monto: Number(row.amount || 0),
            Tipo:
              row.type === "delivery_fee"
                ? "Envio"
                : row.type === "tip"
                  ? "Propina"
                  : "Bono",
            Fecha: row.date,
          })),
        };
      }

      // Comisiones: una fila por comercio, con snapshot histórico.
      const rows = await db
        .select({
          orderId: orderCommerceStatus.orderId,
          commerceId: orderCommerceStatus.commerceId,
          commissionAmount: orderCommerceStatus.commissionAmount,
          sales: sql<string>`coalesce(sum(${orderItems.total}), 0)`,
          orderTotal: orders.total,
          createdAt: orders.createdAt,
          deliveredAt: orders.deliveredAt,
          rate: commerces.commissionRate,
          commerceName: commerces.name,
        })
        .from(orderCommerceStatus)
        .innerJoin(orders, eq(orderCommerceStatus.orderId, orders.id))
        .innerJoin(commerces, eq(orderCommerceStatus.commerceId, commerces.id))
        .leftJoin(
          orderItems,
          and(
            eq(orderItems.orderId, orderCommerceStatus.orderId),
            eq(orderItems.commerceId, orderCommerceStatus.commerceId),
          ),
        )
        .where(and(eq(orders.status, "delivered"), effectiveInRange()))
        .groupBy(
          orderCommerceStatus.orderId,
          orderCommerceStatus.commerceId,
          orderCommerceStatus.commissionAmount,
          orders.total,
          orders.createdAt,
          orders.deliveredAt,
          commerces.commissionRate,
          commerces.name,
        )
        .orderBy(desc(sql`coalesce(${orders.deliveredAt}, ${orders.createdAt})`))
        .limit(10_000);

      return {
        type: "commissions",
        generatedAt: new Date().toISOString(),
        columns: ["Comercio", "Pedido ID", "Comision", "Total Pedido", "Fecha"],
        rows: rows.map((row) => {
          const commission =
            row.commissionAmount !== null && row.commissionAmount !== undefined
              ? Number(row.commissionAmount)
              : Number(row.sales || 0) * (Number(row.rate || "10") / 100);
          return {
            Comercio: row.commerceName,
            "Pedido ID": row.orderId,
            Comision: Number(commission.toFixed(2)),
            "Total Pedido": Number(row.orderTotal || 0),
            Fecha: guayaquilDateKey(row.deliveredAt ?? row.createdAt),
          };
        }),
      };
    }),
};
