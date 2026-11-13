import { getDb } from "./queries/connection";
import { users, drivers, customers, commerces, orders } from "@db/schema";
import { eq } from "drizzle-orm";
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

  // 2. Intercept for Native Push Notifications
  handlePushNotification(channel, data).catch(err => console.error("[Firebase] Error in handlePushNotification", err));
}

async function handlePushNotification(channel: string, data: any) {
  const db = getDb();

  // Notify Commerce
  if (channel.startsWith("commerce:")) {
    if (data.type !== "new_order") return;
    const commerceId = parseInt(channel.split(":")[1]);
    const commerceRows = await db.select().from(commerces).where(eq(commerces.id, commerceId));
    if (commerceRows.length > 0 && commerceRows[0].merchantUserId) {
      const userRows = await db.select().from(users).where(eq(users.id, commerceRows[0].merchantUserId));
      if (userRows.length > 0 && userRows[0].fcmToken) {
        if (!shouldPush(`commerce:${commerceId}:new:${data.orderId}`)) return;
        await sendPushNotification(
          userRows[0].fcmToken,
          "¡Nuevo pedido entrante!",
          `Has recibido el pedido #${data.orderId}. Revisa tu panel.`,
          data,
        );
      }
    }
  }

  // Notify Driver
  if (channel.startsWith("driver:")) {
    if (data.type !== "new_available" && data.type !== "order_assigned") return;
    const driverId = parseInt(channel.split(":")[1]);
    const driverRows = await db.select().from(drivers).where(eq(drivers.id, driverId));
    if (driverRows.length > 0 && driverRows[0].fcmToken) {
      if (!shouldPush(`driver:${driverId}:${data.type}:${data.orderId}`)) return;
      const title =
        data.type === "order_assigned" ? "Pedido asignado" : "¡Nuevo pedido disponible!";
      const body =
        data.type === "order_assigned"
          ? `Se te asignó el pedido #${data.orderId}.`
          : `Hay un nuevo pedido #${data.orderId} listo para retirar.`;
      await sendPushNotification(driverRows[0].fcmToken, title, body, data);
    }
  }

  // Notify Customer (via Order)
  if (channel.startsWith("order:")) {
    const orderId = parseInt(channel.split(":")[1]);
    const orderRows = await db.select().from(orders).where(eq(orders.id, orderId));
    if (orderRows.length === 0) return;
    const customerRows = await db.select().from(customers).where(eq(customers.id, orderRows[0].customerId));
    const customer = customerRows[0];
    if (!customer || customer.deletedAt || !customer.fcmToken) return;

    if (data.type === "status_update") {
      if (!shouldPush(`order:${orderId}:status:${data.status}`)) return;
      const meta = getOrderStatusMeta(data.status);
      await sendPushNotification(
        customer.fcmToken,
        "Actualización de tu pedido",
        `Pedido #${orderId}: ${meta.shortLabel}. ${meta.description}`,
        data,
      );
      return;
    }

    if (data.type === "chat_message") {
      if (data.senderType === "customer") return;
      if (!shouldPush(`order:${orderId}:chat:${data.messageId}`, 5_000)) return;
      await sendPushNotification(
        customer.fcmToken,
        "Nuevo mensaje",
        `Tienes un mensaje sobre el pedido #${orderId}.`,
        data,
      );
      return;
    }

    if (data.type === "commerce_ready") {
      if (!shouldPush(`order:${orderId}:ready`)) return;
      await sendPushNotification(
        customer.fcmToken,
        "Pedido listo",
        "El comercio terminó de preparar tu pedido.",
        data,
      );
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
