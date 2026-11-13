/**
 * @archivo src/pages/customer/OrderTracking.tsx
 * @modulo 02-customer-orders (Rastreo de Pedidos y Mapa en Tiempo Real)
 * @proposito
 *   Vista principal de seguimiento de órdenes para el cliente. Integra geolocalización en vivo,
 *   movimiento suavizado del repartidor por SSE, línea de tiempo de estados, detalles de compra
 *   en USD y acceso directo al canal de mensajería con el repartidor.
 *   Estilo oficial Rapidy: Cabecera Dark Velvet (#0E0E12), fondo luminoso (#F7F7FA) y acentos
 *   Flame Orange (#FF6A00).
 *
 * @resumen_contenido
 *   - Orquestador modular: sincroniza `OrderTrackingMap`, `OrderTrackingTimeline`, `OrderTrackingDetails`
 *     y `ChatBubble`. Controla eventos reactivos y geocodificación de dirección.
 *
 * @dependencias_internas
 *   - `useOrder`, `useUpdatePaymentReceipt` (@/hooks/useDeliveryData)
 *   - `useOrderEvents` (@/hooks/useOrderEvents)
 *   - `trpc` (@/providers/trpc)
 *   - `ChatBubble` (@/components/ChatBubble)
 *   - `OrderTrackingMap` (./components/OrderTrackingMap)
 *   - `OrderTrackingTimeline` (./components/OrderTrackingTimeline)
 *   - `OrderTrackingDetails` (./components/OrderTrackingDetails)
 *
 * @dependencias_externas
 *   - `react-router` (`useParams`, `useNavigate`)
 *   - `lucide-react` (`ArrowLeft`, `AlertCircle`, `Loader2`)
 */

import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { ArrowLeft, AlertCircle, Loader2 } from "lucide-react";
import { useOrder, useUpdatePaymentReceipt } from "@/hooks/useDeliveryData";
import { useOrderEvents } from "@/hooks/useOrderEvents";
import { trpc } from "@/providers/trpc";
import ChatBubble from "@/components/ChatBubble";
import { OrderTrackingMap } from "./components/OrderTrackingMap";
import { OrderTrackingTimeline } from "./components/OrderTrackingTimeline";
import { OrderTrackingDetails } from "./components/OrderTrackingDetails";

const statusSteps = [
  { key: "received", label: "Recibido", description: "Pedido recibido y confirmado" },
  { key: "preparing", label: "Preparando", description: "El comercio prepara tu pedido" },
  { key: "ready_for_pickup", label: "Listo", description: "Listo para recoger por el repartidor" },
  { key: "picked_up", label: "Retirado", description: "Repartidor retiró tu pedido" },
  { key: "on_the_way", label: "En camino", description: "Repartidor en camino a tu domicilio" },
  { key: "delivered", label: "Entregado", description: "Pedido entregado con éxito" },
];

