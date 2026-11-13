import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import {
  createRouter,
  customerQuery,
  merchantQuery,
  driverQuery,
  adminQuery,
  participantQuery,
} from "./middleware";
import { getDb } from "./queries/connection";
import {
  appSettings,
  commerces,
  customers,
  driverEarnings,
  drivers,
  orderCommerceStatus,
  orderItems,
  orderStatusHistory,
  orders,
  products,
} from "@db/schema";
import { emit } from "./events";
import {
  assertCommerceOwnership,
  assertOrderAccess,
  safeDriver,
} from "./lib/order-access";
import { markCommerceReadyForOrder } from "./lib/order-ready";
import {
  syncAllCommerceStatuses,
  syncCommerceStatuses,
} from "./lib/order-status-sync";
import {
  canTransition,
  getOrderStatusMeta,
  isTerminalStatus,
  type OrderStatus,
} from "@contracts/orderStatus";
import { normalizePhone } from "./lib/otp";

const quoteItemSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().positive().max(999),
});

const checkoutSchema = z.object({
  items: z.array(quoteItemSchema).min(1).max(50),
  deliveryAddress: z.string().trim().min(3).max(500),
  customerPhone: z.string().trim().min(6).max(30),
  paymentMethod: z.enum(["cash", "transfer"]),
  paymentReceipt: z.string().max(7_500_000).optional(),
  notes: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().trim().min(8).max(100),
});

function assertReceipt(receipt: string | undefined) {
  if (!receipt) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Adjunta el comprobante de la transferencia.",
    });
  }
  if (receipt.length > 7_500_000) {
    throw new TRPCError({
      code: "PAYLOAD_TOO_LARGE",
      message: "El comprobante supera el tamaño máximo permitido (5 MB).",
    });
  }
  if (!/^data:(image\/(jpeg|jpg|png|webp)|application\/pdf);base64,/i.test(receipt)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "El comprobante debe ser una imagen JPG/PNG/WEBP o un PDF.",
    });
  }
}

async function readPricing() {
  const db = getDb();
  const rows = await db
    .select()
    .from(appSettings)
    .where(inArray(appSettings.key, ["delivery_fee", "min_order_amount"]));
  const map = new Map(rows.map((row) => [row.key, row.value]));
  return {
    deliveryFee: Number(map.get("delivery_fee") ?? "2.50"),
    minOrder: Number(map.get("min_order_amount") ?? "5.00"),
  };
}

interface QuoteLine {
  productId: number;
  name: string;
  image: string | null;
  unitType: string;
  unitPrice: number;
  quantity: number;
  total: number;
  commerceId: number;
  commerceName: string;
}

