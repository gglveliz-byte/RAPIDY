import { useNavigate } from "react-router";
import { useEffect, useState } from "react";
import {
  ShoppingBag, Package, BarChart3,
  TrendingUp, ChevronRight, DollarSign,
  Star, Plus, Store, Clock, ArrowRight,
  Power
} from "lucide-react";
import {
  useMerchantCommerceId,
  useProductsByCommerce,
  useCommerceStats,
  useCommerce,
  useToggleCommerceStatus,
  useCommerceOrders,
} from "@/hooks/useDeliveryData";
import CommerceLayout from "@/components/CommerceLayout";

export default function CommerceDashboard() {
  const navigate = useNavigate();
  const [commerceName, setCommerceName] = useState("Mi comercio");
  const { commerceId } = useMerchantCommerceId();
  const { data: products = [] } = useProductsByCommerce(commerceId || 0);
  const { data: stats } = useCommerceStats(commerceId || 0);
  const { data: commerce } = useCommerce(commerceId || 0);
  const { data: orders = [] } = useCommerceOrders(commerceId || 0);
  const toggleCommerceStatus = useToggleCommerceStatus(commerceId || 0);
  const [togglingStatus, setTogglingStatus] = useState(false);

  useEffect(() => {
    try {
      const storedUser = localStorage.getItem("merchant_user");
      const merchantUser = storedUser ? JSON.parse(storedUser) : null;
      if (merchantUser?.name) setCommerceName(merchantUser.name);
    } catch {}
  }, []);

  const handleToggleStore = async () => {
    if (!commerceId) return;
    setTogglingStatus(true);
    try {
      await toggleCommerceStatus.mutateAsync();
    } catch (err) {
      console.error(err);
    } finally {
      setTogglingStatus(false);
    }
  };

  const isOpen = commerce?.isOpen === "open";
  const featuredCount = products.filter((p: any) => p.isFeatured === "yes").length;
  const availableCount = products.filter((p: any) => p.isAvailable === "yes").length;
  const recentOrders = (orders || []).slice(0, 3);

  return (
    <CommerceLayout>
      <div className="p-2.5 min-[360px]:p-4 lg:p-6 max-w-6xl mx-auto space-y-3 min-[360px]:space-y-4">
        
        {/* Welcome & Store Status Banner */}
        <div className="bg-gradient-to-br from-emerald-800 to-emerald-950 text-white rounded-2xl p-3 min-[360px]:p-5 shadow-lg shadow-emerald-950/10 flex flex-col min-[480px]:flex-row min-[480px]:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <span className="text-[10px] min-[360px]:text-xs text-emerald-300 font-semibold uppercase tracking-wider">
              Panel de Control
            </span>
            <h1 className="text-base min-[360px]:text-xl font-extrabold truncate">
              {commerceName}
            </h1>
            <p className="text-[11px] min-[360px]:text-xs text-emerald-100/80">
              Administra tu catálogo, pedidos y métricas en tiempo real.
            </p>
          </div>

          {/* Quick Open/Close Switch */}
          <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md rounded-xl p-1.5 self-start min-[480px]:self-center border border-white/15">
            <div className="flex items-center gap-1.5 px-2">
              <span className={`w-2 h-2 rounded-full ${isOpen ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`} />
              <span className="text-xs font-bold">
                {isOpen ? "Tienda Abierta" : "Tienda Cerrada"}
              </span>
            </div>
            <button
              type="button"
              onClick={handleToggleStore}
              disabled={togglingStatus}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all active:scale-95 flex items-center gap-1 ${
                isOpen
                  ? "bg-red-500 hover:bg-red-600 text-white"
                  : "bg-emerald-500 hover:bg-emerald-600 text-white"
              }`}
            >
              <Power className="w-3 h-3" />
              {isOpen ? "Cerrar" : "Abrir"}
            </button>
          </div>
        </div>

        {/* Metrics Grid (Fluid 1 column on <340px, 2 columns on 340px+, 4 on desktop) */}
        <div className="grid grid-cols-1 min-[340px]:grid-cols-2 lg:grid-cols-4 gap-2 min-[360px]:gap-3">
          
          {/* Card: Total Sales */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-3 min-[360px]:p-4 shadow-2xs hover:shadow-xs transition-shadow">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] min-[360px]:text-xs font-bold text-slate-400 uppercase tracking-wider">
                Ventas Totales
              </span>
              <div className="w-7 h-7 min-[360px]:w-8 min-[360px]:h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <p className="text-lg min-[360px]:text-2xl font-black text-slate-800 tracking-tight">
              ${stats?.totalSales ? stats.totalSales.toFixed(2) : "0.00"}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5 truncate">
              Ticket prom: ${stats?.avgTicket ? stats.avgTicket.toFixed(2) : "0.00"}
            </p>
          </div>

          {/* Card: Pedidos */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-3 min-[360px]:p-4 shadow-2xs hover:shadow-xs transition-shadow">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] min-[360px]:text-xs font-bold text-slate-400 uppercase tracking-wider">
                Pedidos Totales
              </span>
              <div className="w-7 h-7 min-[360px]:w-8 min-[360px]:h-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
                <ShoppingBag className="w-4 h-4" />
              </div>
            </div>
            <p className="text-lg min-[360px]:text-2xl font-black text-slate-800 tracking-tight">
              {stats?.totalOrders ?? orders.length}
            </p>
            <p className="text-[10px] text-emerald-600 font-medium mt-0.5 truncate">
              {orders.filter((o: any) => o.status === "received" || o.status === "preparing").length} en curso
            </p>
          </div>

          {/* Card: Productos */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-3 min-[360px]:p-4 shadow-2xs hover:shadow-xs transition-shadow">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] min-[360px]:text-xs font-bold text-slate-400 uppercase tracking-wider">
                Productos Activos
              </span>
              <div className="w-7 h-7 min-[360px]:w-8 min-[360px]:h-8 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
                <Package className="w-4 h-4" />
              </div>
            </div>
            <p className="text-lg min-[360px]:text-2xl font-black text-slate-800 tracking-tight">
              {availableCount} <span className="text-xs font-normal text-slate-400">/ {products.length}</span>
            </p>
            <p className="text-[10px] text-amber-600 font-medium mt-0.5 truncate">
              {featuredCount} destacados
            </p>
          </div>

          {/* Card: Comisión */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-3 min-[360px]:p-4 shadow-2xs hover:shadow-xs transition-shadow">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] min-[360px]:text-xs font-bold text-slate-400 uppercase tracking-wider">
                Comisión Aplicada
              </span>
              <div className="w-7 h-7 min-[360px]:w-8 min-[360px]:h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <p className="text-lg min-[360px]:text-2xl font-black text-slate-800 tracking-tight">
              ${stats?.totalCommission ? stats.totalCommission.toFixed(2) : "0.00"}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5 truncate">
              Liquidación de plataforma
            </p>
          </div>

        </div>

        {/* Quick Actions Carousel/Grid */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-3 min-[360px]:p-4 shadow-2xs">
          <h2 className="text-xs min-[360px]:text-sm font-bold text-slate-800 mb-2.5">
            Acciones Rápidas
          </h2>
          <div className="grid grid-cols-2 min-[480px]:grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => navigate("/commerce/products")}
              className="p-2.5 rounded-xl bg-slate-50 hover:bg-emerald-50 hover:border-emerald-200 border border-slate-100 flex flex-col items-center text-center transition-all group"
            >
              <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center mb-1.5 group-hover:scale-105 transition-transform">
                <Plus className="w-4 h-4" />
              </div>
              <span className="text-[11px] min-[360px]:text-xs font-bold text-slate-700 group-hover:text-emerald-800">
                Nuevo Producto
              </span>
            </button>

            <button
              type="button"
              onClick={() => navigate("/commerce/orders")}
              className="p-2.5 rounded-xl bg-slate-50 hover:bg-blue-50 hover:border-blue-200 border border-slate-100 flex flex-col items-center text-center transition-all group"
            >
              <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center mb-1.5 group-hover:scale-105 transition-transform">
                <ShoppingBag className="w-4 h-4" />
              </div>
              <span className="text-[11px] min-[360px]:text-xs font-bold text-slate-700 group-hover:text-blue-800">
                Ver Pedidos
              </span>
            </button>

            <button
              type="button"
              onClick={() => navigate("/commerce/stats")}
              className="p-2.5 rounded-xl bg-slate-50 hover:bg-purple-50 hover:border-purple-200 border border-slate-100 flex flex-col items-center text-center transition-all group"
            >
              <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center mb-1.5 group-hover:scale-105 transition-transform">
                <BarChart3 className="w-4 h-4" />
              </div>
              <span className="text-[11px] min-[360px]:text-xs font-bold text-slate-700 group-hover:text-purple-800">
                Estadísticas
              </span>
            </button>

            <button
              type="button"
              onClick={() => navigate("/commerce/profile")}
              className="p-2.5 rounded-xl bg-slate-50 hover:bg-amber-50 hover:border-amber-200 border border-slate-100 flex flex-col items-center text-center transition-all group"
            >
              <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center mb-1.5 group-hover:scale-105 transition-transform">
                <Store className="w-4 h-4" />
              </div>
              <span className="text-[11px] min-[360px]:text-xs font-bold text-slate-700 group-hover:text-amber-800">
                Mi Perfil
              </span>
            </button>
          </div>
        </div>

        {/* Recent Orders Section */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-3 min-[360px]:p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-xs min-[360px]:text-sm font-bold text-slate-800">
              Pedidos Recientes
            </h2>
            <button
              type="button"
              onClick={() => navigate("/commerce/orders")}
              className="text-[11px] min-[360px]:text-xs text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-1"
            >
              Ver todos <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {recentOrders.length === 0 ? (
            <div className="text-center py-6 text-slate-400 text-xs">
              No tienes pedidos recientes registrados.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentOrders.map((order: any) => (
                <div
                  key={order.id}
                  onClick={() => navigate("/commerce/orders")}
                  className="py-2.5 flex items-center justify-between hover:bg-slate-50 rounded-xl px-1.5 cursor-pointer transition-colors"
                >
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-800">
                        Pedido #{order.id}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full font-semibold bg-slate-100 text-slate-700 capitalize truncate max-w-[80px]">
                        {order.status}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 truncate">
                      {order.customerName || "Cliente"} • {order.items?.length || 0} ítems
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-xs min-[360px]:text-sm font-extrabold text-emerald-700">
                      ${parseFloat(order.total || 0).toFixed(2)}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 ml-auto inline-block" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </CommerceLayout>
  );
}
