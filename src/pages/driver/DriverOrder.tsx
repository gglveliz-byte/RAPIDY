import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router";
import {
  Phone,
  Navigation,
  Package,
  CheckCircle,
  Loader2,
  Store,
  Home,
  Check,
  MessageCircle,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useDriverSession } from "@/hooks/useDeliveryData";
import { useOrderEvents } from "@/hooks/useOrderEvents";
import { getOrderStatusMeta } from "@contracts/orderStatus";
import DriverLayout from "@/components/DriverLayout";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
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
  const pickupLabel =
    allCommerceIds.length > 0
      ? `Recogidos: ${pickedUpCommerceIds.length}/${allCommerceIds.length}`
      : "Comercios del pedido";

  const singleCommerce = order.commerces?.length === 1 ? order.commerces[0] : null;
  const singleReadyPickup =
    isAssigned &&
    !delivered &&
    singleCommerce &&
    getCommerceStatus(singleCommerce) === "ready_for_pickup" &&
    !pickedUpCommerceIds.includes(singleCommerce.id);

  const primaryAction = (() => {
    if (delivered) return null;
    if (order.status === "cancelled") return null;
    if (singleReadyPickup) {
      return (
        <button
          onClick={() => handleMarkCommercePickup(singleCommerce.id)}
          disabled={markCommercePickupMutation.isPending}
          className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand text-[13px] font-bold text-zinc-950 transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
        >
          {markCommercePickupMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Package className="h-4 w-4" aria-hidden="true" />
          )}
          Recoger en {singleCommerce.name}
        </button>
      );
    }
    if (order.status === "ready_for_pickup" && !order.driverId) {
      return (
        <button
          onClick={handleAcceptOrder}
          disabled={acceptOrderMutation.isPending}
          className="h-11 flex-1 rounded-xl bg-brand text-[13px] font-bold text-zinc-950 transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
        >
          {acceptOrderMutation.isPending ? "Aceptando..." : "Aceptar pedido"}
        </button>
      );
    }
    if (!allPickedUp) {
      return (
        <div className="flex h-11 flex-1 items-center justify-center rounded-xl bg-zinc-100 px-3 text-center text-[11px] font-semibold text-zinc-500 dark:bg-white/5 dark:text-zinc-400">
          {isAssigned ? "Retira el pedido para continuar" : "Esperando asignación"}
        </div>
      );
    }
    if (order.status === "picked_up") {
      return (
        <button
          onClick={handleNextStep}
          className="h-11 flex-1 rounded-xl bg-brand text-[13px] font-bold text-zinc-950 transition-all hover:brightness-110 active:scale-[0.99]"
        >
          Camino al cliente
        </button>
      );
    }
    if (order.status === "on_the_way") {
      return (
        <button
          onClick={handleNextStep}
          className="h-11 flex-1 rounded-xl bg-brand text-[13px] font-bold text-zinc-950 transition-all hover:brightness-110 active:scale-[0.99]"
        >
          Completar entrega
        </button>
      );
    }
    return null;
  })();

  return (
    <DriverLayout
      title={`Pedido #${id}`}
      subtitle={getOrderStatusMeta(order.status).label}
      backTo="/driver"
      scroll={false}
    >
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4">
        <div
          id="driver-map"
          className="relative z-0 h-40 rounded-xl border border-zinc-200 bg-zinc-200 shadow-sm overflow-hidden dark:border-white/10 dark:bg-[#121216] [&_.leaflet-control-attribution]:bg-white/85 [&_.leaflet-control-attribution]:text-zinc-600 dark:[&_.leaflet-control-attribution]:bg-[#1A1A1E]/90 dark:[&_.leaflet-control-attribution]:text-zinc-400 [&_.leaflet-control-attribution_a]:text-brand-strong"
        />

        {/* Ruta: retiro y entrega */}
        <section className="rounded-2xl border border-zinc-200/80 bg-white p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-white/10 dark:bg-[#15151A]">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Ruta del pedido
            </h2>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
              ${earningAmount} para ti
            </span>
          </div>

          <div className="mt-2.5 flex items-start gap-2.5">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand-strong dark:bg-brand/15 dark:text-brand">
              <Store className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-bold leading-tight">
                {order.commerces?.length === 1
                  ? order.commerces[0].name
                  : `${order.commerces?.length || 0} comercios`}
              </p>
              <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">{pickupLabel}</p>
            </div>
          </div>

          <div className="ml-3.5 h-3 w-px bg-zinc-200 dark:bg-white/10" />

          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400">
              <Home className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12.5px] font-bold leading-tight">Cliente</p>
                {!isTerminal && order.customerPhone && (
                  <a
                    href={`tel:${order.customerPhone}`}
                    aria-label={`Llamar al cliente ${order.customerPhone}`}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-sky-600 dark:text-sky-400"
                  >
                    <Phone className="h-3 w-3" aria-hidden="true" />
                    Llamar
                  </a>
                )}
              </div>
              <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                {order.deliveryAddress}
              </p>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-zinc-100 pt-2.5 dark:border-white/5">
            <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              {(order.items ?? []).reduce((n: number, item: any) => n + (item.quantity || 1), 0)} ítems
            </span>
            <span
              className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                order.paymentMethod === "cash"
                  ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                  : "bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-300"
              }`}
            >
              {order.paymentMethod === "cash"
                ? `Cobrar $${Number(order.total ?? 0).toFixed(2)} en efectivo`
                : "Pagado por transferencia"}
            </span>
          </div>
        </section>

        {/* Progreso horizontal */}
        <section className="rounded-2xl border border-zinc-200/80 bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-white/10 dark:bg-[#15151A]">
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Progreso
          </h2>
          <div className="flex items-start">
            {orderSteps.map((step, i) => {
              const done = i < currentStep || (i === currentStep && delivered);
              const active = i === currentStep && !delivered;
              return (
                <div key={step.key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <div className="flex w-full items-center">
                    <span
                      className={`h-0.5 flex-1 ${
                        i === 0 ? "bg-transparent" : i <= currentStep ? "bg-brand" : "bg-zinc-200 dark:bg-white/10"
                      }`}
                    />
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                        done
                          ? "bg-emerald-500 text-white"
                          : active
                            ? "bg-brand text-zinc-950"
                            : "bg-zinc-200 text-zinc-500 dark:bg-white/10 dark:text-zinc-400"
                      }`}
                    >
                      {done ? <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" /> : i + 1}
                    </span>
                    <span
                      className={`h-0.5 flex-1 ${
                        i === orderSteps.length - 1
                          ? "bg-transparent"
                          : i < currentStep
                            ? "bg-brand"
                            : "bg-zinc-200 dark:bg-white/10"
                      }`}
                    />
                  </div>
                  <span
                    className={`line-clamp-2 text-center text-[9px] leading-tight ${
                      i <= currentStep
                        ? "font-bold text-zinc-800 dark:text-zinc-100"
                        : "font-medium text-zinc-400 dark:text-zinc-500"
                    }`}
                  >
                    {["Asignado", "Retirado", "En camino", "Entregado"][i]}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Retiro por comercio */}
        {isAssigned && !allPickedUp && !delivered && !singleReadyPickup && (
          <section className="rounded-2xl border border-zinc-200/80 bg-white p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-white/10 dark:bg-[#15151A]">
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Recoger en comercios
            </h2>
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
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-zinc-100 bg-zinc-50 p-2 dark:border-white/5 dark:bg-[#101014]"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Store className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-semibold">{c.name}</p>
                        <span className={`mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-[9px] font-bold ${statusColor}`}>
                          {statusLabel}
                        </span>
                      </div>
                    </div>
                    {picked ? (
                      <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        Recogido
                      </span>
                    ) : isReady ? (
                      <button
                        onClick={() => handleMarkCommercePickup(c.id)}
                        disabled={markCommercePickupMutation.isPending}
                        aria-label={`Marcar retiro en ${c.name || "el comercio"}`}
                        className="flex h-9 shrink-0 items-center gap-1 rounded-lg bg-brand px-3 text-[11px] font-bold text-zinc-950 transition-all hover:brightness-110 active:scale-[0.97] disabled:opacity-60"
                      >
                        {markCommercePickupMutation.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                        ) : (
                          <Package className="h-3 w-3" aria-hidden="true" />
                        )}
                        Recoger
                      </button>
                    ) : (
                      <span className="shrink-0 text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
                        En preparación
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {delivered && (
          <section className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-center dark:border-emerald-500/20 dark:bg-emerald-500/10">
            <CheckCircle className="mx-auto mb-1.5 h-7 w-7 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            <p className="text-[13px] font-bold text-zinc-900 dark:text-zinc-100">Entrega completada</p>
            <p className="mt-0.5 text-[11px] text-zinc-600 dark:text-zinc-300">
              Ganancia acreditada: ${earningAmount}
            </p>
          </section>
        )}

        {order.status === "cancelled" && (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-center dark:border-rose-500/25 dark:bg-rose-500/10">
            <p className="text-[12px] font-bold text-rose-700 dark:text-rose-300">Pedido cancelado</p>
          </section>
        )}
      </div>

      {/* Acciones fijas */}
      <div className="shrink-0 border-t border-zinc-200/80 bg-white/95 px-3 py-2.5 backdrop-blur-xl dark:border-white/10 dark:bg-[#101014]/95">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(`/driver/chat/${id}`)}
            aria-label="Abrir chat del pedido"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-[#15151A] dark:text-zinc-300"
          >
            <MessageCircle className="h-4.5 w-4.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={openRoute}
            aria-label="Abrir ruta en Google Maps"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-[#15151A] dark:text-zinc-300"
          >
            <Navigation className="h-4.5 w-4.5" aria-hidden="true" />
          </button>
          {delivered ? (
            <button
              type="button"
              onClick={() => navigate("/driver/history")}
              className="h-11 flex-1 rounded-xl bg-brand text-[13px] font-bold text-zinc-950 transition-all hover:brightness-110 active:scale-[0.99]"
            >
              Ver historial
            </button>
          ) : (
            primaryAction ?? <div className="flex-1" />
          )}
        </div>
      </div>
    </DriverLayout>
  );
}
