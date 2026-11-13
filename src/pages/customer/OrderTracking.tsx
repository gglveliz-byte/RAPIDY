/**
 * @archivo src/pages/customer/OrderTracking.tsx
 * @modulo 02-customer-orders (Rastreo de Pedidos y Mapa en Tiempo Real)
 * @proposito
 *   Vista principal de seguimiento de órdenes para el cliente. Integra geolocalización en vivo,
 *   movimiento suavizado del repartidor por SSE, línea de tiempo de estados compartida,
 *   detalles de compra en USD y acceso directo al chat con el repartidor.
 */

import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { ArrowLeft, AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useOrder, useUpdatePaymentReceipt } from "@/hooks/useDeliveryData";
import { useOrderEvents } from "@/hooks/useOrderEvents";
import { trpc } from "@/providers/trpc";
import ChatBubble from "@/components/ChatBubble";
import { OrderTrackingMap } from "./components/OrderTrackingMap";
import { OrderTrackingTimeline } from "./components/OrderTrackingTimeline";
import { OrderTrackingDetails } from "./components/OrderTrackingDetails";
import {
  CUSTOMER_TIMELINE_STEPS,
  getOrderStatusMeta,
  isTerminalStatus,
} from "@contracts/orderStatus";

const statusSteps = CUSTOMER_TIMELINE_STEPS.map((step) => ({
  key: step.key,
  label: step.label,
  description: getOrderStatusMeta(step.key).description,
}));

interface GeoCoords {
  lat: number;
  lng: number;
}

