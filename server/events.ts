import { getDb } from "./queries/connection";
import { users, drivers, customers, commerces, orders } from "@db/schema";
import { and, eq } from "drizzle-orm";
import { sendPushNotification } from "./lib/firebase";
import { getOrderStatusMeta } from "@contracts/orderStatus";

// Simple in-memory event bus for SSE
type Listener = (data: any) => void;

const listeners: Map<string, Set<Listener>> = new Map();
const recentPush = new Map<string, number>();

/** Evita pushes duplicados por reintentos/eventos encadenados. */
function shouldPush(key: string, windowMs = 15_000): boolean {
  const now = Date.now();
  const last = recentPush.get(key);
  if (last && now - last < windowMs) return false;
  recentPush.set(key, now);
  if (recentPush.size > 5000) {
    for (const [entry, ts] of recentPush) {
      if (now - ts > windowMs * 4) recentPush.delete(entry);
    }
  }
  return true;
}

/** Log seguro: código/nombre del error, nunca tokens ni parámetros SQL. */
function logPushError(context: string, error: unknown) {
  let code = "unknown";
  if (error && typeof error === "object" && "code" in error) {
    const raw = (error as { code?: unknown }).code;
    if (typeof raw === "string" && raw.length > 0) code = raw;
  } else if (error instanceof Error) {
    code = error.name;
  }
  console.error(`[Push] ${context} (${code})`);
}

/**
 * Borra el token solo si sigue siendo el mismo que falló, para no pisar un
 * token nuevo registrado mientras el envío estaba en vuelo.
 */
async function clearInvalidToken(
  target: "merchant" | "driver" | "customer",
  id: number,
  token: string,
) {
  try {
    const db = getDb();
    if (target === "merchant") {
      await db
        .update(users)
        .set({ fcmToken: null })
        .where(and(eq(users.id, id), eq(users.fcmToken, token)));
    } else if (target === "driver") {
      await db
        .update(drivers)
        .set({ fcmToken: null })
        .where(and(eq(drivers.id, id), eq(drivers.fcmToken, token)));
    } else {
      await db
        .update(customers)
        .set({ fcmToken: null })
        .where(and(eq(customers.id, id), eq(customers.fcmToken, token)));
    }
  } catch (error) {
    logPushError("No se pudo limpiar el token inválido", error);
  }
}

export function emit(channel: string, data: any) {
  // 1. Send the SSE event to connected clients
  const channelListeners = listeners.get(channel);
  if (channelListeners) {
    channelListeners.forEach((listener) => {
      try {
        listener(data);
      } catch (err) {
        console.error(`[SSE] Error in listener for ${channel}:`, err);
      }
    });
  }

  // 2. Intercept for Native Push Notifications (never blocks or breaks SSE)
  handlePushNotification(channel, data).catch((err) =>
    logPushError("Error en handlePushNotification", err),
  );
}

async function handlePushNotification(channel: string, data: any) {
  const db = getDb();

  // Notify Commerce
  if (channel.startsWith("commerce:")) {
    if (data.type !== "new_order") return;
    const commerceId = parseInt(channel.split(":")[1]);
    const commerceRows = await db.select().from(commerces).where(eq(commerces.id, commerceId));
    if (commerceRows.length === 0 || !commerceRows[0].merchantUserId) return;
    const userRows = await db.select().from(users).where(eq(users.id, commerceRows[0].merchantUserId));
    const merchant = userRows[0];
    const token = merchant?.fcmToken;
    if (!merchant || !token) return;
    if (!shouldPush(`commerce:${commerceId}:new:${data.orderId}`)) return;
    const result = await sendPushNotification(
      token,
      "¡Nuevo pedido entrante!",
      `Has recibido el pedido #${data.orderId}. Revisa tu panel.`,
      data,
    );
    if (result.status === "invalid-token") {
      await clearInvalidToken("merchant", merchant.id, token);
    }
    return;
  }

  // Notify Driver
  if (channel.startsWith("driver:")) {
    if (data.type !== "new_available" && data.type !== "order_assigned") return;
    const driverId = parseInt(channel.split(":")[1]);
    const driverRows = await db.select().from(drivers).where(eq(drivers.id, driverId));
    const driver = driverRows[0];
    const token = driver?.fcmToken;
    if (!driver || !token) return;
    if (!shouldPush(`driver:${driverId}:${data.type}:${data.orderId}`)) return;
    const title =
      data.type === "order_assigned" ? "Pedido asignado" : "¡Nuevo pedido disponible!";
    const body =
      data.type === "order_assigned"
        ? `Se te asignó el pedido #${data.orderId}.`
        : `Hay un nuevo pedido #${data.orderId} listo para retirar.`;
    const result = await sendPushNotification(token, title, body, data);
    if (result.status === "invalid-token") {
      await clearInvalidToken("driver", driver.id, token);
    }
    return;
  }

  // Notify Customer (via Order)
  if (channel.startsWith("order:")) {
    const orderId = parseInt(channel.split(":")[1]);
    const orderRows = await db.select().from(orders).where(eq(orders.id, orderId));
    if (orderRows.length === 0) return;
    const customerRows = await db.select().from(customers).where(eq(customers.id, orderRows[0].customerId));
    const customer = customerRows[0];
    const token = customer?.fcmToken;
    if (!customer || customer.deletedAt || !token) return;

    if (data.type === "status_update") {
      if (!shouldPush(`order:${orderId}:status:${data.status}`)) return;
      const meta = getOrderStatusMeta(data.status);
      const result = await sendPushNotification(
        token,
        "Actualización de tu pedido",
        `Pedido #${orderId}: ${meta.shortLabel}. ${meta.description}`,
        data,
      );
      if (result.status === "invalid-token") {
        await clearInvalidToken("customer", customer.id, token);
      }
      return;
    }

    if (data.type === "chat_message") {
      if (data.senderType === "customer") return;
      if (!shouldPush(`order:${orderId}:chat:${data.messageId}`, 5_000)) return;
      const result = await sendPushNotification(
        token,
        "Nuevo mensaje",
        `Tienes un mensaje sobre el pedido #${orderId}.`,
        data,
      );
      if (result.status === "invalid-token") {
        await clearInvalidToken("customer", customer.id, token);
      }
      return;
    }

    if (data.type === "commerce_ready") {
      if (!shouldPush(`order:${orderId}:ready`)) return;
      const result = await sendPushNotification(
        token,
        "Pedido listo",
        "El comercio terminó de preparar tu pedido.",
        data,
      );
      if (result.status === "invalid-token") {
        await clearInvalidToken("customer", customer.id, token);
      }
    }
  }
}

export function subscribe(channel: string, listener: Listener): () => void {
  if (!listeners.has(channel)) {
    listeners.set(channel, new Set());
  }
  
  const channelListeners = listeners.get(channel)!;
  channelListeners.add(listener);
  
  // Return unsubscribe function
  return () => {
    channelListeners.delete(listener);
    if (channelListeners.size === 0) {
      listeners.delete(channel);
    }
  };
}