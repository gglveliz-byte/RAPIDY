import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery, driverQuery, adminQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { drivers, driverEarnings, orders, orderItems, orderStatusHistory, orderCommerceStatus } from "@db/schema";
import { eq, and, ne, inArray, desc, sql } from "drizzle-orm";
import { emit } from "./events";
import {
  verifyDriverRefreshTokenPayload,
  clearDriverCookies,
  setDriverCookies,
} from "./driver-auth";

export const driverRouter = createRouter({
  list: adminQuery.query(async () => {
    const db = getDb();
    return db
      .select({
        id: drivers.id,
        name: drivers.name,
        phone: drivers.phone,
        vehicle: drivers.vehicle,
        licensePlate: drivers.licensePlate,
        status: drivers.status,
        rating: drivers.rating,
        currentLat: drivers.currentLat,
        currentLng: drivers.currentLng,
        commissionRate: drivers.commissionRate,
      })
      .from(drivers);
  }),

  getById: driverQuery
    .input(z.object({ id: z.number().int().positive().optional() }))
    .query(async ({ input, ctx }) => {
      if (input.id && input.id !== ctx.driver!.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No puedes ver otro repartidor" });
      }
      const db = getDb();
      const result = await db.select().from(drivers).where(eq(drivers.id, ctx.driver!.id));
      if (!result[0]) return null;
      const { passwordHash: _, fcmToken: __, ...safeDriver } = result[0];
      return safeDriver;
    }),

  getProfile: driverQuery
    .input(z.object({ id: z.number().int().positive().optional() }))
    .query(async ({ input, ctx }) => {
      if (input.id && input.id !== ctx.driver!.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No puedes ver otro repartidor" });
      }
      const db = getDb();
      const driver = await db.select().from(drivers).where(eq(drivers.id, ctx.driver!.id));
      if (driver.length === 0) return null;

      const earnings = await db
        .select()
        .from(driverEarnings)
        .where(eq(driverEarnings.driverId, ctx.driver!.id));
      const totalEarnings = earnings.reduce((acc, e) => acc + parseFloat(String(e.amount)), 0);

      const { passwordHash: _, fcmToken: __, ...safeDriver } = driver[0];
      return {
        ...safeDriver,
        totalEarnings: totalEarnings.toFixed(2),
      };
    }),

  updateStatus: driverQuery
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["online", "busy", "offline"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.driver.id !== input.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "No puedes modificar el estado de otro repartidor",
        });
      }
      const db = getDb();
      const activeOrders = await db
        .select({ id: orders.id })
        .from(orders)
        .where(
          and(
            eq(orders.driverId, input.id),
            inArray(orders.status, [
              "driver_assigned",
              "ready_for_pickup",
              "picked_up",
              "on_the_way",
            ]),
          ),
        )
        .limit(1);
      if (activeOrders.length > 0 && input.status !== "busy") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Tienes un pedido activo. Termínalo antes de cambiar tu disponibilidad.",
        });
      }
      await db.update(drivers).set({ status: input.status }).where(eq(drivers.id, input.id));
      const result = await db.select().from(drivers).where(eq(drivers.id, input.id));
      emit("admin:dashboard", { type: "dashboard_update" });
      const { passwordHash: _, fcmToken: __, ...safeDriver } = result[0];
      return safeDriver;
    }),

  updateLocation: driverQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        lat: z.coerce.number().finite().min(-90).max(90),
        lng: z.coerce.number().finite().min(-180).max(180),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.driver.id !== input.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "No puedes modificar la ubicación de otro repartidor",
        });
      }
      const db = getDb();
      await db
        .update(drivers)
        .set({ currentLat: input.lat.toFixed(8), currentLng: input.lng.toFixed(8) })
        .where(eq(drivers.id, input.id));

      emit(`driver:${input.id}`, {
        type: "location_update",
        lat: input.lat.toFixed(8),
        lng: input.lng.toFixed(8),
        ts: Date.now(),
      });

      // El cliente escucha el canal del pedido, no el canal privado del driver.
      const activeOrders = await db
        .select({ id: orders.id })
        .from(orders)
        .where(
          and(
            eq(orders.driverId, input.id),
            inArray(orders.status, ["driver_assigned", "picked_up", "on_the_way"]),
          ),
        )
        .limit(3);
      for (const active of activeOrders) {
        emit(`order:${active.id}`, {
          type: "driver_location",
          driverId: input.id,
          lat: input.lat.toFixed(8),
          lng: input.lng.toFixed(8),
          ts: Date.now(),
        });
      }

      return { success: true };
    }),

  updateProfile: driverQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().trim().min(2, "El nombre es obligatorio").max(200).optional(),
        vehicle: z.string().trim().min(1, "El vehículo es obligatorio").max(100).optional(),
        licensePlate: z.string().trim().min(1, "La placa es obligatoria").max(20).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.driver.id !== input.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "No puedes modificar el perfil de otro repartidor",
        });
      }
      const db = getDb();
      const { id, ...data } = input;
      const updateData: Partial<typeof drivers.$inferInsert> = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.vehicle !== undefined) updateData.vehicle = data.vehicle;
      if (data.licensePlate !== undefined) updateData.licensePlate = data.licensePlate;
      if (Object.keys(updateData).length > 0) {
        await db.update(drivers).set(updateData).where(eq(drivers.id, id));
      }
      const result = await db.select().from(drivers).where(eq(drivers.id, id));
      emit("admin:dashboard", { type: "dashboard_update" });
      const { passwordHash: _, fcmToken: __, ...safeDriver } = result[0];
      return safeDriver;
    }),

  getEarnings: driverQuery
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      if (ctx.driver.id !== input.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "No puedes ver las ganancias de otro repartidor",
        });
      }
      const db = getDb();
      return db
        .select()
        .from(driverEarnings)
        .where(eq(driverEarnings.driverId, input.id))
        .orderBy(desc(driverEarnings.createdAt))
        .limit(500);
    }),

  getActiveOrders: driverQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      if (ctx.driver.id !== input.id) {
        throw new Error("No tienes autorización para ver los pedidos de otro repartidor");
      }
      const db = getDb();
      return db
        .select({
          id: orders.id,
          status: orders.status,
          total: orders.total,
          deliveryFee: orders.deliveryFee,
          deliveryAddress: orders.deliveryAddress,
          customerPhone: orders.customerPhone,
          createdAt: orders.createdAt,
          pickedUpCommerceIds: orders.pickedUpCommerceIds,
        })
        .from(orders)
        .where(
          and(
            eq(orders.driverId, input.id),
            inArray(orders.status, [
              "driver_assigned",
              "ready_for_pickup",
              "picked_up",
              "on_the_way",
            ])
          )
        )
        .orderBy(desc(orders.createdAt))
        .limit(5);
    }),

  getOrderHistory: driverQuery
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).default(50),
        })
        .default({ limit: 50 }),
    )
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const rows = await db
        .select({
          id: orders.id,
          status: orders.status,
          total: orders.total,
          deliveryFee: orders.deliveryFee,
          deliveryAddress: orders.deliveryAddress,
          createdAt: orders.createdAt,
          updatedAt: orders.updatedAt,
          deliveredAt: orders.deliveredAt,
          cancellationReason: orders.cancellationReason,
          cancelledBy: orders.cancelledBy,
          earningAmount: driverEarnings.amount,
        })
        .from(orders)
        .leftJoin(
          driverEarnings,
          and(
            eq(driverEarnings.orderId, orders.id),
            eq(driverEarnings.driverId, ctx.driver!.id),
            eq(driverEarnings.type, "delivery_fee"),
          ),
        )
        .where(
          and(
            eq(orders.driverId, ctx.driver!.id),
            inArray(orders.status, ["delivered", "cancelled"]),
          ),
        )
        .orderBy(desc(sql`coalesce(${orders.deliveredAt}, ${orders.updatedAt})`))
        .limit(input.limit);

      return rows.map((row) => ({
        ...row,
        earningAmount:
          row.status === "delivered" && row.earningAmount !== null
            ? Number(row.earningAmount).toFixed(2)
            : "0.00",
      }));
    }),

  refreshToken: publicQuery.mutation(async ({ ctx }) => {
    const raw = ctx.req.headers.get("cookie") || "";
    const cookies = Object.fromEntries(
      raw.split(";").filter(Boolean).map(c => {
        const [k, ...v] = c.trim().split("=");
        return [decodeURIComponent(k), decodeURIComponent(v.join("="))];
      })
    );
    const refreshToken = cookies["quickgo_driver_refresh"];
    if (!refreshToken) return { success: false };
    const payload = await verifyDriverRefreshTokenPayload(refreshToken);
    if (!payload) return { success: false };
    const db = getDb();
    const rows = await db.select().from(drivers).where(eq(drivers.id, payload.driverId));
    const driver = rows[0];
    if (!driver) return { success: false };
    if (
      payload.sessionVersion !== null &&
      (driver.sessionVersion ?? 0) !== payload.sessionVersion
    ) {
      return { success: false };
    }
    await setDriverCookies(ctx.resHeaders, ctx.req.headers, driver.id);
    return { success: true };
  }),

  logout: publicQuery.mutation(async ({ ctx }) => {
    clearDriverCookies(ctx.resHeaders);
    return { success: true };
  }),

  acceptOrder: driverQuery
    .input(z.object({ orderId: z.number().int().positive(), driverId: z.number().int().positive().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const driverId = ctx.driver!.id;

      const result = await db.transaction(async (tx) => {
        // Bloquear primero al driver para que dos pestañas no acepten dos pedidos.
        const driverRows = await tx
          .select()
          .from(drivers)
          .where(eq(drivers.id, driverId))
          .for("update")
          .limit(1);
        const driver = driverRows[0];
        if (!driver) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Repartidor no encontrado" });
        }
        if (driver.status === "offline") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Estás desconectado. Actívate para aceptar pedidos.",
          });
        }

        const orderResult = await tx
          .select()
          .from(orders)
          .where(eq(orders.id, input.orderId))
          .for("update");
        const order = orderResult[0];
        if (!order) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Pedido no encontrado" });
        }
        if (order.driverId) {
          throw new TRPCError({ code: "CONFLICT", message: "Otro repartidor tomó este pedido." });
        }
        if (order.status !== "ready_for_pickup") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "El pedido todavía no está listo para retirar.",
          });
        }

        const commerceStatuses = await tx
          .select()
          .from(orderCommerceStatus)
          .where(eq(orderCommerceStatus.orderId, input.orderId));
        const commerceIds = await tx
          .selectDistinct({ commerceId: orderItems.commerceId })
          .from(orderItems)
          .where(eq(orderItems.orderId, input.orderId));
        const allReady =
          commerceIds.length > 0 &&
          commerceIds.every((row) =>
            commerceStatuses.some(
              (status) =>
                status.commerceId === row.commerceId && status.status === "ready_for_pickup",
            ),
          );
        if (!allReady) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Todos los comercios deben marcar el pedido listo antes de asignarlo.",
          });
        }

        const activeOrders = await tx
          .select({ id: orders.id })
          .from(orders)
          .where(
            and(
              eq(orders.driverId, driverId),
              ne(orders.status, "delivered"),
              ne(orders.status, "cancelled"),
            )
          )
          .limit(1);
        if (activeOrders.length > 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Ya tienes un pedido activo. Finalízalo antes de aceptar otro.",
          });
        }

        await tx
          .update(orders)
          .set({
            driverId,
            status: "driver_assigned",
            updatedAt: new Date(),
          })
          .where(eq(orders.id, input.orderId));

        await tx.insert(orderStatusHistory).values({
          orderId: input.orderId,
          status: "driver_assigned",
          notes: `Repartidor ${driver.name} asignado`,
        });

        await tx.update(drivers).set({ status: "busy" }).where(eq(drivers.id, driverId));

        const updated = await tx.select().from(orders).where(eq(orders.id, input.orderId));
        return updated[0];
      });

      emit(`order:${input.orderId}`, {
        type: "status_update",
        status: "driver_assigned",
        driverId,
      });
      emit(`driver:${driverId}`, { type: "order_assigned", orderId: input.orderId });
      emit("admin:dashboard", { type: "dashboard_update" });

      const commerceRows = await db
        .select({ commerceId: orderItems.commerceId })
        .from(orderItems)
        .where(eq(orderItems.orderId, input.orderId));
      for (const commerceId of new Set(commerceRows.map((row) => row.commerceId))) {
        emit(`commerce:${commerceId}`, {
          type: "order_status",
          orderId: input.orderId,
          status: "driver_assigned",
        });
      }

      const { paymentReceipt: _receipt, ...safeOrder } = result;
      return safeOrder;
    }),

  markCommercePickup: driverQuery
    .input(z.object({ orderId: z.number().int().positive(), commerceId: z.number().int().positive(), driverId: z.number().int().positive().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const driverId = ctx.driver!.id;

      const result = await db.transaction(async (tx) => {
        const orderResult = await tx
          .select()
          .from(orders)
          .where(eq(orders.id, input.orderId))
          .for("update");
        const order = orderResult[0];
        if (!order) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Pedido no encontrado" });
        }
        if (order.driverId !== driverId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No tienes este pedido asignado" });
        }
        if (["delivered", "cancelled", "on_the_way"].includes(order.status)) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "El pedido ya no está en una etapa de retiro.",
          });
        }

        // Check commerce status - must be ready_for_pickup
        const commerceStatus = await tx
          .select()
          .from(orderCommerceStatus)
          .where(and(eq(orderCommerceStatus.orderId, input.orderId), eq(orderCommerceStatus.commerceId, input.commerceId)));
        if (commerceStatus.length === 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Comercio no encontrado en este pedido",
          });
        }
        const cs = commerceStatus[0].status;
        if (cs !== "ready_for_pickup") {
          if (cs === "picked_up") {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Este comercio ya fue marcado como recogido",
            });
          }
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Este comercio aún no está listo para retirar",
          });
        }

        const currentPicked = order.pickedUpCommerceIds || [];
        if (currentPicked.includes(input.commerceId)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Este comercio ya fue marcado como recogido",
          });
        }

        // Get all unique commerce IDs in this order
        const orderItemsResult = await tx
          .select({ commerceId: orderItems.commerceId })
          .from(orderItems)
          .where(eq(orderItems.orderId, input.orderId));
        const allCommerceIds = [...new Set(orderItemsResult.map(i => i.commerceId))];

        const newPicked = [...currentPicked, input.commerceId];
        const allPicked = allCommerceIds.every(id => newPicked.includes(id));

        // Update order commerce status to picked_up
        await tx
          .update(orderCommerceStatus)
          .set({ status: "picked_up", updatedAt: new Date() })
          .where(and(eq(orderCommerceStatus.orderId, input.orderId), eq(orderCommerceStatus.commerceId, input.commerceId)));

        await tx
          .update(orders)
          .set({
            pickedUpCommerceIds: newPicked,
            status: allPicked ? "picked_up" : order.status,
            updatedAt: new Date()
          })
          .where(eq(orders.id, input.orderId));

        if (allPicked) {
          await tx.insert(orderStatusHistory).values({
            orderId: input.orderId,
            status: "picked_up",
            notes: "Todos los comercios recogidos",
          });

          emit(`order:${input.orderId}`, { type: "status_update", status: "picked_up", pickedUpCommerceIds: newPicked });
        } else {
          emit(`order:${input.orderId}`, { type: "commerce_pickup", commerceId: input.commerceId, pickedUpCommerceIds: newPicked });
        }
        emit(`driver:${driverId}`, { type: "commerce_pickup", orderId: input.orderId, commerceId: input.commerceId, pickedUpCommerceIds: newPicked });
        emit(`commerce:${input.commerceId}`, {
          type: "order_status",
          orderId: input.orderId,
          status: "picked_up",
        });
        emit("admin:dashboard", { type: "dashboard_update" });

        const updated = await tx.select().from(orders).where(eq(orders.id, input.orderId));
        return updated[0];
      });

      const { paymentReceipt: _receipt, ...safeOrder } = result;
      return safeOrder;
    }),

  unregisterDeviceToken: driverQuery.mutation(async ({ ctx }) => {
    const db = getDb();
    await db.update(drivers).set({ fcmToken: null }).where(eq(drivers.id, ctx.driver.id));
    return { success: true };
  }),

  logoutSession: driverQuery.mutation(async ({ ctx }) => {
    const db = getDb();
    const activeOrders = await db
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(
          eq(orders.driverId, ctx.driver.id),
          inArray(orders.status, [
            "driver_assigned",
            "ready_for_pickup",
            "picked_up",
            "on_the_way",
          ]),
        ),
      )
      .limit(1);
    if (activeOrders.length > 0) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Finaliza tu pedido activo antes de cerrar sesión.",
      });
    }
    await db
      .update(drivers)
      .set({
        status: "offline",
        fcmToken: null,
        sessionVersion: sql`coalesce(${drivers.sessionVersion}, 0) + 1`,
      })
      .where(eq(drivers.id, ctx.driver.id));
    clearDriverCookies(ctx.resHeaders);
    return { success: true };
  }),

  registerDeviceToken: driverQuery
    .input(z.object({ token: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!ctx.driver?.id) return { success: false };
      await db.update(drivers).set({ fcmToken: input.token }).where(eq(drivers.id, ctx.driver.id));
      return { success: true };
    }),
});
