import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { commerces, orderItems, orders } from "@db/schema";
import type { TrpcContext } from "../context";
import type { ViewerRole } from "@contracts/orderStatus";

export interface Viewer {
  role: ViewerRole;
  id: number;
  name: string;
}

export interface OrderAccess {
  order: typeof orders.$inferSelect;
  items: Array<typeof orderItems.$inferSelect>;
  viewer: Viewer;
}

export function getViewerName(ctx: TrpcContext, role: ViewerRole): string {
  switch (role) {
    case "admin":
      return ctx.admin?.name || "Administrador";
    case "customer":
      return [ctx.customer?.firstName, ctx.customer?.lastName].filter(Boolean).join(" ") || "Cliente";
    case "driver":
      return ctx.driver?.name || "Repartidor";
    case "merchant":
      return ctx.merchant?.name || "Comercio";
  }
}

export async function merchantOwnsCommerce(
  ctx: TrpcContext,
  commerceId: number,
): Promise<boolean> {
  if (!ctx.merchant) return false;
  const db = getDb();
  const rows = await db
    .select({ id: commerces.id })
    .from(commerces)
    .where(and(eq(commerces.id, commerceId), eq(commerces.merchantUserId, ctx.merchant.id)))
    .limit(1);
  return rows.length > 0;
}

export async function assertCommerceOwnership(ctx: TrpcContext, commerceId: number): Promise<void> {
  if (!ctx.merchant) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Autenticación de comercio requerida" });
  }
  if (!(await merchantOwnsCommerce(ctx, commerceId))) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No tienes permiso sobre este comercio",
    });
  }
}

/**
 * Devuelve el rol efectivo del solicitante para un pedido concreto.
 * Prioriza el rol más específico que realmente participa en el pedido.
 */
export async function resolveOrderViewer(
  ctx: TrpcContext,
  order: typeof orders.$inferSelect,
  items: Array<typeof orderItems.$inferSelect>,
): Promise<Viewer | null> {
  if (ctx.admin) {
    return { role: "admin", id: ctx.admin.id, name: getViewerName(ctx, "admin") };
  }

  if (ctx.driver && order.driverId === ctx.driver.id) {
    return { role: "driver", id: ctx.driver.id, name: ctx.driver.name };
  }

  if (ctx.merchant) {
    const commerceIds = [...new Set(items.map((item) => item.commerceId))];
    if (commerceIds.length > 0) {
      const db = getDb();
      const owned = await db
        .select({ id: commerces.id })
        .from(commerces)
        .where(
          and(
            inArray(commerces.id, commerceIds),
            eq(commerces.merchantUserId, ctx.merchant.id),
          ),
        )
        .limit(1);
      if (owned.length > 0) {
        return { role: "merchant", id: ctx.merchant.id, name: getViewerName(ctx, "merchant") };
      }
    }
  }

  if (ctx.customer && order.customerId === ctx.customer.id) {
    return {
      role: "customer",
      id: ctx.customer.id,
      name: getViewerName(ctx, "customer"),
    };
  }

  return null;
}

export async function assertOrderAccess(
  ctx: TrpcContext,
  orderId: number,
): Promise<OrderAccess> {
  const db = getDb();
  const orderRows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  const order = orderRows[0];
  if (!order) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Pedido no encontrado" });
  }

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const viewer = await resolveOrderViewer(ctx, order, items);
  if (!viewer) {
    // No revelamos si el pedido existe o no.
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No tienes acceso a este pedido",
    });
  }

  return { order, items, viewer };
}

/** Proyección pública del cliente: nunca exponer fcmToken ni hashes. */
export function safeCustomer(customer: {
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  createdAt?: Date;
}) {
  return {
    id: customer.id,
    firstName: customer.firstName,
    lastName: customer.lastName,
    phone: customer.phone,
    address: customer.address,
    createdAt: customer.createdAt,
  };
}

/** Proyección pública del repartidor para el cliente. */
export function safeDriver(driver: {
  id: number;
  name: string;
  phone?: string | null;
  vehicle?: string | null;
  licensePlate?: string | null;
  rating?: string | null;
  currentLat?: string | null;
  currentLng?: string | null;
}) {
  return {
    id: driver.id,
    name: driver.name,
    phone: driver.phone ?? null,
    vehicle: driver.vehicle ?? null,
    licensePlate: driver.licensePlate ?? null,
    rating: driver.rating ?? null,
    currentLat: driver.currentLat ?? null,
    currentLng: driver.currentLng ?? null,
  };
}