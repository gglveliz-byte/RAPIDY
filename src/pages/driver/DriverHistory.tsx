import { useNavigate } from "react-router";
import type { ReactElement } from "react";
import { ArrowLeft, Package, CheckCircle, XCircle, Clock, List, BarChart3, User } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useDriverSession } from "@/hooks/useDeliveryData";

export default function DriverHistory() {
  const navigate = useNavigate();
  const driverSession = useDriverSession();
  const driverId = driverSession?.id ?? null;

  const { data: history, isLoading } = trpc.driver.getOrderHistory.useQuery(
    { id: driverId! },
    { enabled: !!driverId }
  );

  const statusLabel: Record<string, string> = {
    delivered: "Entregado",
    cancelled: "Cancelado",
  };

  const statusIcon: Record<string, ReactElement> = {
    delivered: <CheckCircle className="w-4 h-4 text-green-600" />,
    cancelled: <XCircle className="w-4 h-4 text-red-500" />,
  };

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
        ) : history && history.length > 0 ? (
          history.map((order: any) => (
            <button
              key={order.id}
              onClick={() => navigate(`/driver/order/${order.id}`)}
              className="w-full bg-white rounded-xl card-shadow p-4 text-left"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-gray-400" />
                  <span className="font-medium text-gray-800">Pedido #{order.id}</span>
                </div>
                <div className="flex items-center gap-1">
                  {statusIcon[order.status]}
                  <span className={`text-xs font-medium ${order.status === "delivered" ? "text-green-600" : "text-red-500"}`}>
                    {statusLabel[order.status]}
                  </span>
                </div>
              </div>
              <p className="text-xs text-gray-500 truncate mb-1">{order.deliveryAddress}</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <Clock className="w-3 h-3" />
                  <span>{new Date(order.updatedAt).toLocaleDateString("es-ES")}</span>
                </div>
                <span className="text-sm font-semibold text-[#2E7D32]">${order.deliveryFee}</span>
              </div>
            </button>
          ))
        ) : (
          <div className="bg-white rounded-xl p-6 text-center">
            <Package className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">No hay entregas anteriores</p>
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
        <button onClick={() => navigate("/driver/history")} className="bottom-nav-item active">
          <Clock className="w-5 h-5" />
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
