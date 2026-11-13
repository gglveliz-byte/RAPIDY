import { useNavigate } from "react-router";
import { ArrowLeft, Package, Clock, List, BarChart3, User } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useDriverSession } from "@/hooks/useDeliveryData";
import { useDriverEvents } from "@/hooks/useOrderEvents";
import { getOrderStatusMeta } from "@contracts/orderStatus";

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
    <div className="mobile-container bg-gray-50 min-h-screen pb-20">
      {/* Header */}
      <div className="bg-[#2E7D32] px-4 pt-4 pb-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="touch-target">
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <h1 className="text-xl font-bold text-white">Historial</h1>
        </div>
      </div>

      {/* History List */}
      <div className="px-4 mt-4 space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-[#2E7D32] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : isError ? (
          <div className="bg-white dark:bg-[#16161B] rounded-xl p-6 text-center border border-red-200 dark:border-red-900/50">
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">
              No se pudo cargar el historial
            </p>
            <p className="text-xs text-red-600/80 dark:text-red-300/80 mt-1">{error.message}</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-3 px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-bold"
            >
              Reintentar
            </button>
          </div>
        ) : history && history.length > 0 ? (
          history.map((order: any) => {
            const meta = getOrderStatusMeta(order.status);
            return (
              <button
                key={order.id}
                onClick={() => navigate(`/driver/order/${order.id}`)}
                className="w-full bg-white dark:bg-[#16161B] rounded-xl card-shadow p-4 text-left"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-gray-400" />
                    <span className="font-medium text-gray-800 dark:text-zinc-100">Pedido #{order.id}</span>
                  </div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold border ${meta.badgeClass}`}>
                    {meta.shortLabel}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-zinc-400 truncate mb-1">{order.deliveryAddress}</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-xs text-gray-400">
                    <Clock className="w-3 h-3" />
                    <span>
                      {new Date(order.deliveredAt ?? order.updatedAt).toLocaleDateString("es-ES")}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-[#2E7D32] dark:text-emerald-400">
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
          <div className="bg-white rounded-xl p-6 text-center">
            <Package className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">No hay pedidos en el historial</p>
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-2 flex justify-around items-center z-50" style={{ maxWidth: "480px", margin: "0 auto" }}>
        <button onClick={() => navigate("/driver")} className="bottom-nav-item">
          <List className="w-5 h-5" />
          <span className="text-[10px]">Pedidos</span>
        </button>
        <button onClick={() => navigate("/driver/earnings")} className="bottom-nav-item">
          <BarChart3 className="w-5 h-5" />
          <span className="text-[10px]">Ganancias</span>
        </button>
        <button onClick={() => navigate("/driver/history")} className="bottom-nav-item active min-h-11">
          <Package className="w-5 h-5" />
          <span className="text-[10px]">Historial</span>
        </button>
        <button onClick={() => navigate("/driver/profile")} className="bottom-nav-item">
          <User className="w-5 h-5" />
          <span className="text-[10px]">Perfil</span>
        </button>
      </nav>
    </div>
  );
}
