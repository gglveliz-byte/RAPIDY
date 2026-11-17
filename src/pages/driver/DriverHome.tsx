import { useEffect, useRef, type ReactNode } from "react";
import { useNavigate } from "react-router";
import {
  AlertCircle,
  ArrowRight,
  Bike,
  Clock,
  Loader2,
  MapPin,
  Navigation,
  Package,
  Power,
  RefreshCw,
  Star,
  Store,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useDriverSession } from "@/hooks/useDeliveryData";
import { useDriverEvents } from "@/hooks/useOrderEvents";
import { useDriverNotification } from "@/hooks/useDriverNotification";
import { ThemeToggle } from "@/components/ThemeToggle";
import DriverLayout from "@/components/DriverLayout";
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

function StatChip({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/20 bg-white/15 px-3 py-2 backdrop-blur-sm">
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-white/75">
        {icon}
        {label}
      </div>
      <p className="mt-0.5 truncate text-[15px] font-black leading-tight text-white">{value}</p>
    </div>
  );
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

  const statusLabel = profileQuery.isLoading
    ? "Verificando estado…"
    : isBusy
      ? "Ocupado · pedido en curso"
      : isOnline
        ? "En línea · recibiendo pedidos"
        : "Desconectado · no recibes pedidos";

  return (
    <DriverLayout
      title="Pedidos"
      subtitle={
        <span className="inline-flex items-center gap-1.5">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isBusy
                ? "bg-amber-300"
                : isOnline
                  ? "animate-pulse bg-emerald-300"
                  : "bg-white/50"
            }`}
          />
          {statusLabel}
        </span>
      }
      headerRight={
        <ThemeToggle
          size="lg"
          className="!border-white/25 !bg-white/15 !text-white hover:!bg-white/25"
        />
      }
      headerExtra={
        <>
          <button
            type="button"
            onClick={handleToggleOnline}
            disabled={!driverProfile || isBusy || updateStatusMutation.isPending}
            aria-label={isOnline ? "Desconectarse" : "Conectarse"}
            aria-pressed={isOnline}
            className="mt-3 flex w-full items-center justify-between gap-3 rounded-2xl border border-white/20 bg-white/15 px-3.5 py-2.5 text-left backdrop-blur-sm transition-colors hover:bg-white/20 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                  isOnline ? "bg-emerald-400/25 text-emerald-50" : "bg-white/15 text-white/80"
                }`}
              >
                {updateStatusMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Power className="h-4 w-4" aria-hidden="true" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-bold leading-tight">
                  {isBusy ? "Ocupado" : isOnline ? "Disponible" : "Desconectado"}
                </span>
                <span className="block truncate text-[11px] text-white/75">
                  {isBusy ? "Termina el pedido activo" : isOnline ? "Toca para desconectarte" : "Toca para recibir pedidos"}
                </span>
              </span>
            </span>
            <span className="shrink-0 rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold uppercase tracking-wide">
              {isOnline ? "Off" : "On"}
            </span>
          </button>

          <div className="mt-2.5 grid grid-cols-3 gap-2">
            <StatChip label="Hoy" value={`$${todayEarnings.toFixed(2)}`} />
            <StatChip
              label="Entregas"
              value={String(totalDeliveries)}
              icon={<Bike className="h-3 w-3" aria-hidden="true" />}
            />
            <StatChip
              label="Rating"
              value={driverProfile?.rating ? Number(driverProfile.rating).toFixed(1) : "—"}
              icon={<Star className="h-3 w-3" aria-hidden="true" />}
            />
          </div>
        </>
      }
    >
      <div className="space-y-3 px-4 py-4">
        {activeOrder && (
          <button
            type="button"
            onClick={() => navigate(`/driver/order/${activeOrder.id}`)}
            className="flex w-full items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-transform active:scale-[0.99] dark:border-amber-500/25 dark:bg-amber-500/10"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-300">
                <AlertCircle className="h-4.5 w-4.5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-bold text-amber-900 dark:text-amber-100">
                  Pedido activo #{activeOrder.id}
                </span>
                <span className="block truncate text-[11px] text-amber-700 dark:text-amber-300">
                  {getOrderStatusMeta(activeOrder.status).label}
                </span>
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1 text-[11px] font-black uppercase tracking-wide text-amber-800 dark:text-amber-200">
              Continuar
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          </button>
        )}

        <div className="flex items-center justify-between">
          <h2 className="text-[12px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Cerca de ti
          </h2>
          <button
            type="button"
            onClick={() => availableQuery.refetch()}
            className="-mr-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-[11px] font-bold text-brand-strong transition-colors hover:bg-brand/10 dark:text-brand"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${availableQuery.isFetching ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            Actualizar
          </button>
        </div>

        {availableQuery.isLoading ? (
          <div role="status" aria-live="polite" className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-brand" aria-hidden="true" />
            <span className="sr-only">Cargando pedidos…</span>
          </div>
        ) : availableQuery.isError ? (
          <div className="rounded-2xl border border-red-200 bg-white p-5 text-center dark:border-red-500/25 dark:bg-[#15151A]">
            <p className="text-[13px] font-semibold text-red-700 dark:text-red-400">
              No se pudieron cargar los pedidos
            </p>
            <p className="mt-1 text-[11px] text-red-600/80 dark:text-red-300/80">
              {availableQuery.error.message}
            </p>
            <button
              type="button"
              onClick={() => availableQuery.refetch()}
              className="mt-3 min-h-10 rounded-lg bg-red-600 px-4 text-[11px] font-bold text-white"
            >
              Reintentar
            </button>
          </div>
        ) : availableQuery.data && availableQuery.data.length > 0 ? (
          <div className="space-y-2.5">
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
              const disabled = acceptOrderMutation.isPending || !!activeOrder || !isOnline;

              return (
                <article
                  key={order.id}
                  className="rounded-2xl border border-zinc-200/80 bg-white p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-white/10 dark:bg-[#15151A]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand-strong dark:bg-brand/15 dark:text-brand">
                        <Store className="h-4.5 w-4.5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="truncate text-[13.5px] font-bold leading-tight">
                          {commerceLabel}
                        </h3>
                        <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                          <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                          {distanceKm !== null ? `${distanceKm.toFixed(1)} km` : "Distancia n/d"}
                          {distanceKm !== null && (
                            <>
                              <span className="text-zinc-300 dark:text-zinc-600">·</span>
                              <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />~
                              {Math.ceil(distanceKm * 3)} min
                            </>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-[17px] font-black leading-none text-brand-strong dark:text-brand">
                        ${earning.toFixed(2)}
                      </p>
                      <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                        Ganancia
                      </p>
                    </div>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
                      {order.itemCount ?? 0} {order.itemCount === 1 ? "ítem" : "ítems"}
                    </span>
                    <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
                      Total ${Number(order.total ?? 0).toFixed(2)}
                    </span>
                    <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
                      {order.paymentMethod === "cash" ? "Efectivo" : "Transferencia"}
                    </span>
                  </div>

                  <div className="mt-2.5 flex items-center gap-2 border-t border-zinc-100 pt-2.5 dark:border-white/5">
                    <p className="flex min-w-0 flex-1 items-center gap-1 truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                      <Navigation className="h-3 w-3 shrink-0" aria-hidden="true" />
                      {order.commerceAddress || "Dirección no disponible"}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleAcceptOrder(order.id)}
                      disabled={disabled}
                      className="h-9 shrink-0 rounded-lg bg-brand px-4 text-[12px] font-bold text-zinc-950 transition-all hover:brightness-110 active:scale-95 disabled:opacity-50"
                    >
                      {acceptOrderMutation.isPending ? "..." : "Aceptar"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/70 px-5 py-9 text-center dark:border-white/15 dark:bg-white/[0.03]">
            <span className="mx-auto mb-2.5 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-white/10">
              <Package className="h-5 w-5 text-zinc-400 dark:text-zinc-500" aria-hidden="true" />
            </span>
            <p className="text-[13px] font-semibold text-zinc-700 dark:text-zinc-200">
              No hay pedidos disponibles
            </p>
            <p className="mx-auto mt-0.5 max-w-[240px] text-[11px] text-zinc-500 dark:text-zinc-400">
              {isOnline
                ? "Te avisaremos en cuanto entre un pedido cerca de ti."
                : "Conéctate para empezar a recibir pedidos."}
            </p>
            {!isOnline && (
              <button
                type="button"
                onClick={handleToggleOnline}
                disabled={!driverProfile || updateStatusMutation.isPending}
                className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-brand px-4 text-[11px] font-bold text-zinc-950 disabled:opacity-50"
              >
                <Power className="h-3.5 w-3.5" aria-hidden="true" />
                Conectarme
              </button>
            )}
          </div>
        )}
      </div>
    </DriverLayout>
  );
}