async function buildQuote(items: Array<z.infer<typeof quoteItemSchema>>) {
  const db = getDb();
  const ids = [...new Set(items.map((item) => item.productId))];
  const productRows = await db.select().from(products).where(inArray(products.id, ids));
  const productMap = new Map(productRows.map((product) => [product.id, product]));

  const commerceIds = [...new Set(productRows.map((product) => product.commerceId))];
  const commerceRows = commerceIds.length
    ? await db.select().from(commerces).where(inArray(commerces.id, commerceIds))
    : [];
  const commerceMap = new Map(commerceRows.map((commerce) => [commerce.id, commerce]));

  const pricing = await readPricing();
  const issues: string[] = [];
  const lines: QuoteLine[] = [];
  const groupTotals = new Map<number, number>();

  for (const item of items) {
    const product = productMap.get(item.productId);
    if (!product) {
      issues.push(`El producto #${item.productId} ya no existe.`);
      continue;
    }
    const commerce = commerceMap.get(product.commerceId);
    if (!commerce || commerce.status !== "active") {
      issues.push(`"${product.name}" no está disponible porque el comercio no está activo.`);
      continue;
    }
    if (commerce.isOpen !== "open") {
      issues.push(`"${product.name}" no está disponible porque el comercio está cerrado.`);
      continue;
    }
    if (product.isAvailable !== "yes") {
      issues.push(`"${product.name}" está agotado.`);
      continue;
    }
    if (product.unitType === "unit" && !Number.isInteger(item.quantity)) {
      issues.push(`"${product.name}" se vende por unidad; la cantidad debe ser entera.`);
      continue;
    }
    if (product.unitType === "kg" && item.quantity > 100) {
      issues.push(`"${product.name}" supera la cantidad máxima por pedido.`);
      continue;
    }

    const unitPrice = Number(product.price);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      issues.push(`"${product.name}" tiene un precio inválido.`);
      continue;
    }
    if (unitPrice > 99_999_999.99) {
      issues.push(`"${product.name}" supera el precio máximo permitido.`);
      continue;
    }
    const total = Number((unitPrice * item.quantity).toFixed(2));
    if (!Number.isFinite(total)) {
      issues.push(`"${product.name}" genera un total inválido.`);
      continue;
    }
    lines.push({
      productId: product.id,
      name: product.name,
      image: product.image,
      unitType: product.unitType,
      unitPrice,
      quantity: item.quantity,
      total,
      commerceId: commerce.id,
      commerceName: commerce.name,
    });
    groupTotals.set(commerce.id, (groupTotals.get(commerce.id) ?? 0) + total);
  }

  for (const [commerceId, total] of groupTotals) {
    const commerce = commerceMap.get(commerceId);
    const commerceMin = Number(commerce?.minOrder ?? "0");
    if (commerceMin > 0 && total < commerceMin) {
      issues.push(
        `El mínimo de ${commerce?.name ?? "este comercio"} es $${commerceMin.toFixed(2)}.`,
      );
    }
  }

  const subtotal = Number(
    [...groupTotals.values()].reduce((sum, total) => sum + total, 0).toFixed(2),
  );
  if (subtotal < pricing.minOrder) {
    issues.push(`El pedido mínimo general es $${pricing.minOrder.toFixed(2)}.`);
  }

  let commission = 0;
  for (const [commerceId, total] of groupTotals) {
    const commerce = commerceMap.get(commerceId);
    const rate = Number(commerce?.commissionRate ?? "10");
    commission += total * (rate / 100);
  }
  commission = Number(commission.toFixed(2));

  const total = Number((subtotal + pricing.deliveryFee).toFixed(2));

  return {
    lines,
    subtotal,
    deliveryFee: pricing.deliveryFee,
    commission,
    total,
    minOrder: pricing.minOrder,
    meetsMinOrder: issues.length === 0,
    issues,
  };
}

type SanitizedOrder = Omit<typeof orders.$inferSelect, "paymentReceipt">;

function sanitizeOrder(order: typeof orders.$inferSelect): SanitizedOrder {
  const safe = { ...order } as Partial<typeof orders.$inferSelect>;
  delete safe.paymentReceipt;
  return safe as SanitizedOrder;
}

async function notifyReadyDrivers(orderId: number) {
  const db = getDb();
  const onlineDrivers = await db
    .select({ id: drivers.id })
    .from(drivers)
    .where(eq(drivers.status, "online"));
  for (const driver of onlineDrivers) {
    emit(`driver:${driver.id}`, { type: "new_available", orderId });
  }
}



interface MerchantStatusInput {
  id: number;
  status: "accepted" | "preparing" | "cancelled";
  notes?: string;
  cancellationReason?: string;
}

/**
 * Camino específico del comercio. No permite cambiar el pedido global a
 * ready_for_pickup (para eso existe commerce.markReady) ni cancelar pedidos
 * multi-comercio de otros locales.
 */
