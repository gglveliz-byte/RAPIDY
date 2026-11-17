import { useNavigate } from "react-router";
import { Clock, Loader2, Package } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useDriverSession } from "@/hooks/useDeliveryData";
import { useDriverEvents } from "@/hooks/useOrderEvents";
import { getOrderStatusMeta } from "@contracts/orderStatus";
import DriverLayout from "@/components/DriverLayout";

export default function DriverHistory() {
  const navigate = useNavigate();
  const driverSession = useDriverSession();
  const driverId = driverSession?.id ?? null;
  const utils = trpc.useUtils();
  useDriverEvents(driverId || undefined, utils);

  const { data: history, isLoading, isError, error, refetch } = trpc.driver.getOrderHistory.useQuery(
    { limit: 50 },
    { enabled: !!driverId },
  );

  const count = history?.length ?? 0;

  return (
    <DriverLayout
      title="Historial"
      subtitle={
        count > 0
          ? `${count} ${count === 1 ? "pedido registrado" : "pedidos registrados"}`
          : "Tus pedidos entregados aparecen aquí"
      }
    >
      <div className="space-y-2.5 px-4 py-4">
        {isLoading ? (
          <div role="status" aria-live="polite" className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-brand" aria-hidden="true" />
            <span className="sr-only">Cargando historial…</span>
          </div>
        ) : isError ? (
          <div className="rounded-2xl border border-red-200 bg-white p-5 text-center dark:border-red-500/25 dark:bg-[#15151A]">
            <p className="text-[13px] font-semibold text-red-700 dark:text-red-400">
              No se pudo cargar el historial
            </p>
            <p className="mt-1 text-[11px] text-red-600/80 dark:text-red-300/80">{error.message}</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-3 min-h-10 rounded-lg bg-red-600 px-4 text-[11px] font-bold text-white transition-colors hover:bg-red-700"
            >
              Reintentar
            </button>
          </div>
        ) : count > 0 ? (
          history!.map((order: any) => {
            const meta = getOrderStatusMeta(order.status);
            const cancelled = order.status === "cancelled";
            return (
              <button
                key={order.id}
                type="button"
                onClick={() => navigate(`/driver/order/${order.id}`)}
                className="w-full rounded-2xl border border-zinc-200/80 bg-white p-3.5 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all hover:border-brand/40 active:scale-[0.99] dark:border-white/10 dark:bg-[#15151A]"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                      <Package className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="truncate text-[13px] font-bold">Pedido #{order.id}</span>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${meta.badgeClass} ${
                      cancelled
                        ? "dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-300"
                        : "dark:border-brand/30 dark:bg-brand/15 dark:text-brand"
                    }`}
                  >
                    {meta.shortLabel}
                  </span>
                </div>

                <p className="mt-1.5 truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                  {order.deliveryAddress}
                </p>

                <div className="mt-2 flex items-center justify-between gap-2 border-t border-zinc-100 pt-2 dark:border-white/5">
                  <span className="flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    {new Date(order.deliveredAt ?? order.updatedAt).toLocaleDateString("es-ES")}
                  </span>
                  <span className="text-[13px] font-bold text-brand-strong dark:text-brand">
                    ${Number(order.earningAmount || 0).toFixed(2)}
                  </span>
                </div>

                {cancelled && order.cancellationReason && (
                  <p className="mt-1.5 truncate text-[10px] text-rose-600 dark:text-rose-400">
                    {order.cancellationReason}
                  </p>
                )}
              </button>
            );
          })
        ) : (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/70 px-5 py-10 text-center dark:border-white/15 dark:bg-white/[0.03]">
            <span className="mx-auto mb-2.5 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-white/10">
              <Package className="h-5 w-5 text-zinc-400 dark:text-zinc-500" aria-hidden="true" />
            </span>
            <p className="text-[13px] font-semibold text-zinc-700 dark:text-zinc-200">
              No hay pedidos en el historial
            </p>
            <p className="mx-auto mt-0.5 max-w-[230px] text-[11px] text-zinc-500 dark:text-zinc-400">
              Cuando completes una entrega la verás listada aquí.
            </p>
          </div>
        )}
      </div>
    </DriverLayout>
  );
}