export default function OrderTracking() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const orderId = Number(id);
  const validId = Number.isInteger(orderId) && orderId > 0;
  const { data: order, loading, error, isError, refresh } = useOrder(validId ? orderId : 0);
  const orderUtils = trpc.useUtils();
  const { connected } = useOrderEvents(validId ? orderId : undefined, orderUtils);

  const [driverPos, setDriverPos] = useState<GeoCoords | null>(null);
  const [deliveryCoords, setDeliveryCoords] = useState<GeoCoords | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [followDriver, setFollowDriver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const updateReceipt = useUpdatePaymentReceipt();

  // Posición inicial conocida del repartidor (antes del primer evento SSE).
  const initialDriverPos: GeoCoords | null = (() => {
    const lat = order?.driver?.currentLat;
    const lng = order?.driver?.currentLng;
    if (!lat || !lng) return null;
    const parsedLat = Number(lat);
    const parsedLng = Number(lng);
    return Number.isFinite(parsedLat) && Number.isFinite(parsedLng)
      ? { lat: parsedLat, lng: parsedLng }
      : null;
  })();
  const currentDriverPos = driverPos ?? initialDriverPos;

  const handleReuploadReceipt = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("El comprobante debe ser una imagen JPG, PNG o WEBP.");
      e.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("El comprobante no puede superar los 5 MB.");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      try {
        await updateReceipt.mutateAsync({ orderId, receipt: base64 });
        toast.success("Comprobante enviado. Estamos revisando tu pago.");
      } catch (err: any) {
        toast.error(err?.message || "No pudimos enviar el comprobante. Inténtalo de nuevo.");
      }
    };
    reader.onerror = () => toast.error("No pudimos leer la imagen.");
    reader.readAsDataURL(file);
  };

  // Geocodificación con caché de sesión y cancelación al desmontar.
  useEffect(() => {
    const address = order?.deliveryAddress;
    if (!address || deliveryCoords) return;

    const cacheKey = `rapidy:geo:${address}`;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as GeoCoords;
        if (Number.isFinite(parsed.lat) && Number.isFinite(parsed.lng)) {
          setDeliveryCoords(parsed);
          return;
        }
      }
    } catch { /* sin acción */ }

    const controller = new AbortController();
    setGeoLoading(true);
    const query = encodeURIComponent(address);
    fetch(
      `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&accept-language=es`,
      { signal: controller.signal },
    )
      .then((response) => response.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          const coords = {
            lat: parseFloat(data[0].lat),
            lng: parseFloat(data[0].lon),
          };
          if (Number.isFinite(coords.lat) && Number.isFinite(coords.lng)) {
            setDeliveryCoords(coords);
            try {
              sessionStorage.setItem(cacheKey, JSON.stringify(coords));
            } catch { /* sin acción */ }
          }
        }
      })
      .catch((err) => {
        if (err?.name !== "AbortError") {
          toast.error("No pudimos ubicar la dirección en el mapa. El seguimiento sigue activo.");
        }
      })
      .finally(() => setGeoLoading(false));

    return () => controller.abort();
  }, [order?.deliveryAddress, deliveryCoords]);

  // SSE de ubicación del repartidor. El servidor emite eventos nombrados "update".
  useEffect(() => {
    const driverId = order?.driver?.id;
    if (!driverId) return;

    let closed = false;
    let eventSource: EventSource | null = null;
    let retry = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (closed) return;
      eventSource = new EventSource(`/api/events/driver/${driverId}`);
      eventSource.addEventListener("update", (event) => {
        try {
          const data = JSON.parse((event as MessageEvent).data);
          if (data?.type === "location_update" && data.lat && data.lng) {
            const lat = Number(data.lat);
            const lng = Number(data.lng);
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
              retry = 0;
              setDriverPos({ lat, lng });
            }
          }
        } catch { /* sin acción */ }
      });
      eventSource.onerror = () => {
        eventSource?.close();
        if (closed) return;
        const delay = Math.min(30_000, 1_500 * 2 ** retry++);
        retryTimer = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      closed = true;
      eventSource?.close();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [order?.driver?.id]);

  const meta = getOrderStatusMeta(order?.status);
  const isDelivered = order?.status === "delivered";
  const isCancelled = order?.status === "cancelled";
  const isPaymentRejected = order?.status === "payment_rejected";
  const currentStepIndex = meta.step;
  const progress =
    currentStepIndex >= 0 ? ((currentStepIndex + 1) / statusSteps.length) * 100 : 0;

  const estimatedMinutes = (() => {
    if (!currentDriverPos || !deliveryCoords) return null;
    const R = 6371;
    const dLat = ((deliveryCoords.lat - currentDriverPos.lat) * Math.PI) / 180;
    const dLng = ((deliveryCoords.lng - currentDriverPos.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((currentDriverPos.lat * Math.PI) / 180) *
        Math.cos((deliveryCoords.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    const distanceKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.max(1, Math.round(distanceKm * 3));
  })();

  if (loading) {
    return (
      <div className="mobile-container bg-surface min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <Loader2 className="w-9 h-9 text-brand animate-spin" />
        <p className="mt-3 text-xs font-bold text-zinc-500">Cargando seguimiento de tu pedido...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="mobile-container bg-surface min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className={`w-10 h-10 ${isError ? "text-rose-400" : "text-zinc-400"}`} />
        <p className="mt-3 text-sm font-bold text-zinc-700">
          {isError ? "No pudimos cargar tu pedido" : "Pedido no encontrado"}
        </p>
        <p className="mt-1 text-xs text-zinc-500 max-w-[260px]">
          {isError
            ? error?.message || "Revisa tu conexión e inténtalo de nuevo."
            : "El enlace no es válido o el pedido ya no está disponible."}
        </p>
        <div className="mt-4 flex gap-2">
          {isError && (
            <button
              onClick={() => refresh()}
              className="h-10 px-4 bg-brand text-white text-xs font-black rounded-xl flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reintentar
            </button>
          )}
          <button
            onClick={() => navigate("/home")}
            className="h-10 px-4 bg-ink text-white text-xs font-black rounded-xl"
          >
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  const liveLabel = isTerminalStatus(order.status)
    ? meta.shortLabel
    : connected
    ? "En vivo"
    : "Reconectando";

  return (
    <div className="mobile-container bg-surface min-h-screen pb-24 text-zinc-900 selection:bg-brand/20">
      <header className="sticky top-0 z-40 bg-ink border-b border-white/10 px-4 pt-safe pb-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/home")}
            className="w-11 h-11 rounded-xl bg-white/10 hover:bg-white/15 active:scale-95 text-white flex items-center justify-center transition-all cursor-pointer"
            aria-label="Volver al inicio"
          >
            <ArrowLeft className="w-5 h-5 stroke-[2.2]" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black text-white tracking-tight">Pedido #{order.id}</h1>
              {!isTerminalStatus(order.status) && (
                <span
                  className={`w-2 h-2 rounded-full ${connected ? "bg-brand" : "bg-amber-400"} animate-pulse motion-reduce:animate-none`}
                />
              )}
            </div>
            <p className="text-[11px] text-zinc-400 font-medium">
              {new Date(order.createdAt).toLocaleDateString("es-ES", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        </div>

        <div className="text-right" aria-live="polite">
          <span
            className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border ${
              isTerminalStatus(order.status)
                ? "text-emerald-300 bg-emerald-500/15 border-emerald-500/30"
                : connected
                ? "text-brand bg-brand/15 border-brand/30"
                : "text-amber-300 bg-amber-500/15 border-amber-500/30"
            }`}
          >
            {liveLabel}
          </span>
        </div>
      </header>

      <OrderTrackingMap
        order={order}
        driverPos={currentDriverPos}
        deliveryCoords={deliveryCoords}
        geoLoading={geoLoading}
        followDriver={followDriver}
        onToggleFollowDriver={() => setFollowDriver(!followDriver)}
        estimatedMinutes={estimatedMinutes}
        isDelivered={isDelivered}
        isCancelled={isCancelled}
      />

      <main className="px-4 py-4 space-y-4">
        <OrderTrackingTimeline
          order={order}
          statusSteps={statusSteps}
          currentStepIndex={currentStepIndex}
          progress={progress}
          isCancelled={isCancelled}
          isPaymentRejected={isPaymentRejected}
          fileInputRef={fileInputRef}
          handleReuploadReceipt={handleReuploadReceipt}
          isUpdatingReceipt={updateReceipt.isPending}
        />

        <OrderTrackingDetails
          order={order}
          isDelivered={isDelivered}
          isCancelled={isCancelled}
        />
      </main>

      {!isDelivered && !isCancelled && <ChatBubble orderId={order.id} />}
    </div>
  );
}