import { getDb } from "./queries/connection";
import { users, drivers, customers, commerces, orders } from "@db/schema";
import { eq } from "drizzle-orm";
import { sendPushNotification } from "./lib/firebase";

// Simple in-memory event bus for SSE
type Listener = (data: any) => void;

const listeners: Map<string, Set<Listener>> = new Map();

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
    const commerceId = parseInt(channel.split(":")[1]);
    const commerceRows = await db.select().from(commerces).where(eq(commerces.id, commerceId));
    if (commerceRows.length > 0 && commerceRows[0].merchantUserId) {
      const userRows = await db.select().from(users).where(eq(users.id, commerceRows[0].merchantUserId));
      if (userRows.length > 0 && userRows[0].fcmToken) {
        let title = "Actualización de Comercio";
        let body = "Tienes una nueva notificación";
        
        if (data.type === "new_order") {
          title = "¡Nuevo Pedido Entrante!";
          body = `Has recibido el pedido #${data.orderId}. Revisa tu panel.`;
        }
        
        await sendPushNotification(userRows[0].fcmToken, title, body, data);
      }
    }
  }

  // Notify Driver
  if (channel.startsWith("driver:")) {
    const driverId = parseInt(channel.split(":")[1]);
    const driverRows = await db.select().from(drivers).where(eq(drivers.id, driverId));
    if (driverRows.length > 0 && driverRows[0].fcmToken) {
      let title = "Alerta de Repartidor";
      let body = "Tienes una nueva notificación";
      
      if (data.type === "new_available") {
        title = "¡Nuevo pedido disponible!";
        body = `Hay un nuevo pedido #${data.orderId} listo para ser retirado.`;
      }
      
      await sendPushNotification(driverRows[0].fcmToken, title, body, data);
    }
  }

  // Notify Customer (via Order)
  if (channel.startsWith("order:")) {
    const orderId = parseInt(channel.split(":")[1]);
    const orderRows = await db.select().from(orders).where(eq(orders.id, orderId));
    if (orderRows.length > 0) {
      const customerRows = await db.select().from(customers).where(eq(customers.id, orderRows[0].customerId));
      if (customerRows.length > 0 && customerRows[0].fcmToken) {
        let title = "Actualización de tu pedido";
        let body = "Tu pedido tiene novedades.";
        
        if (data.type === "status_update") {
          title = "Estado del Pedido Actualizado";
          body = `El estado de tu pedido ha cambiado a: ${data.status}`;
        } else if (data.type === "commerce_ready") {
          title = "Pedido Listo";
          body = "El comercio ha terminado de preparar tu pedido.";
        }
        
        await sendPushNotification(customerRows[0].fcmToken, title, body, data);
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
