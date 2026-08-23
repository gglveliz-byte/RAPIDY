import { z } from "zod";
import { createRouter, publicQuery, driverQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { drivers, driverEarnings, orders, orderItems, orderStatusHistory, orderCommerceStatus } from "@db/schema";
import { eq, and, ne, inArray, desc } from "drizzle-orm";
import { emit } from "./events";
import { verifyDriverRefreshToken, clearDriverCookies, setDriverCookies } from "./driver-auth";

export const driverRouter = createRouter({
  list: publicQuery.query(async () => {
    const db = getDb();
    return db.select().from(drivers);
  }),

  getById: publicQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const result = await db.select().from(drivers).where(eq(drivers.id, input.id));
      return result[0] || null;
    }),

  getProfile: publicQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const driver = await db.select().from(drivers).where(eq(drivers.id, input.id));
      if (driver.length === 0) return null;

      const earnings = await db.select().from(driverEarnings).where(eq(driverEarnings.driverId, input.id));
      const totalEarnings = earnings.reduce((acc, e) => acc + parseFloat(String(e.amount)), 0);

      return {
        ...driver[0],
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
      const db = getDb();
      await db.update(drivers).set({ status: input.status }).where(eq(drivers.id, input.id));
      const result = await db.select().from(drivers).where(eq(drivers.id, input.id));
      emit("admin:dashboard", { type: "dashboard_update" });
      return result[0];
    }),

  updateLocation: driverQuery
    .input(
      z.object({
        id: z.number(),
        lat: z.string(),
        lng: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await db
        .update(drivers)
        .set({ currentLat: input.lat, currentLng: input.lng })
        .where(eq(drivers.id, input.id));

      emit(`driver:${input.id}`, { type: "location_update", lat: input.lat, lng: input.lng, ts: Date.now() });

      return { success: true };
    }),

  updateProfile: driverQuery
    .input(
      z.object({
        id: z.number(),
        name: z.string().optional(),
        vehicle: z.string().optional(),
        licensePlate: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const { id, ...data } = input;
      const updateData: any = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.vehicle !== undefined) updateData.vehicle = data.vehicle;
      if (data.licensePlate !== undefined) updateData.licensePlate = data.licensePlate;
      if (Object.keys(updateData).length > 0) {
        await db.update(drivers).set(updateData).where(eq(drivers.id, id));
      }
      const result = await db.select().from(drivers).where(eq(drivers.id, id));
      emit("admin:dashboard", { type: "dashboard_update" });
      return result[0];
    }),

  getEarnings: driverQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      return db.select().from(driverEarnings).where(eq(driverEarnings.driverId, input.id));
    }),

  getActiveOrders: driverQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
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
            inArray(orders.status, ["ready_for_pickup", "picked_up", "on_the_way"])
          )
        )
        .orderBy(desc(orders.createdAt));
    }),

  getOrderHistory: driverQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
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
          updatedAt: orders.updatedAt,
        })
        .from(orders)
        .where(
          and(
            eq(orders.driverId, input.id),
            inArray(orders.status, ["delivered", "cancelled"])
          )
        )
        .orderBy(desc(orders.updatedAt));
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
    const driverId = await verifyDriverRefreshToken(refreshToken);
    if (!driverId) return { success: false };
    await setDriverCookies(ctx.resHeaders, ctx.req.headers, driverId);
    return { success: true };
  }),

  logout: publicQuery.mutation(async ({ ctx }) => {
    clearDriverCookies(ctx.resHeaders);
    return { success: true };
  }),

  acceptOrder: driverQuery
    .input(z.object({ driverId: z.number(), orderId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();

      const result = await db.transaction(async (tx) => {
        const orderResult = await tx
          .select()
          .from(orders)
          .where(eq(orders.id, input.orderId))
          .for("update");
        const order = orderResult[0];
        if (!order) throw new Error("Pedido no encontrado");
        if (order.driverId) throw new Error("Pedido ya asignado");
        if (!["preparing", "ready_for_pickup"].includes(order.status)) {
          throw new Error("Pedido no está disponible para aceptar");
        }

        // Driver must not have any other active order
        const activeOrders = await tx
          .select({ id: orders.id })
          .from(orders)
          .where(
            and(
              eq(orders.driverId, input.driverId),
              ne(orders.status, "delivered"),
              ne(orders.status, "cancelled"),
            )
          )
          .limit(1);
        if (activeOrders.length > 0) {
          throw new Error("Ya tienes un pedido activo. Finalízalo antes de aceptar otro.");
        }

        await tx
          .update(orders)
          .set({
            driverId: input.driverId,
            status: "ready_for_pickup",
            updatedAt: new Date()
          })
          .where(eq(orders.id, input.orderId));

        await tx.insert(orderStatusHistory).values({
          orderId: input.orderId,
          status: "ready_for_pickup",
          notes: "Repartidor asignado",
        });

        await tx.update(drivers).set({ status: "busy" }).where(eq(drivers.id, input.driverId));

        const updated = await tx.select().from(orders).where(eq(orders.id, input.orderId));

        // Emit SSE events to notify about order assignment
        emit(`order:${input.orderId}`, { type: "status_update", status: "ready_for_pickup", driverId: input.driverId });
        emit(`driver:${input.driverId}`, { type: "order_assigned", orderId: input.orderId });
        emit("admin:dashboard", { type: "dashboard_update" });

        return updated[0];
      });

      return result;
    }),

  markCommercePickup: driverQuery
    .input(z.object({ driverId: z.number(), orderId: z.number(), commerceId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();

      const result = await db.transaction(async (tx) => {
        const orderResult = await tx
          .select()
          .from(orders)
          .where(eq(orders.id, input.orderId))
          .for("update");
        const order = orderResult[0];
        if (!order) throw new Error("Pedido no encontrado");
        if (order.driverId !== input.driverId) throw new Error("No tienes este pedido asignado");

        // Check commerce status - must be ready_for_pickup
        const commerceStatus = await tx
          .select()
          .from(orderCommerceStatus)
          .where(and(eq(orderCommerceStatus.orderId, input.orderId), eq(orderCommerceStatus.commerceId, input.commerceId)));
        if (commerceStatus.length === 0) throw new Error("Comercio no encontrado en este pedido");
        const cs = commerceStatus[0].status;
        if (cs !== "ready_for_pickup") {
          if (cs === "picked_up") throw new Error("Este comercio ya fue marcado como recogido");
          throw new Error("Este comercio aún no está listo para retirar");
        }

        const currentPicked = order.pickedUpCommerceIds || [];
        if (currentPicked.includes(input.commerceId)) {
          throw new Error("Este comercio ya fue marcado como recogido");
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
        emit(`driver:${input.driverId}`, { type: "commerce_pickup", orderId: input.orderId, commerceId: input.commerceId, pickedUpCommerceIds: newPicked });
        emit("admin:dashboard", { type: "dashboard_update" });

        const updated = await tx.select().from(orders).where(eq(orders.id, input.orderId));
        return updated[0];
      });

      return result;
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
