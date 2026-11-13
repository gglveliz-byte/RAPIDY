import { useEffect, useRef, useState } from "react";

const SSE_URL = "/api/events/admin-dashboard";
const FALLBACK_INTERVAL = 30000;
const RECONNECT_DELAY = 3000;

export function useAdminSSE(onUpdate: () => void) {
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const fallbackRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const mountedRef = useRef(true);
  const onUpdateRef = useRef(onUpdate);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    mountedRef.current = true;

    function connect() {
      const es = new EventSource(SSE_URL);
      esRef.current = es;

      es.onopen = () => {
        if (!mountedRef.current) { es.close(); return; }
        setConnected(true);
        if (fallbackRef.current) {
          clearInterval(fallbackRef.current);
          fallbackRef.current = undefined;
        }
      };

      es.addEventListener("update", (event) => {
        if (!mountedRef.current) return;
        try {
          const data = JSON.parse((event as MessageEvent).data);
          if (data && data.type !== "ping") {
            onUpdateRef.current();
          }
        } catch {}
      });

      // Keep onmessage for standard events just in case
      es.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const data = JSON.parse(event.data);
          if (data && data.type !== "ping") {
            onUpdateRef.current();
          }
        } catch {}
      };

      es.onerror = () => {
        if (!mountedRef.current) return;
        es.close();
        esRef.current = null;
        setConnected(false);

        if (!fallbackRef.current) {
          fallbackRef.current = setInterval(() => {
            if (mountedRef.current) onUpdateRef.current();
          }, FALLBACK_INTERVAL);
        }

        setTimeout(() => {
          if (mountedRef.current && !esRef.current) {
            connect();
          }
        }, RECONNECT_DELAY);
      };
    }

    connect();

    return () => {
      mountedRef.current = false;
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      if (fallbackRef.current) {
        clearInterval(fallbackRef.current);
        fallbackRef.current = undefined;
      }
      setConnected(false);
    };
  }, []);

  return { connected };
}
