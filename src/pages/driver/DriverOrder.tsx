import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router";
import {
  ArrowLeft,
  Phone,
  Navigation,
  Package,
  CheckCircle,
  Loader2,
  Store,
  Home,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useDriverSession } from "@/hooks/useDeliveryData";
import { useOrderEvents } from "@/hooks/useOrderEvents";
import { getOrderStatusMeta } from "@contracts/orderStatus";
import { ThemeToggle } from "@/components/ThemeToggle";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import ChatBubble from "@/components/ChatBubble";
import { DEFAULT_MAP_CENTER, geocodeAddress } from "@/lib/geocoding";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent = `@keyframes driverPulse { 0% { box-shadow: 0 3px 12px rgba(21,101,192,0.35); } 50% { box-shadow: 0 3px 20px rgba(21,101,192,0.65); } 100% { box-shadow: 0 3px 12px rgba(21,101,192,0.35); } }`;
  document.head.appendChild(style);
}

const orderSteps = [
  { key: "driver_assigned", label: "Asignado · retirar del local" },
  { key: "picked_up", label: "Pedido retirado" },
  { key: "on_the_way", label: "En camino al cliente" },
  { key: "delivered", label: "Entregado" },
];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export default function DriverOrder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const driverSession = useDriverSession();
  const driverId = driverSession?.id ?? null;
  const mapRef = useRef<L.Map | null>(null);
  const geocodedAddressRef = useRef<string | null>(null);
  const [destGeocode, setDestGeocode] = useState<{
    address: string;
    coords: { lat: number; lng: number } | null;
  } | null>(null);

  const { data: order, isLoading } = trpc.order.getById.useQuery(
    { id: Number(id) },
    { enabled: !!id }
  );
  const { data: driverProfile } = trpc.driver.getById.useQuery(
    { id: driverId! },
    { enabled: !!driverId },
  );

  const deliveryAddress = order?.deliveryAddress?.trim() || "";
  const destCoords =
    destGeocode?.address === deliveryAddress ? destGeocode.coords : null;

  const utils = trpc.useUtils();
  useOrderEvents(Number(id), utils);

  const updateStatusMutation = trpc.order.updateStatus.useMutation({
    onSuccess: () => {
      utils.order.getById.invalidate({ id: Number(id) });
      utils.driver.getEarnings.invalidate({ id: driverId! });
      utils.driver.getOrderHistory.invalidate({ limit: 50 });
      utils.driver.getActiveOrders.invalidate({ id: driverId! });
      utils.driver.getById.invalidate({ id: driverId! });
    },
  });
  const acceptOrderMutation = trpc.driver.acceptOrder.useMutation({
    onSuccess: () => utils.order.getById.invalidate({ id: Number(id) }),
  });
  const markCommercePickupMutation = trpc.driver.markCommercePickup.useMutation({
    onSuccess: () => {
      utils.order.getById.invalidate({ id: Number(id) });
      utils.driver.getActiveOrders.invalidate({ id: driverId! });
    },
    onError: (error) => toast.error(error.message || "No se pudo marcar el retiro."),
  });
  const updateLocationMutation = trpc.driver.updateLocation.useMutation();
  const lastLocationRef = useRef(0);

  useEffect(() => {
    if (!driverId || !order) return;
    if (!["driver_assigned", "ready_for_pickup", "picked_up", "on_the_way"].includes(order.status)) {
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastLocationRef.current < 15_000) return;
        lastLocationRef.current = now;
        updateLocationMutation.mutate({
          id: driverId,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 10_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [driverId, order?.status, updateLocationMutation]);

  const allCommerceIds: number[] = order?.items ? [...new Set(order.items.map((i: any) => i.commerceId as number))] : [];
  const pickedUpCommerceIds: number[] = (order as any)?.pickedUpCommerceIds || [];
  const allPickedUp = allCommerceIds.length > 0 && allCommerceIds.every((id) => pickedUpCommerceIds.includes(id));

  // Per-commerce status from order.commerces (includes status field: preparing | ready_for_pickup | picked_up)
  const getCommerceStatus = (commerce: any) => commerce?.status || "preparing";

  // Geocodificación del destino: cacheada, cancelable y sin bloquear el mapa.
  // Si falla, el mapa sigue con el comercio o con DEFAULT_MAP_CENTER.
  useEffect(() => {
    if (!deliveryAddress) return;
    if (geocodedAddressRef.current === deliveryAddress) return;

    geocodedAddressRef.current = deliveryAddress;
    const controller = new AbortController();
    geocodeAddress(deliveryAddress, { signal: controller.signal }).then((coords) => {
      if (!controller.signal.aborted) setDestGeocode({ address: deliveryAddress, coords });
    });
    return () => controller.abort();
  }, [deliveryAddress]);

  const getCurrentStep = (status: string) => {
    if (status === "ready_for_pickup" || status === "driver_assigned") return 0;
    if (status === "picked_up") return 1;
    if (status === "on_the_way") return 2;
    if (status === "delivered") return 3;
    return -1;
  };

  const currentStep = order ? getCurrentStep(order.status) : -1;
  const delivered = order?.status === "delivered";
  const isTerminal = delivered || order?.status === "cancelled";
  const isAssigned = order?.driverId === driverId;
  const earningAmount = (
    (Number(order?.deliveryFee ?? 0) *
      Number(order?.driverCommissionRate ?? driverProfile?.commissionRate ?? 75)) /
    100
  ).toFixed(2);

  const handleAcceptOrder = async () => {
    if (!id || !driverId) return;
    try {
      await acceptOrderMutation.mutateAsync({ orderId: Number(id) });
      utils.order.getById.invalidate({ id: Number(id) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo aceptar el pedido.");
    }
  };

  const handleMarkCommercePickup = async (commerceId: number) => {
    if (!id || !driverId) return;
    await markCommercePickupMutation.mutateAsync({
      driverId,
      orderId: Number(id),
      commerceId,
    });
  };

  const handleNextStep = async () => {
    if (!id || !order) return;
    try {
      if (order.status === "picked_up") {
        await updateStatusMutation.mutateAsync({
          id: Number(id),
          status: "on_the_way",
          driverId: driverId || undefined,
        });
      } else if (order.status === "on_the_way") {
        await updateStatusMutation.mutateAsync({
          id: Number(id),
          status: "delivered",
          driverId: driverId || undefined,
        });
      }
      utils.order.getById.invalidate({ id: Number(id) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar el pedido.");
    }
  };

  const openRoute = () => {
    const address = encodeURIComponent(order?.deliveryAddress || "");
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${address}`, "_blank");
  };

  // Initialize map
  useEffect(() => {
    if (!order || mapRef.current) return;

    const mapContainer = document.getElementById("driver-map");
    if (!mapContainer) return;

    const firstCommerce = order.commerces?.find((c: any) => c.lat && c.lng);
    const initialLat = firstCommerce ? Number(firstCommerce.lat) : DEFAULT_MAP_CENTER.lat;
    const initialLng = firstCommerce ? Number(firstCommerce.lng) : DEFAULT_MAP_CENTER.lng;

    const newMap = L.map(mapContainer, {
      zoomControl: false,
      attributionControl: true,
    }).setView([initialLat, initialLng], 13);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(newMap);

    newMap.whenReady(() => {
      const markers: L.Marker[] = [];
      const bounds = L.latLngBounds([]);

      // All commerce markers
      const commerceCoords: [number, number][] = [];
      if (order.commerces) {
        for (const c of order.commerces) {
          if (c.lat && c.lng) {
            const lat = parseFloat(c.lat);
            const lng = parseFloat(c.lng);
            const isPicked = pickedUpCommerceIds.includes(c.id);
            const cStatus = getCommerceStatus(c);
            const isReady = cStatus === "ready_for_pickup";
            commerceCoords.push([lat, lng]);
            const marker = L.marker([lat, lng], {
              title: `Comercio: ${c.name || "Comercio"}`,
              alt: `Marcador del comercio ${c.name || ""}`,
              icon: L.divIcon({
                className: "",
                iconSize: [40, 44],
                iconAnchor: [20, 20],
                html: `<div style="display:flex;flex-direction:column;align-items:center;">
                  <div style="width:36px;height:36px;background:${isPicked ? "linear-gradient(135deg,#34D399,#059669)" : isReady ? "linear-gradient(135deg,#FF8A00,#E85D00)" : "linear-gradient(135deg,#9E9E9E,#757575)"};border:3px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.2);">
                    ${isPicked ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : isReady ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>' : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>'}
                  </div>
                  <div style="margin-top:2px;background:${isPicked ? "#059669" : isReady ? "#FF6A00" : "#9E9E9E"};color:white;font-size:7px;font-weight:700;padding:1px 6px;border-radius:4px;border:1px solid white;white-space:nowrap;">${escapeHtml(c.name || "Comercio")}</div>
                </div>`,
              }),
            }).addTo(newMap);
            markers.push(marker);
            bounds.extend([lat, lng]);
          }
        }
      }

      // Driver marker
      if (order.driver?.currentLat && order.driver?.currentLng) {
        const lat = parseFloat(order.driver.currentLat);
        const lng = parseFloat(order.driver.currentLng);
        const marker = L.marker([lat, lng], {
          title: "Tu ubicación",
          alt: "Marcador de tu ubicación",
          icon: L.divIcon({
            className: "",
            iconSize: [40, 44],
            iconAnchor: [20, 20],
            html: `<div style="width:36px;height:36px;background:linear-gradient(135deg,#1565C0,#0D47A1);border:3px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 12px rgba(21,101,192,0.4);animation:driverPulse 2s infinite;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M5 18a2 2 0 1 0 4 0a2 2 0 0 0-4 0"/><path d="M15 18a2 2 0 1 0 4 0a2 2 0 0 0-4 0"/><path d="M5 18H3V6a1 1 0 0 1 1-1h10l3 5h2a3 3 0 0 1 3 3v5h-2"/><path d="M9 18h6"/></svg>
            </div>`,
          }),
        }).addTo(newMap);
        markers.push(marker);
        bounds.extend([lat, lng]);
      }

      // Destination marker
      if (destCoords) {
        const marker = L.marker([destCoords.lat, destCoords.lng], {
          title: "Cliente",
          alt: "Marcador del cliente",
          icon: L.divIcon({
            className: "",
            iconSize: [40, 44],
            iconAnchor: [20, 20],
            html: `<div style="display:flex;flex-direction:column;align-items:center;">
              <div style="width:36px;height:36px;background:linear-gradient(135deg,#E53935,#C62828);border:3px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.2);">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
              </div>
              <div style="margin-top:2px;background:#E53935;color:white;font-size:7px;font-weight:700;padding:1px 6px;border-radius:4px;border:1px solid white;white-space:nowrap;">Cliente</div>
            </div>`,
          }),
        }).addTo(newMap);
        markers.push(marker);
        bounds.extend([destCoords.lat, destCoords.lng]);
      }

      // Route polyline: through all commerces then to destination
      const routePoints: [number, number][] = [];
      if (commerceCoords.length > 0 && destCoords) {
        routePoints.push(...commerceCoords, [destCoords.lat, destCoords.lng]);
        L.polyline(routePoints, {
          color: "#1565C0",
          weight: 2.5,
          opacity: 0.5,
          dashArray: "8,8",
        }).addTo(newMap);
      }

      if (markers.length > 0) {
        newMap.fitBounds(bounds.pad(0.3));
      }
    });

    mapRef.current = newMap;

    // Ensure Leaflet measures the container after the first layout pass.
    const resizeFrame = window.requestAnimationFrame(() => {
      if (mapRef.current === newMap) newMap.invalidateSize();
    });

    return () => {
      window.cancelAnimationFrame(resizeFrame);
      mapRef.current = null;
      newMap.remove();
    };
  }, [order, destCoords]);

  if (isLoading) {
    return (
      <div role="status" aria-live="polite" className="mobile-container bg-[#F7F7FA] dark:bg-[#0A0A0D] min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand" aria-hidden="true" />
        <span className="sr-only">Cargando pedido…</span>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="mobile-container bg-[#F7F7FA] dark:bg-[#0A0A0D] min-h-screen flex items-center justify-center">
        <p className="text-zinc-500 dark:text-zinc-400">Pedido no encontrado</p>
      </div>
    );
  }

  return (
    <div className="mobile-container bg-[#F7F7FA] dark:bg-[#0A0A0D] min-h-screen">
      {/* Header */}
      <div className="bg-gradient-to-br from-brand to-brand-strong px-4 pt-safe pb-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => navigate("/driver")} aria-label="Volver a pedidos" className="text-white/80 hover:text-white touch-target flex items-center justify-center rounded-xl">
            <ArrowLeft className="w-6 h-6" aria-hidden="true" />
          </button>
          <ThemeToggle
            size="lg"
            className="!bg-white/20 !border-white/20 !text-white hover:!bg-white/30"
          />
        </div>
        <h1 className="text-xl font-bold text-white">Pedido #{id}</h1>
        <p className="text-white/80 text-sm mt-1">
          {getOrderStatusMeta(order.status).label}
        </p>
      </div>

      {/* Map */}
      <div
        id="driver-map"
        className="relative z-0 h-52 mx-4 -mt-3 rounded-xl shadow-lg overflow-hidden bg-zinc-200 dark:bg-[#121216] border border-zinc-200 dark:border-white/10 [&_.leaflet-control-attribution]:bg-white/85 [&_.leaflet-control-attribution]:text-zinc-600 dark:[&_.leaflet-control-attribution]:bg-[#1A1A1E]/90 dark:[&_.leaflet-control-attribution]:text-zinc-400 [&_.leaflet-control-attribution_a]:text-brand-strong"
      />

      {/* Order Info */}
      <div className="px-4 mt-4">
        <div className="bg-white dark:bg-[#1A1A1E] rounded-xl card-shadow p-4 border border-zinc-100 dark:border-white/10">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Detalles</h2>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 bg-brand-soft dark:bg-brand/15 rounded-lg flex items-center justify-center flex-shrink-0">
                <Store className="w-5 h-5 text-brand" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {order.commerces?.length === 1
                    ? order.commerces[0].name
                    : `${order.commerces?.length || 0} comercios`}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {allCommerceIds.length > 0
                    ? `Recogidos: ${pickedUpCommerceIds.length}/${allCommerceIds.length}`
                    : "Comercios del pedido"}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 bg-blue-100 dark:bg-sky-500/15 rounded-lg flex items-center justify-center flex-shrink-0">
                <Home className="w-5 h-5 text-blue-600 dark:text-sky-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Cliente</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{order.deliveryAddress}</p>
                {!isTerminal && (
                  <div className="flex gap-2 mt-1">
                    <a
                      href={`tel:${order.customerPhone || ""}`}
                      aria-label={`Llamar al cliente ${order.customerPhone || ""}`}
                      className="inline-flex items-center gap-1.5 min-h-11 min-w-11 -ml-2 px-2 text-xs text-blue-600 dark:text-sky-400"
                    >
                      <Phone className="w-3.5 h-3.5" aria-hidden="true" /> {order.customerPhone || "Llamar"}
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Commerce Pickup Checklist — only when driver is assigned but not fully picked up */}
      {isAssigned && !allPickedUp && !delivered && (
        <div className="px-4 mt-4">
          <div className="bg-white dark:bg-[#1A1A1E] rounded-xl card-shadow p-4 border border-zinc-100 dark:border-white/10">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Recoger en comercios</h2>
            <div className="space-y-2">
              {order.commerces?.map((c: any) => {
                const picked = pickedUpCommerceIds.includes(c.id);
                const cStatus = getCommerceStatus(c);
                const isReady = cStatus === "ready_for_pickup";
                const isPreparing = cStatus === "preparing";
                const statusLabel = isPreparing ? "Preparando" : isReady ? "Listo" : "Recogido";
                const statusColor = isPreparing
                  ? "text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-500/10"
                  : isReady
                    ? "text-brand-strong bg-brand-soft dark:text-brand dark:bg-brand/15"
                    : "text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-500/10";
                return (
                  <div key={c.id} className="flex items-center justify-between gap-3 p-2 rounded-lg bg-zinc-50 dark:bg-[#16161B] border border-zinc-100 dark:border-white/5">
                    <div className="flex items-center gap-2">
                      <Store className="w-4 h-4 text-brand" />
                      <div>
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{c.name}</p>
                        {c.address && <p className="text-xs text-zinc-500 dark:text-zinc-400">{c.address}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor}`}>{statusLabel}</span>
                      {picked ? (
                        <div className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400 text-xs font-medium">
                          <Check className="w-4 h-4" />
                          Recogido
                        </div>
                      ) : isReady ? (
                        <button
                          onClick={() => handleMarkCommercePickup(c.id)}
                          disabled={markCommercePickupMutation.isPending}
                          aria-label={`Marcar retiro en ${c.name || "el comercio"}`}
                          className="min-h-11 px-3 bg-brand text-zinc-950 text-xs font-semibold rounded-lg hover:brightness-110 active:scale-[0.97] transition-all flex items-center gap-1 touch-target disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {markCommercePickupMutation.isPending ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Package className="w-3 h-3" />
                          )}
                          Recoger
                        </button>
                      ) : (
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">Esperando preparación</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Progress Steps */}
      <div className="px-4 mt-4">
        <div className="bg-white dark:bg-[#1A1A1E] rounded-xl card-shadow p-4 border border-zinc-100 dark:border-white/10">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Progreso</h2>
          <div className="relative">
            <div className="absolute left-3.5 top-3 bottom-3 w-0.5 bg-zinc-200 dark:bg-white/10" />
            <div className="space-y-4">
              {orderSteps.map((step, i) => (
                <div key={step.key} className="flex items-center gap-3 relative z-10">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center ${
                      delivered && i === orderSteps.length - 1
                        ? "bg-emerald-500 text-white"
                        : i <= currentStep
                          ? "bg-brand text-zinc-950"
                          : "bg-zinc-200 dark:bg-white/10 text-zinc-500 dark:text-zinc-400"
                    }`}
                  >
                    {(i < currentStep || (i === currentStep && delivered)) ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : (
                      <span className="text-xs font-bold">{i + 1}</span>
                    )}
                  </div>
                  <span
                    className={`text-sm ${i <= currentStep ? "text-zinc-900 dark:text-zinc-100 font-medium" : "text-zinc-500 dark:text-zinc-400"}`}
                  >
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      {!delivered && order.status === "ready_for_pickup" && !order.driverId && (
        <div className="px-4 mt-4 mb-6">
          <button
            onClick={handleAcceptOrder}
            disabled={acceptOrderMutation.isPending}
            className="w-full h-12 bg-brand text-zinc-950 font-semibold rounded-xl hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {acceptOrderMutation.isPending ? "Aceptando..." : "Aceptar pedido"}
          </button>
        </div>
      )}

      {!delivered && allPickedUp && (
        <div className="px-4 mt-4 mb-6">
          {order.status === "picked_up" && (
            <button
              onClick={handleNextStep}
              className="w-full h-12 bg-brand text-zinc-950 font-semibold rounded-xl hover:brightness-110 active:scale-[0.98] transition-all"
            >
              Camino al cliente
            </button>
          )}
          {order.status === "on_the_way" && (
            <button
              onClick={handleNextStep}
              className="w-full h-12 bg-brand text-zinc-950 font-semibold rounded-xl hover:brightness-110 active:scale-[0.98] transition-all"
            >
              Completar entrega
            </button>
          )}
        </div>
      )}

      {!isTerminal && (
        <button
          onClick={openRoute}
          className="mx-4 mb-2 h-10 bg-white dark:bg-[#1A1A1E] border border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-200 font-medium rounded-xl hover:bg-zinc-50 dark:hover:bg-white/5 transition-all flex items-center justify-center gap-2"
        >
          <Navigation className="w-4 h-4 text-brand" />
          Abrir en Google Maps
        </button>
      )}

      {!isTerminal && <ChatBubble orderId={Number(id)} role="driver" />}

      {delivered && (
        <div className="px-4 mt-4 mb-6">
          <div className="bg-emerald-50 dark:bg-emerald-500/10 rounded-xl p-4 text-center border border-emerald-100 dark:border-emerald-500/20">
            <CheckCircle className="w-10 h-10 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Entrega completada!</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Ganancia acreditada: ${earningAmount}</p>
            <button
              type="button"
              onClick={() => navigate("/driver/history")}
              className="mt-3 min-h-11 px-4 py-2 rounded-lg bg-brand hover:brightness-110 text-zinc-950 text-xs font-bold transition-colors"
            >
              Ver historial
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