export default function OrderTracking() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: order, loading } = useOrder(Number(id));
  const orderUtils = trpc.useUtils();
  useOrderEvents(Number(id), orderUtils);

  const [driverPos, setDriverPos] = useState<{ lat: number; lng: number } | null>(null);
  const [deliveryCoords, setDeliveryCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [followDriver, setFollowDriver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const updateReceipt = useUpdatePaymentReceipt();

  // Reenvío de comprobante de pago si fue rechazado
  const handleReuploadReceipt = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        try {
          await updateReceipt.mutateAsync({ orderId: Number(id), receipt: base64 });
          alert("Comprobante enviado exitosamente. En espera de revisión por el equipo.");
        } catch (err) {
          alert("Error al enviar el comprobante. Por favor, intenta de nuevo.");
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Geocodificación de la dirección del cliente al cargar la orden
  useEffect(() => {
    if (!order?.deliveryAddress || deliveryCoords) return;
    setGeoLoading(true);
    const q = encodeURIComponent(order.deliveryAddress);
    fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&accept-language=es`, {
      headers: { "User-Agent": "Rapidy-App/1.0" },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data?.length > 0) {
          setDeliveryCoords({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
        }
      })
      .catch(() => {})
      .finally(() => setGeoLoading(false));
  }, [order?.deliveryAddress, deliveryCoords]);

  // Suscripción al stream SSE de coordenadas del repartidor
  useEffect(() => {
    if (!order?.driver?.id) return;
    const eventSource = new EventSource(`/api/events/driver/${order.driver.id}`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "location_update" && data.lat && data.lng) {
          setDriverPos({ lat: parseFloat(data.lat), lng: parseFloat(data.lng) });
        }
      } catch {}
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [order?.driver?.id]);

  const isDelivered = order?.status === "delivered";
  const isCancelled = order?.status === "cancelled";
  const isPaymentRejected = order?.status === "payment_rejected";

  // Redirección suave al home tras 5 segundos de entregado
  useEffect(() => {
    if (isDelivered) {
      const timer = setTimeout(() => navigate("/home"), 6000);
      return () => clearTimeout(timer);
    }
  }, [isDelivered, navigate]);

  // Pantalla de carga o no encontrado
  if (loading || !order) {
    return (
      <div className="mobile-container bg-[#F7F7FA] min-h-screen flex flex-col items-center justify-center p-6 text-center">
        {loading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-9 h-9 text-[#FF6A00] animate-spin" />
            <p className="text-xs font-bold text-zinc-500">Cargando seguimiento de tu pedido...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <AlertCircle className="w-10 h-10 text-zinc-400" />
            <p className="text-sm font-bold text-zinc-700">Pedido no encontrado</p>
            <button
              onClick={() => navigate("/home")}
              className="mt-2 px-5 py-2.5 bg-[#0E0E12] text-white text-xs font-black rounded-xl cursor-pointer"
            >
              Volver al Inicio
            </button>
          </div>
        )}
      </div>
    );
  }

  const currentStepIndex = statusSteps.findIndex((s) => s.key === order.status);
  const progress = currentStepIndex >= 0 ? ((currentStepIndex + 1) / statusSteps.length) * 100 : 0;

  // Cálculo de tiempo estimado en minutos
  const estimatedMinutes = (() => {
    if (!driverPos || !deliveryCoords) return null;
    const R = 6371;
    const dLat = ((deliveryCoords.lat - driverPos.lat) * Math.PI) / 180;
    const dLng = ((deliveryCoords.lng - driverPos.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((driverPos.lat * Math.PI) / 180) *
        Math.cos((deliveryCoords.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    const distanceKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.max(1, Math.round(distanceKm * 3));
  })();

  return (
    <div className="mobile-container bg-[#F7F7FA] min-h-screen pb-24 text-zinc-900 selection:bg-[#FF6A00]/20">
      {/* Cabecera Dark Velvet Fija */}
      <header className="sticky top-0 z-40 bg-[#0E0E12] border-b border-white/10 px-4 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/home")}
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/15 active:scale-95 text-white flex items-center justify-center transition-all cursor-pointer"
            aria-label="Volver al inicio"
          >
            <ArrowLeft className="w-5 h-5 stroke-[2.2]" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black text-white tracking-tight">Pedido #{order.id}</h1>
              <span className="w-2 h-2 rounded-full bg-[#FF6A00] animate-ping" />
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

        {/* Indicador de Estado Rapidy */}
        <div className="text-right">
          <span className="text-[10px] font-black uppercase tracking-wider text-[#FF6A00] bg-[#FF6A00]/15 border border-[#FF6A00]/30 px-2.5 py-1 rounded-full">
            En vivo
          </span>
        </div>
      </header>

      {/* Mapa Dinámico en Vivo */}
      <OrderTrackingMap
        order={order}
        driverPos={driverPos}
        deliveryCoords={deliveryCoords}
        geoLoading={geoLoading}
        followDriver={followDriver}
        onToggleFollowDriver={() => setFollowDriver(!followDriver)}
        estimatedMinutes={estimatedMinutes}
        isDelivered={isDelivered}
        isCancelled={isCancelled}
      />

      {/* Contenido Principal Modular */}
      <main className="px-4 py-4 space-y-4">
        {/* Línea de tiempo y estados */}
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

        {/* Desglose de productos, costos en USD y dirección */}
        <OrderTrackingDetails
          order={order}
          isDelivered={isDelivered}
          isCancelled={isCancelled}
        />
      </main>

      {/* Botón flotante de mensajería en vivo con el repartidor */}
      {!isDelivered && !isCancelled && <ChatBubble orderId={order.id} />}
    </div>
  );
}