async function updateMerchantOrderStatus(
  ctx: Parameters<typeof assertOrderAccess>[0],
  access: Awaited<ReturnType<typeof assertOrderAccess>>,
  input: MerchantStatusInput,
) {
  const db = getDb();
  const merchantId = ctx.merchant!.id;
  const commerceIdsInOrder = [...new Set(access.items.map((item) => item.commerceId))];

  const ownedRows = await db
    .select({ id: commerces.id })
    .from(commerces)
    .where(
      and(
        inArray(commerces.id, commerceIdsInOrder),
        eq(commerces.merchantUserId, merchantId),
      ),
    );
  const ownedIds = ownedRows.map((row) => row.id);
  if (ownedIds.length === 0) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No participas en este pedido." });
  }

  const result = await db.transaction(async (tx) => {
    const orderRows = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, input.id))
      .for("update")
      .limit(1);
    const order = orderRows[0];
    if (!order) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Pedido no encontrado" });
    }

    if (isTerminalStatus(order.status)) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "El pedido ya está cerrado y no se puede modificar.",
      });
    }

    if (input.status === "cancelled") {
      if (["picked_up", "on_the_way"].includes(order.status)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "El pedido ya fue retirado por el repartidor; contacta a soporte.",
        });
      }
      if (ownedIds.length !== commerceIdsInOrder.length) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Este pedido incluye otros comercios. No puedes cancelarlo completo; contacta a soporte.",
        });
      }

      const reason = input.cancellationReason?.trim() || input.notes?.trim() || "Cancelado por el comercio";
      await tx
        .update(orders)
        .set({
          status: "cancelled",
          cancellationReason: reason,
          cancelledBy: "merchant",
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id));
      await tx.insert(orderStatusHistory).values({
        orderId: order.id,
        status: "cancelled",
        notes: `Cancelado por el comercio: ${reason}`,
      });
      await syncAllCommerceStatuses(tx, order.id, "cancelled");

      const rows = await tx.select().from(orders).where(eq(orders.id, order.id));
      return { order: rows[0], globalChanged: true };
    }

    if (!["received", "accepted", "preparing"].includes(order.status)) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "El pedido no está en un estado que permita prepararlo.",
      });
    }

    const currentRows = await tx
      .select()
      .from(orderCommerceStatus)
      .where(
        and(
          eq(orderCommerceStatus.orderId, order.id),
          inArray(orderCommerceStatus.commerceId, ownedIds),
        ),
      );

    if (input.status === "accepted") {
      const canAccept = currentRows.every((row) =>
        ["received", "accepted"].includes(row.status),
      );
      if (!canAccept) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Tu comercio ya avanzó este pedido.",
        });
      }
    }

    if (input.status === "preparing") {
      const blocked = currentRows.some((row) =>
        ["ready_for_pickup", "picked_up", "cancelled"].includes(row.status),
      );
      if (blocked) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Tu comercio ya marcó este pedido como listo o cancelado.",
        });
      }
    }

    await syncCommerceStatuses(tx, order.id, ownedIds, input.status);

    let globalChanged = false;
    if (
      order.status !== input.status &&
      canTransition(order.status, input.status, "merchant")
    ) {
      await tx
        .update(orders)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(orders.id, order.id));
      await tx.insert(orderStatusHistory).values({
        orderId: order.id,
        status: input.status,
        notes:
          input.notes ??
          `Estado actualizado a ${getOrderStatusMeta(input.status).shortLabel} por el comercio`,
      });
      globalChanged = true;
    }

    const rows = await tx.select().from(orders).where(eq(orders.id, order.id));
    return { order: rows[0], globalChanged };
  });

  if (result.globalChanged) {
    emit(`order:${input.id}`, { type: "status_update", status: input.status });
    emit("admin:dashboard", { type: "dashboard_update" });
  }
  for (const commerceId of ownedIds) {
    emit(`commerce:${commerceId}`, {
      type: "order_status",
      orderId: input.id,
      status: input.status,
    });
  }

  return sanitizeOrder(result.order);
}

