import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/providers/trpc";

const MAX_RECONNECT_DELAY = 30000;
const BASE_RECONNECT_DELAY = 1500;
const MAX_CONSECUTIVE_FAILURES = 10;

function createReconnectingEventSource(
  url: string,
  onMessage: (data: unknown) => void,
  onStatus?: (status: "connecting" | "connected" | "offline") => void,
): { close: () => void } {
  let eventSource: EventSource | null = null;
  let reconnectAttempts = 0;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  let isClosed = false;

  const closeSource = () => {
    if (eventSource) {
      try {
        eventSource.close();
      } catch {}
      eventSource = null;
    }
  };

  const connect = () => {
    if (isClosed) return;
    if (reconnectAttempts >= MAX_CONSECUTIVE_FAILURES) {
      console.warn(`[SSE] Giving up reconnecting to ${url} after ${reconnectAttempts} failures`);
      onStatus?.("offline");
      return;
    }
    // Don't open a connection when the tab is hidden — avoids QUIC idle-timeout spam
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      const onVisible = () => {
        document.removeEventListener("visibilitychange", onVisible);
        if (!isClosed) connect();
      };
      document.addEventListener("visibilitychange", onVisible);
      return;
    }

    onStatus?.("connecting");
    try {
      eventSource = new EventSource(url);
    } catch (err) {
      console.error("[SSE] EventSource constructor failed:", err);
      onStatus?.("offline");
      return;
    }

    eventSource.onopen = () => {
      reconnectAttempts = 0;
      onStatus?.("connected");
    };

    eventSource.addEventListener("update", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        if (data && data.type === "ping") {
          reconnectAttempts = 0;
          onStatus?.("connected");
          return;
        }
        onMessage(data);
        reconnectAttempts = 0;
        onStatus?.("connected");
      } catch (err) {
        console.error("[SSE] Error parsing event:", err);
      }
    });

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data && data.type === "ping") {
          reconnectAttempts = 0;
          return;
        }
        reconnectAttempts = 0;
      } catch {
        // Ignore ping messages that aren't JSON
      }
    };

    eventSource.onerror = () => {
      if (isClosed) {
        closeSource();
        return;
      }
      console.warn("[SSE] Connection error on", url);
      onStatus?.("connecting");

      closeSource();

      reconnectAttempts++;
      if (reconnectAttempts > MAX_CONSECUTIVE_FAILURES) {
        console.warn(`[SSE] Max failures reached for ${url}, stopping.`);
        onStatus?.("offline");
        return;
      }

      const delay = Math.min(
        BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts - 1) + Math.random() * 1000,
        MAX_RECONNECT_DELAY
      );
      console.log(`[SSE] Reconnecting in ${Math.round(delay)}ms (attempt ${reconnectAttempts})`);
      reconnectTimeout = setTimeout(connect, delay);
    };
  };

  connect();

  return {
    close: () => {
      isClosed = true;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      closeSource();
      onStatus?.("offline");
    }
  };
}

export function useOrderEvents(orderId: number | undefined, utils: ReturnType<typeof trpc.useUtils>) {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    if (!orderId) return;

    const connection = createReconnectingEventSource(
      `/api/events/orders/${orderId}`,
      () => {
        utils.order.getById.invalidate({ id: orderId });
        utils.chat.getByOrder.invalidate({ orderId });
        queryClient.invalidateQueries({ queryKey: ["order.getById", orderId] });
        queryClient.invalidateQueries({ queryKey: ["chat.getByOrder", orderId] });
      },
      (status) => setConnected(status === "connected"),
    );

    return () => connection.close();
  }, [orderId, utils, queryClient]);

  return { connected };
}

export function useCommerceEvents(commerceId: number | undefined, utils: ReturnType<typeof trpc.useUtils>) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!commerceId) return;

    const connection = createReconnectingEventSource(
      `/api/events/commerce/${commerceId}`,
      () => {
        utils.order.getCommerceOrders.invalidate({ commerceId });
        utils.product.getByCommerce.invalidate({ commerceId });
        queryClient.invalidateQueries({ queryKey: ["order.getCommerceOrders", commerceId] });
        queryClient.invalidateQueries({ queryKey: ["product.getByCommerce", commerceId] });
      }
    );

    return () => connection.close();
  }, [commerceId, utils, queryClient]);
}

export function useDriverEvents(
  driverId: number | undefined,
  utils: ReturnType<typeof trpc.useUtils>,
  onNewOrder?: () => void
) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!driverId) return;

    const connection = createReconnectingEventSource(
      `/api/events/driver/${driverId}`,
      (data) => {
        if (data && typeof data === "object" && "type" in (data as any) && (data as any).type === "new_available") {
          onNewOrder?.();
        }
        utils.order.getAvailableForDriver.invalidate();
        utils.driver.getOrderHistory.invalidate({ id: driverId });
        queryClient.invalidateQueries({ queryKey: ["order.getAvailableForDriver"] });
        queryClient.invalidateQueries({ queryKey: ["driver.getOrderHistory", driverId] });
      }
    );

    return () => connection.close();
  }, [driverId, utils, onNewOrder, queryClient]);
}

export function useProductEvents(utils: ReturnType<typeof trpc.useUtils>) {
  const queryClient = useQueryClient();
  useEffect(() => {
    const connection = createReconnectingEventSource(
      `/api/events/products`,
      () => {
        utils.product.getFeatured.invalidate();
        utils.product.list.invalidate();
        utils.product.getByCommerce.invalidate();
        queryClient.invalidateQueries({ queryKey: ["product.getFeatured"] });
        queryClient.invalidateQueries({ queryKey: ["product.getByCommerce"] });
      }
    );

    return () => connection.close();
  }, [utils, queryClient]);
}

export function useCommercesEvents(utils: ReturnType<typeof trpc.useUtils>) {
  const queryClient = useQueryClient();
  useEffect(() => {
    const connection = createReconnectingEventSource(
      `/api/events/commerces`,
      () => {
        utils.commerce.list.invalidate();
        queryClient.invalidateQueries({ queryKey: ["commerce.list"] });
      }
    );

    return () => connection.close();
  }, [utils, queryClient]);
}
