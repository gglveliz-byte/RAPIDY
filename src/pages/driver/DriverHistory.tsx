import { useNavigate } from "react-router";
import { ArrowLeft, Package, Clock, List, BarChart3, User } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useDriverSession } from "@/hooks/useDeliveryData";
import { useDriverEvents } from "@/hooks/useOrderEvents";
import { getOrderStatusMeta } from "@contracts/orderStatus";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function DriverHistory() {
  const navigate = useNavigate();
  const driverSession = useDriverSession();
  const driverId = driverSession?.id ?? null;
  const utils = trpc.useUtils();
  useDriverEvents(driverId || undefined, utils);

  const { data: history, isLoading, isError, error, refetch } = trpc.driver.getOrderHistory.useQuery(
    { limit: 50 },
    { enabled: !!driverId }
  );

  return (
    <div className="mobile-container bg-[#F7F7FA] dark:bg-[#0A0A0D] min-h-screen pb-20 text-zinc-900 dark:text-zinc-100 selection:bg-brand/20">
      {/* Header */}
      <div className="bg-gradient-to-br from-brand to-brand-strong px-4 pt-safe pb-4 shadow-md shadow-brand/20">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="touch-target -ml-2 flex items-center justify-center text-white"
              aria-label="Volver"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <h1 className="text-xl font-bold text-white">Historial</h1>
          </div>
          <ThemeToggle
            size="lg"
            className="!bg-white/15 !border-white/20 !text-white hover:!bg-white/25 hover:!text-white"
          />
        </div>
      </div>

      {/* History List */}
      <div className="px-4 mt-4 space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          </div>
        ) : isError ? (
          <div className="bg-white dark:bg-[#1A1A1E] rounded-xl p-6 text-center border border-red-200 dark:border-red-900/50 card-shadow dark:shadow-none">
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">
              No se pudo cargar el historial
            </p>
            <p className="text-xs text-red-600/80 dark:text-red-300/80 mt-1">{error.message}</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-3 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 dark:hover:bg-red-500 text-white text-xs font-bold transition-colors"
            >
              Reintentar
            </button>
          </div>
        ) : history && history.length > 0 ? (
          history.map((order: any) => {
            const meta = getOrderStatusMeta(order.status);
            const badgeDark =
              order.status === "cancelled"
                ? "dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30"
                : "dark:bg-brand/15 dark:text-brand dark:border-brand/30";
            return (
              <button
                key={order.id}
                onClick={() => navigate(`/driver/order/${order.id}`)}
                className="w-full bg-white dark:bg-[#1A1A1E] rounded-xl card-shadow dark:shadow-none border border-zinc-100 dark:border-white/10 p-4 text-left transition-all hover:border-brand/30 dark:hover:border-brand/40 active:scale-[0.99]"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      Pedido #{order.id}
                    </span>
                  </div>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full font-bold border ${meta.badgeClass} ${badgeDark}`}
                  >
                    {meta.shortLabel}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mb-1">
                  {order.deliveryAddress}
                </p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                    <Clock className="w-3 h-3" />
                    <span>
                      {new Date(order.deliveredAt ?? order.updatedAt).toLocaleDateString("es-ES")}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-brand">
                    ${Number(order.earningAmount || 0).toFixed(2)}
                  </span>
                </div>
                {order.status === "cancelled" && order.cancellationReason && (
                  <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1 truncate">
                    {order.cancellationReason}
                  </p>
                )}
              </button>
            );
          })
        ) : (
          <div className="bg-white dark:bg-[#1A1A1E] rounded-xl p-6 text-center border border-zinc-100 dark:border-white/10 card-shadow dark:shadow-none">
            <Package className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
            <p className="text-zinc-500 dark:text-zinc-400 text-sm">
              No hay pedidos en el historial
            </p>
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <nav
        className="fixed bottom-0 left-0 right-0 bg-white dark:bg-[#111115] border-t border-zinc-100 dark:border-white/10 px-4 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] flex justify-around items-center z-50"
        style={{ maxWidth: "480px", margin: "0 auto" }}
      >
        <button
          onClick={() => navigate("/driver")}
          className="bottom-nav-item min-h-11 !text-zinc-400 dark:!text-zinc-500"
        >
          <List className="w-5 h-5" />
          <span className="text-[10px]">Pedidos</span>
        </button>
        <button
          onClick={() => navigate("/driver/earnings")}
          className="bottom-nav-item min-h-11 !text-zinc-400 dark:!text-zinc-500"
        >
          <BarChart3 className="w-5 h-5" />
          <span className="text-[10px]">Ganancias</span>
        </button>
        <button
          onClick={() => navigate("/driver/history")}
          className="bottom-nav-item active min-h-11"
          aria-current="page"
        >
          <Package className="w-5 h-5" />
          <span className="text-[10px]">Historial</span>
        </button>
        <button
          onClick={() => navigate("/driver/profile")}
          className="bottom-nav-item min-h-11 !text-zinc-400 dark:!text-zinc-500"
        >
          <User className="w-5 h-5" />
          <span className="text-[10px]">Perfil</span>
        </button>
      </nav>
    </div>
  );
}