export const orderRouter = createRouter({
  quote: customerQuery
    .input(z.object({ items: z.array(quoteItemSchema).min(1).max(50) }))
    .query(async ({ input }) => buildQuote(input.items)),

  create: customerQuery
    .input(checkoutSchema)
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const customer = ctx.customer!;

      const existing = await db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.idempotencyKey, input.idempotencyKey),
            eq(orders.customerId, customer.id),
          ),
        )
        .limit(1);
      if (existing[0]) {
        return { success: true, order: sanitizeOrder(existing[0]), idempotent: true };
      }

      if (input.paymentMethod === "transfer") assertReceipt(input.paymentReceipt);

      const quote = await buildQuote(input.items);
      if (quote.issues.length > 0 || quote.lines.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: quote.issues[0] ?? "El pedido no tiene productos válidos.",
          cause: quote.issues,
        });
      }

      let customerPhone: string;
      try {
        customerPhone = normalizePhone(input.customerPhone);
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "El teléfono de contacto no es válido.",
        });
      }

      const initialStatus: OrderStatus =
        input.paymentMethod === "transfer" ? "pending_payment" : "received";

      try {
        const newOrder = await db.transaction(async (tx) => {
          const inserted = await tx
            .insert(orders)
            .values({
              customerId: customer.id,
              status: initialStatus,
              subtotal: quote.subtotal.toFixed(2),
              deliveryFee: quote.deliveryFee.toFixed(2),
              commission: quote.commission.toFixed(2),
              total: quote.total.toFixed(2),
              paymentMethod: input.paymentMethod,
              paymentReceipt: input.paymentMethod === "transfer" ? input.paymentReceipt : undefined,
              deliveryAddress: input.deliveryAddress,
              customerPhone,
              notes: input.notes,
              idempotencyKey: input.idempotencyKey,
            })
            .returning();
          const order = inserted[0];

          for (const line of quote.lines) {
            await tx.insert(orderItems).values({
              orderId: order.id,
              productId: line.productId,
              commerceId: line.commerceId,
              productName: line.name,
              quantity: line.quantity.toString(),
              unitPrice: line.unitPrice.toFixed(2),
              total: line.total.toFixed(2),
            });
          }

          await tx.insert(orderStatusHistory).values({
            orderId: order.id,
            status: initialStatus,
            notes:
              input.paymentMethod === "transfer"
                ? "Pendiente de validación de pago"
                : "Pedido recibido",
          });

          const commerceIds = [...new Set(quote.lines.map((line) => line.commerceId))];
          const commerceRateRows = await tx
            .select({ id: commerces.id, commissionRate: commerces.commissionRate })
            .from(commerces)
            .where(inArray(commerces.id, commerceIds));
          const commerceRateMap = new Map(
            commerceRateRows.map((row) => [
              row.id,
              Number(row.commissionRate ?? "10"),
            ]),
          );

          for (const commerceId of commerceIds) {
            const commerceTotal = quote.lines
              .filter((line) => line.commerceId === commerceId)
              .reduce((sum, line) => sum + line.total, 0);
            const rate = commerceRateMap.get(commerceId) ?? 10;
            await tx.insert(orderCommerceStatus).values({
              orderId: order.id,
              commerceId,
              status: initialStatus,
              commissionAmount: (commerceTotal * (rate / 100)).toFixed(2),
            });
          }

          return order;
        });

        const commerceIds = [...new Set(quote.lines.map((line) => line.commerceId))];
        if (input.paymentMethod !== "transfer") {
          for (const commerceId of commerceIds) {
            emit(`commerce:${commerceId}`, { type: "new_order", orderId: newOrder.id });
          }
        }
        emit("admin:dashboard", { type: "dashboard_update" });

        return { success: true, order: sanitizeOrder(newOrder), idempotent: false };
      } catch (err: any) {
        const code = err?.code ?? err?.cause?.code;
        if (code === "23505") {
          const duplicate = await db
            .select()
            .from(orders)
            .where(
              and(
                eq(orders.idempotencyKey, input.idempotencyKey),
                eq(orders.customerId, customer.id),
              ),
            )
            .limit(1);
          if (duplicate[0]) {
            return { success: true, order: sanitizeOrder(duplicate[0]), idempotent: true };
          }
        }
        throw err;
      }
    }),

  getById: participantQuery
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const access = await assertOrderAccess(ctx, input.id);
      const db = getDb();
      const { order, items, viewer } = access;

      let driver = null;
      if (order.driverId) {
        const driverRows = await db.select().from(drivers).where(eq(drivers.id, order.driverId));
        if (driverRows[0]) {
          driver = safeDriver(driverRows[0]);
          if (isTerminalStatus(order.status)) {
            driver = { ...driver, phone: null, currentLat: null, currentLng: null };
          }
        }
      }

      const commerceIds = [...new Set(items.map((item) => item.commerceId))];
      const commerceRows = commerceIds.length
        ? await db
            .select({
              id: commerces.id,
              name: commerces.name,
              logo: commerces.logo,
              lat: commerces.lat,
              lng: commerces.lng,
            })
            .from(commerces)
            .where(inArray(commerces.id, commerceIds))
        : [];
      const statuses = await db
        .select()
        .from(orderCommerceStatus)
        .where(eq(orderCommerceStatus.orderId, order.id));
      const commerceStatuses = commerceRows.map((commerce) => ({
        ...commerce,
        status: statuses.find((s) => s.commerceId === commerce.id)?.status ?? order.status,
      }));

      const history = await db
        .select()
        .from(orderStatusHistory)
        .where(eq(orderStatusHistory.orderId, order.id))
        .orderBy(orderStatusHistory.createdAt)
        .limit(50);

      return {
        ...sanitizeOrder(order),
        items,
        history,
        driver,
        commerces: commerceStatuses,
        commerceStatuses: statuses,
        viewerRole: viewer.role,
      };
    }),

  getByCustomer: customerQuery
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(50).default(20),
          cursor: z.number().int().positive().optional(),
        })
        .default({ limit: 20 }),
    )
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const customerId = ctx.customer!.id;
      const list = await db
        .select()
        .from(orders)
        .where(
          input.cursor
            ? and(eq(orders.customerId, customerId), lt(orders.id, input.cursor))
            : eq(orders.customerId, customerId),
        )
        .orderBy(desc(orders.id))
        .limit(input.limit);

      if (list.length === 0) return [];
      const items = await db
        .select({
          orderId: orderItems.orderId,
          productName: orderItems.productName,
          quantity: orderItems.quantity,
          total: orderItems.total,
        })
        .from(orderItems)
        .where(inArray(orderItems.orderId, list.map((order) => order.id)));

      return list.map((order) => ({
        ...sanitizeOrder(order),
        items: items.filter((item) => item.orderId === order.id),
      }));
    }),

  getByDriver: driverQuery
    .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }).default({ limit: 20 }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(orders)
        .where(eq(orders.driverId, ctx.driver!.id))
        .orderBy(desc(orders.createdAt))
        .limit(input.limit);
      return rows.map(sanitizeOrder);
    }),

  getAvailableForDriver: driverQuery.query(async () => {
    const db = getDb();
    const availableOrders = await db
      .select({
        id: orders.id,
        status: orders.status,
        subtotal: orders.subtotal,
        deliveryFee: orders.deliveryFee,
        total: orders.total,
        paymentMethod: orders.paymentMethod,
        deliveryAddress: orders.deliveryAddress,
        customerPhone: orders.customerPhone,
        notes: orders.notes,
        createdAt: orders.createdAt,
        commerceName: commerces.name,
        commerceAddress: commerces.address,
        commerceLat: commerces.lat,
        commerceLng: commerces.lng,
      })
      .from(orders)
      .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
      .leftJoin(commerces, eq(commerces.id, orderItems.commerceId))
      .where(
        and(
          eq(orders.status, "ready_for_pickup"),
          isNull(orders.driverId),
        ),
      )
      .orderBy(orders.createdAt);

    const grouped = new Map<number, (typeof availableOrders)[number] & { lat: string | null; lng: string | null }>();
    for (const row of availableOrders) {
      if (!grouped.has(row.id)) {
        grouped.set(row.id, { ...row, lat: row.commerceLat, lng: row.commerceLng });
      }
    }
    return [...grouped.values()];
  }),

  updateStatus: participantQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        status: z.enum([
          "pending_payment",
          "received",
          "accepted",
          "preparing",
          "ready_for_pickup",
          "driver_assigned",
          "picked_up",
          "on_the_way",
          "delivered",
          "cancelled",
        ]),
        driverId: z.number().int().positive().optional(),
        notes: z.string().trim().max(500).optional(),
        cancellationReason: z.string().trim().max(500).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const access = await assertOrderAccess(ctx, input.id);
      const { order, viewer } = access;

      if (viewer.role === "merchant") {
        if (!["accepted", "preparing", "cancelled"].includes(input.status)) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "El comercio debe usar 'Marcar listo' para preparar el retiro del pedido.",
          });
        }
        return updateMerchantOrderStatus(ctx, access, {
          id: input.id,
          status: input.status as "accepted" | "preparing" | "cancelled",
          notes: input.notes,
          cancellationReason: input.cancellationReason,
        });
      }

      if (order.status === input.status) {
        return sanitizeOrder(order);
      }

      if (!canTransition(order.status, input.status as OrderStatus, viewer.role)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `No puedes pasar el pedido de "${getOrderStatusMeta(order.status).shortLabel}" a "${getOrderStatusMeta(input.status).shortLabel}".`,
        });
      }

      let assignedDriverId = order.driverId;
      if (viewer.role === "admin" && input.driverId) {
        const driverRows = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.id, input.driverId));
        if (!driverRows[0]) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Repartidor no encontrado" });
        }
        assignedDriverId = input.driverId;
      }
      if (viewer.role === "driver") {
        if (order.driverId !== ctx.driver!.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Este pedido no está asignado a ti" });
        }
        assignedDriverId = ctx.driver!.id;
      }

      const updated = await db.transaction(async (tx) => {
        if (input.status === "delivered" && assignedDriverId) {
          const existingEarning = await tx
            .select({ id: driverEarnings.id })
            .from(driverEarnings)
            .where(
              and(
                eq(driverEarnings.orderId, order.id),
                eq(driverEarnings.type, "delivery_fee"),
              ),
            )
            .limit(1);

          if (existingEarning.length === 0 && order.deliveryFee) {
            const driverRows = await tx
              .select()
              .from(drivers)
              .where(eq(drivers.id, assignedDriverId));
            const driver = driverRows[0];
            const rate = Number(driver?.commissionRate ?? "80");
            const amount = Number(order.deliveryFee) * (rate / 100);
            const today = new Date().toISOString().split("T")[0];
            await tx
              .insert(driverEarnings)
              .values({
                driverId: assignedDriverId,
                orderId: order.id,
                amount: amount.toFixed(2),
                type: "delivery_fee",
                date: today,
              })
              .onConflictDoNothing();
          }
          await tx
            .update(drivers)
            .set({ status: "online" })
            .where(eq(drivers.id, assignedDriverId));
        }

        if (assignedDriverId && ["ready_for_pickup", "picked_up", "on_the_way"].includes(input.status)) {
          await tx.update(drivers).set({ status: "busy" }).where(eq(drivers.id, assignedDriverId));
        }

        const patch: Record<string, unknown> = {
          status: input.status,
          updatedAt: new Date(),
        };
        if (input.status === "delivered") patch.deliveredAt = new Date();
        if (assignedDriverId) patch.driverId = assignedDriverId;
        if (input.status === "cancelled") {
          patch.cancellationReason = input.cancellationReason ?? input.notes ?? "Cancelado";
          patch.cancelledBy = viewer.role;
        }

        await tx.update(orders).set(patch).where(eq(orders.id, order.id));
        await syncAllCommerceStatuses(tx, order.id, input.status);
        await tx.insert(orderStatusHistory).values({
          orderId: order.id,
          status: input.status,
          notes:
            input.notes ??
            (input.status === "cancelled"
              ? `Cancelado por ${viewer.role}: ${patch.cancellationReason}`
              : `Estado actualizado a ${getOrderStatusMeta(input.status).shortLabel}`),
        });

        const rows = await tx.select().from(orders).where(eq(orders.id, order.id));
        return rows[0];
      });

      emit(`order:${order.id}`, {
        type: "status_update",
        status: input.status,
        driverId: assignedDriverId ?? undefined,
      });
      emit("admin:dashboard", { type: "dashboard_update" });

      const commerceRows = await db
        .select({ commerceId: orderItems.commerceId })
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id));
      const commerceIds = [...new Set(commerceRows.map((row) => row.commerceId))];
      for (const commerceId of commerceIds) {
        emit(`commerce:${commerceId}`, {
          type: input.status === "received" ? "new_order" : "order_status",
          orderId: order.id,
          status: input.status,
        });
      }
      if (input.status === "ready_for_pickup") {
        await notifyReadyDrivers(order.id);
      }

      return sanitizeOrder(updated);
    }),

  markCommerceReady: merchantQuery
    .input(z.object({ orderId: z.number().int().positive(), commerceId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await assertCommerceOwnership(ctx, input.commerceId);
      return markCommerceReadyForOrder(input.orderId, input.commerceId);
    }),

  getCommerceOrders: merchantQuery
    .input(
      z.object({
        commerceId: z.number().int().positive(),
        limit: z.number().int().min(1).max(200).default(100),
      }),
    )
    .query(async ({ input, ctx }) => {
      await assertCommerceOwnership(ctx, input.commerceId);
      const db = getDb();

      // Primero se acota la página de pedidos; nunca se cargan todos los
      // históricos ni todos los clientes.
      const orderIdRows = await db
        .select({ id: orders.id })
        .from(orders)
        .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
        .where(eq(orderItems.commerceId, input.commerceId))
        .groupBy(orders.id)
        .orderBy(desc(orders.createdAt))
        .limit(input.limit);
      const orderIds = orderIdRows.map((row) => row.id);
      if (orderIds.length === 0) return [];

      const [commerceRow] = await db
        .select()
        .from(commerces)
        .where(eq(commerces.id, input.commerceId));
      const commissionRate = Number(commerceRow?.commissionRate ?? "10");

      const [orderRows, items, statuses] = await Promise.all([
        db.select().from(orders).where(inArray(orders.id, orderIds)),
        db
          .select()
          .from(orderItems)
          .where(
            and(
              eq(orderItems.commerceId, input.commerceId),
              inArray(orderItems.orderId, orderIds),
            ),
          ),
        db
          .select()
          .from(orderCommerceStatus)
          .where(
            and(
              eq(orderCommerceStatus.commerceId, input.commerceId),
              inArray(orderCommerceStatus.orderId, orderIds),
            ),
          ),
      ]);

      const customerIds = [...new Set(orderRows.map((order) => order.customerId))];
      const customerRows = customerIds.length
        ? await db
            .select({
              id: customers.id,
              firstName: customers.firstName,
              lastName: customers.lastName,
              phone: customers.phone,
            })
            .from(customers)
            .where(inArray(customers.id, customerIds))
        : [];
      const customerMap = new Map(customerRows.map((customer) => [customer.id, customer]));
      const orderMap = new Map(orderRows.map((order) => [order.id, order]));

      return orderIds
        .map((orderId) => orderMap.get(orderId))
        .filter((order): order is (typeof orderRows)[number] => Boolean(order))
        .map((order) => {
          const orderItemsForOrder = items.filter((item) => item.orderId === order.id);
          const commerceTotal = orderItemsForOrder.reduce(
            (sum, item) => sum + Number(item.total),
            0,
          );
          const customer = customerMap.get(order.customerId);
          const myStatus = statuses.find(
            (status) => status.orderId === order.id && status.commerceId === input.commerceId,
          );
          const fallbackStatus = [
            "pending_payment",
            "payment_rejected",
            "received",
            "accepted",
            "cancelled",
            "delivered",
          ].includes(order.status)
            ? order.status
            : "preparing";

          // Proyección explícita: sin comprobante, sin idempotencyKey, sin
          // flags de liquidación y sin dirección completa.
          return {
            id: order.id,
            status: order.status,
            paymentMethod: order.paymentMethod,
            subtotal: order.subtotal,
            deliveryFee: order.deliveryFee,
            commission: order.commission,
            orderTotal: order.total,
            total: commerceTotal.toFixed(2),
            customerPhone: customer?.phone ?? order.customerPhone,
            notes: order.notes,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
            cancellationReason: order.cancellationReason,
            cancelledBy: order.cancelledBy,
            driverId: order.driverId,
            items: orderItemsForOrder,
            customerName: customer ? `${customer.firstName} ${customer.lastName}` : "",
            myCommerceStatus: ["pending_payment", "payment_rejected"].includes(order.status)
              ? order.status
              : myStatus?.status ?? fallbackStatus,
            commerceCommission: (
              commerceTotal *
              (commissionRate / 100)
            ).toFixed(2),
          };
        });
    }),

  updatePaymentReceipt: customerQuery
    .input(
      z.object({
        orderId: z.number().int().positive(),
        receipt: z.string().min(20).max(7_500_000),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      assertReceipt(input.receipt);
      const access = await assertOrderAccess(ctx, input.orderId);
      if (access.viewer.role !== "customer" || access.order.customerId !== ctx.customer!.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No puedes modificar este pedido" });
      }
      if (!["pending_payment", "payment_rejected"].includes(access.order.status)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Solo puedes subir un comprobante mientras el pago está pendiente o fue rechazado.",
        });
      }

      const db = getDb();
      const updated = await db.transaction(async (tx) => {
        const rows = await tx
          .update(orders)
          .set({
            paymentReceipt: input.receipt,
            status: "pending_payment",
            updatedAt: new Date(),
          })
          .where(eq(orders.id, input.orderId))
          .returning();
        await tx.insert(orderStatusHistory).values({
          orderId: input.orderId,
          status: "pending_payment",
          notes: "Comprobante re-subido por el cliente",
        });
        return rows[0];
      });

      emit(`order:${input.orderId}`, { type: "status_update", status: "pending_payment" });
      emit("admin:dashboard", { type: "dashboard_update" });
      return sanitizeOrder(updated);
    }),

  list: adminQuery
    .input(z.object({ limit: z.number().int().min(1).max(200).default(100) }).default({ limit: 100 }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(orders)
        .orderBy(desc(orders.createdAt))
        .limit(input.limit);
      return rows.map(sanitizeOrder);
    }),
});