import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import {
  AlertCircle,
  BarChart3,
  Clock,
  List,
  Loader2,
  MapPin,
  Navigation,
  Package,
  Power,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useDriverSession } from "@/hooks/useDeliveryData";
import { useDriverEvents } from "@/hooks/useOrderEvents";
import { useDriverNotification } from "@/hooks/useDriverNotification";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getOrderStatusMeta } from "@contracts/orderStatus";

function getDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function guayaquilDateKey(value: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export default function DriverHome() {
  const navigate = useNavigate();
  const driverSession = useDriverSession();
  const driverId = driverSession?.id ?? null;

  const utils = trpc.useUtils();
  const { notifyNewOrder } = useDriverNotification();
  useDriverEvents(driverId || undefined, utils, notifyNewOrder);

  const profileQuery = trpc.driver.getById.useQuery(
    { id: driverId! },
    { enabled: !!driverId },
  );
  const availableQuery = trpc.order.getAvailableForDriver.useQuery(undefined, {
    enabled: !!driverId,
    refetchInterval: 30_000,
  });
  const activeQuery = trpc.driver.getActiveOrders.useQuery(
    { id: driverId! },
    { enabled: !!driverId, refetchInterval: 30_000 },
  );
  const earningsQuery = trpc.driver.getEarnings.useQuery(
    { id: driverId! },
    { enabled: !!driverId },
  );

  const driverProfile = profileQuery.data;
  const isOnline = driverProfile?.status === "online";
  const isBusy = driverProfile?.status === "busy";
  const isTrackable = isOnline || isBusy;
  const activeOrder = activeQuery.data?.[0] ?? null;

  const acceptOrderMutation = trpc.driver.acceptOrder.useMutation({
    onSuccess: () => {
      utils.order.getAvailableForDriver.invalidate();
      utils.driver.getActiveOrders.invalidate({ id: driverId! });
      utils.driver.getById.invalidate({ id: driverId! });
    },
    onError: (error) => toast.error(error.message || "No se pudo aceptar el pedido."),
  });

  const updateLocationMutation = trpc.driver.updateLocation.useMutation();
  const updateStatusMutation = trpc.driver.updateStatus.useMutation({
    onSuccess: () => {
      utils.driver.getById.invalidate({ id: driverId! });
      utils.driver.getProfile.invalidate({ id: driverId! });
      utils.order.getAvailableForDriver.invalidate();
    },
    onError: (error) => toast.error(error.message || "No se pudo cambiar tu estado."),
  });

  const lastUpdateRef = useRef(0);
  const THROTTLE_MS = 15_000;

  // Ubicación solo mientras el driver está online. No se rastrea offline.
  useEffect(() => {
    if (!driverId || !isTrackable) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastUpdateRef.current < THROTTLE_MS) return;
        lastUpdateRef.current = now;
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
  }, [driverId, isTrackable, updateLocationMutation]);

  const earnings = earningsQuery.data ?? [];
  const todayKey = guayaquilDateKey(new Date());
  const todayEarnings = earnings
    .filter((entry: any) => guayaquilDateKey(entry.createdAt ?? entry.date) === todayKey)
    .reduce((sum: number, entry: any) => sum + Number(entry.amount), 0);
  const totalDeliveries = earnings.length;

  const handleAcceptOrder = async (orderId: number) => {
    if (!driverId || activeOrder) return;
    try {
      await acceptOrderMutation.mutateAsync({ orderId });
      navigate(`/driver/order/${orderId}`);
    } catch {
      // El toast lo muestra la mutación.
    }
  };

  const handleToggleOnline = async () => {
    if (!driverId || !driverProfile || isBusy) return;
    const next = isOnline ? "offline" : "online";
    try {
      await updateStatusMutation.mutateAsync({ id: driverId, status: next });
      toast.success(next === "online" ? "Estás en línea." : "Estás desconectado.");
    } catch {
      // El toast lo muestra la mutación.
    }
  };

  return (
    <div className="mobile-container bg-[#F7F7FA] dark:bg-[#0A0A0D] min-h-screen pb-24">
      <div className="bg-gradient-to-br from-brand to-brand-strong px-4 pt-safe pb-6">
        <div className="flex items-center justify-between pt-4 mb-4">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-white">Pedidos disponibles</h1>
            <p className="text-white/80 text-sm mt-0.5">
              {profileQuery.isLoading ? (
                "Verificando estado..."
              ) : isBusy ? (
                "Ocupado · pedido activo"
              ) : isOnline ? (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-300 rounded-full animate-pulse" />
                  En línea
                </span>
              ) : (
                "Desconectado"
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ThemeToggle
              size="lg"
              className="!bg-white/20 !border-white/20 !text-white hover:!bg-white/30"
            />
            <button
              onClick={handleToggleOnline}
              disabled={!driverProfile || isBusy || updateStatusMutation.isPending}
              className="min-w-11 min-h-11 px-3 bg-white/20 rounded-full flex items-center justify-center gap-1.5 text-white text-xs font-bold disabled:opacity-50"
              aria-label={isOnline ? "Desconectarse" : "Conectarse"}
              aria-pressed={isOnline}
            >
              <Power className="w-4 h-4" />
              {isOnline ? "Off" : "On"}
            </button>
            <button
              onClick={() => navigate("/driver/profile")}
              className="w-11 h-11 bg-white/20 rounded-full flex items-center justify-center"
              aria-label="Perfil del repartidor"
            >
              <User className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        <div className="flex gap-3">
          <div className="flex-1 bg-white/20 backdrop-blur-sm rounded-xl p-3">
            <p className="text-zinc-950/80 text-xs">Hoy</p>
            <p className="text-zinc-950 font-bold text-lg">${todayEarnings.toFixed(2)}</p>
          </div>
          <div className="flex-1 bg-white/20 backdrop-blur-sm rounded-xl p-3">
            <p className="text-zinc-950/80 text-xs">Entregas</p>
            <p className="text-zinc-950 font-bold text-lg">{totalDeliveries}</p>
          </div>
          <div className="flex-1 bg-white/20 backdrop-blur-sm rounded-xl p-3">
            <p className="text-zinc-950/80 text-xs">Rating</p>
            <p className="text-zinc-950 font-bold text-lg">
              {driverProfile?.rating?.toString() || "—"}
            </p>
          </div>
        </div>
      </div>

      {activeOrder && (
        <div className="px-4 mt-4">
          <button
            type="button"
            onClick={() => navigate(`/driver/order/${activeOrder.id}`)}
            className="w-full text-left bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-2xl p-4 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-amber-900 dark:text-amber-200">
                  Pedido activo #{activeOrder.id}
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-300 truncate">
                  {getOrderStatusMeta(activeOrder.status).label} · continúa la entrega
                </p>
              </div>
            </div>
            <span className="text-xs font-black text-amber-800 dark:text-amber-200 shrink-0">
              Continuar →
            </span>
          </button>
        </div>
      )}

      <div className="px-4 mt-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Cerca de ti
          </h2>
          <button
            type="button"
            onClick={() => availableQuery.refetch()}
            className="inline-flex items-center min-h-11 px-2 -mr-2 text-xs font-bold text-brand-strong"
          >
            Actualizar
          </button>
        </div>

        {availableQuery.isLoading ? (
          <div role="status" aria-live="polite" className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-brand" aria-hidden="true" />
            <span className="sr-only">Cargando pedidos…</span>
          </div>
        ) : availableQuery.isError ? (
          <div className="bg-white dark:bg-[#1A1A1E] rounded-xl p-5 text-center border border-red-200 dark:border-red-900/50">
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">
              No se pudieron cargar los pedidos
            </p>
            <p className="text-xs text-red-600/80 dark:text-red-300/80 mt-1">
              {availableQuery.error.message}
            </p>
            <button
              type="button"
              onClick={() => availableQuery.refetch()}
              className="mt-3 min-h-11 px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-bold"
            >
              Reintentar
            </button>
          </div>
        ) : availableQuery.data && availableQuery.data.length > 0 ? (
          <div className="space-y-3">
            {availableQuery.data.map((order: any) => {
              const distanceKm =
                order.commerceLat &&
                order.commerceLng &&
                driverProfile?.currentLat &&
                driverProfile?.currentLng
                  ? getDistance(
                      Number(driverProfile.currentLat),
                      Number(driverProfile.currentLng),
                      Number(order.commerceLat),
                      Number(order.commerceLng),
                    )
                  : null;
              const earning = Number(order.estimatedEarning ?? 0);
              const commerceLabel =
                order.commerceCount > 1
                  ? `${order.commerceCount} comercios`
                  : order.commerceName || "Comercio";

              return (
                <div
                  key={order.id}
                  className="bg-white dark:bg-[#1A1A1E] rounded-xl card-shadow dark:shadow-none p-4 border border-zinc-100 dark:border-white/10"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="min-w-0">
                      <h3 className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
                        {commerceLabel}
                      </h3>
                      <div className="flex items-center gap-1 mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                        <MapPin className="w-3 h-3" />
                        <span>{distanceKm !== null ? `${distanceKm.toFixed(1)} km` : "Distancia no disponible"}</span>
                        {distanceKm !== null && (
                          <>
                            <span className="mx-1">|</span>
                            <Clock className="w-3 h-3" />
                            <span>~{Math.ceil(distanceKm * 3)} min</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-brand-strong">
                        ${earning.toFixed(2)}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">ganancia estimada</p>
                    </div>
                  </div>

                  <div className="space-y-1.5 mb-3">
                    <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                      <div className="w-2 h-2 bg-brand rounded-full flex-shrink-0" />
                      <Navigation className="w-3 h-3 text-zinc-400 dark:text-zinc-500" />
                      <span className="truncate">
                        Recojo en {order.commerceName || "comercio"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                      <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />
                      <MapPin className="w-3 h-3 text-zinc-400 dark:text-zinc-500" />
                      <span className="truncate">
                        {order.commerceAddress || "Dirección del local no disponible"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-white/5 gap-2">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                      {order.itemCount ?? 0} items | Total: ${order.total} |{" "}
                      {order.paymentMethod === "cash" ? "💵 Efectivo" : "💳 Transferencia"}
                    </span>
                    <button
                      onClick={() => handleAcceptOrder(order.id)}
                      disabled={acceptOrderMutation.isPending || !!activeOrder || !isOnline}
                      className="h-11 px-5 bg-brand text-zinc-950 text-sm font-semibold rounded-lg hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 shrink-0"
                    >
                      {acceptOrderMutation.isPending ? "..." : "Aceptar"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white dark:bg-[#1A1A1E] rounded-xl p-6 text-center border border-zinc-100 dark:border-white/10">
            <Package className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
            <p className="text-zinc-500 dark:text-zinc-400 text-sm">
              No hay pedidos disponibles
            </p>
            {!isOnline && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                Actívate para recibir pedidos.
              </p>
            )}
          </div>
        )}
      </div>

      <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-[#111115] border-t border-zinc-100 dark:border-white/10 px-4 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] flex justify-around items-center z-50" style={{ maxWidth: "480px", margin: "0 auto" }}>
        <button onClick={() => navigate("/driver")} className="bottom-nav-item active min-h-11 min-w-11" aria-current="page">
          <List className="w-5 h-5" />
          <span className="text-[10px]">Pedidos</span>
        </button>
        <button onClick={() => navigate("/driver/earnings")} className="bottom-nav-item min-h-11 min-w-11">
          <BarChart3 className="w-5 h-5" />
          <span className="text-[10px]">Ganancias</span>
        </button>
        <button onClick={() => navigate("/driver/history")} className="bottom-nav-item min-h-11 min-w-11">
          <Package className="w-5 h-5" />
          <span className="text-[10px]">Historial</span>
        </button>
        <button onClick={() => navigate("/driver/profile")} className="bottom-nav-item min-h-11 min-w-11">
          <User className="w-5 h-5" />
          <span className="text-[10px]">Perfil</span>
        </button>
      </nav>
    </div>
  );
}