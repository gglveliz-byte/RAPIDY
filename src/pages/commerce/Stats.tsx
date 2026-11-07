import { useNavigate } from "react-router";
import {
  ArrowLeft, TrendingUp, ShoppingBag, DollarSign, Star,
  Award, BarChart2
} from "lucide-react";
import { useCommerceStats, useMerchantCommerceId } from "@/hooks/useDeliveryData";
import CommerceLayout from "@/components/CommerceLayout";

export default function CommerceStats() {
  const navigate = useNavigate();
  const { commerceId } = useMerchantCommerceId();
  const { data: stats, loading } = useCommerceStats(commerceId || 0);

  if (loading) {
    return (
      <CommerceLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </CommerceLayout>
    );
  }

  if (!stats) {
    return (
      <CommerceLayout>
        <div className="flex items-center justify-center min-h-[60vh] text-center p-4">
          <p className="text-xs text-slate-500">No se pudieron cargar las estadísticas del comercio.</p>
        </div>
      </CommerceLayout>
    );
  }

  const maxSales = Math.max(...(stats.dailySales || []).map((d: any) => d.sales), 1);
  const totalTopRevenue = (stats.topProducts || []).reduce(
    (acc: number, p: any) => acc + (parseFloat(p.revenue) || 0),
    0
  );

  return (
    <CommerceLayout>
      <div className="p-2.5 min-[360px]:p-4 lg:p-6 max-w-4xl mx-auto space-y-3 min-[360px]:space-y-4">
        
        {/* Header */}
        <div className="flex items-center justify-between gap-2 bg-white rounded-2xl p-2.5 min-[360px]:p-4 border border-slate-200/80 shadow-2xs">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => navigate("/commerce")}
              className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors flex-shrink-0"
              aria-label="Volver"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <h1 className="text-sm min-[360px]:text-base font-extrabold text-slate-800 truncate">
                Rendimiento & Métricas
              </h1>
              <p className="text-[10px] text-slate-400 truncate">
                Balance de ventas y productos destacados
              </p>
            </div>
          </div>
        </div>

        {/* 4 KPI Cards (Fluid: 1 col on <340px, 2 on 340px+, 4 on desktop) */}
        <div className="grid grid-cols-1 min-[340px]:grid-cols-2 lg:grid-cols-4 gap-2 min-[360px]:gap-3">
          
          <div className="bg-white rounded-2xl border border-slate-200/80 p-3 min-[360px]:p-4 shadow-2xs">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] min-[360px]:text-xs font-bold text-slate-400 uppercase tracking-wider">
                Ventas Totales
              </span>
              <div className="w-7 h-7 min-[360px]:w-8 min-[360px]:h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <p className="text-lg min-[360px]:text-2xl font-black text-slate-800 tracking-tight">
              ${stats.totalSales ? parseFloat(stats.totalSales).toFixed(2) : "0.00"}
            </p>
            <p className="text-[10px] text-emerald-600 font-medium mt-0.5">Ingresos brutos</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 p-3 min-[360px]:p-4 shadow-2xs">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] min-[360px]:text-xs font-bold text-slate-400 uppercase tracking-wider">
                Pedidos Entregados
              </span>
              <div className="w-7 h-7 min-[360px]:w-8 min-[360px]:h-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
                <ShoppingBag className="w-4 h-4" />
              </div>
            </div>
            <p className="text-lg min-[360px]:text-2xl font-black text-slate-800 tracking-tight">
              {stats.totalOrders || 0}
            </p>
            <p className="text-[10px] text-blue-600 font-medium mt-0.5">Completados con éxito</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 p-3 min-[360px]:p-4 shadow-2xs">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] min-[360px]:text-xs font-bold text-slate-400 uppercase tracking-wider">
                Ticket Promedio
              </span>
              <div className="w-7 h-7 min-[360px]:w-8 min-[360px]:h-8 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <p className="text-lg min-[360px]:text-2xl font-black text-slate-800 tracking-tight">
              ${stats.avgTicket ? parseFloat(stats.avgTicket).toFixed(2) : "0.00"}
            </p>
            <p className="text-[10px] text-purple-600 font-medium mt-0.5">Por cada pedido</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 p-3 min-[360px]:p-4 shadow-2xs">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] min-[360px]:text-xs font-bold text-slate-400 uppercase tracking-wider">
                Catálogo
              </span>
              <div className="w-7 h-7 min-[360px]:w-8 min-[360px]:h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
                <Star className="w-4 h-4" />
              </div>
            </div>
            <p className="text-lg min-[360px]:text-2xl font-black text-slate-800 tracking-tight">
              {stats.totalProducts || 0}
            </p>
            <p className="text-[10px] text-amber-600 font-medium mt-0.5">Productos en carta</p>
          </div>

        </div>

        {/* Daily Sales Bar Chart */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-3 min-[360px]:p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs min-[360px]:text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <BarChart2 className="w-4 h-4 text-emerald-600" />
              Ventas por Día (Entregados)
            </h2>
            <span className="text-[10px] text-slate-400 font-medium">Últimos 7 días</span>
          </div>

          <div className="flex items-end justify-between gap-1.5 min-[360px]:gap-2 h-36 pt-4 pb-2 border-b border-slate-100">
            {(stats.dailySales || []).map((d: any) => {
              const heightPercent = Math.max((d.sales / maxSales) * 100, 4);
              const hasSales = d.sales > 0;

              return (
                <div key={d.day} className="flex-1 flex flex-col items-center justify-end h-full group">
                  {/* Amount label */}
                  <span className="text-[8px] min-[360px]:text-[9px] font-bold text-slate-500 mb-1 truncate max-w-full">
                    {hasSales ? `$${d.sales}` : "-"}
                  </span>
                  
                  {/* Bar */}
                  <div className="w-full max-w-[28px] min-[360px]:max-w-[36px] bg-slate-100 rounded-t-lg overflow-hidden flex items-end justify-center h-full">
                    <div
                      className={`w-full rounded-t-lg transition-all duration-300 ${
                        hasSales ? "bg-emerald-600 group-hover:bg-emerald-700" : "bg-slate-200"
                      }`}
                      style={{ height: `${heightPercent}%` }}
                    />
                  </div>

                  {/* Day label */}
                  <span className="text-[9px] min-[360px]:text-[10px] font-semibold text-slate-600 mt-1.5 truncate">
                    {d.day}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top Selling Products List */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-3 min-[360px]:p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-xs min-[360px]:text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <Award className="w-4 h-4 text-amber-500" />
              Productos Más Vendidos
            </h2>
          </div>

          {(!stats.topProducts || stats.topProducts.length === 0) ? (
            <div className="py-6 text-center text-slate-400 text-xs">
              Aún no registras ventas entregadas para generar el ranking.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {stats.topProducts.map((product: any, i: number) => {
                const medals = ["🥇", "🥈", "🥉"];
                const revenue = parseFloat(product.revenue) || 0;
                const percentage = totalTopRevenue > 0 ? (revenue / totalTopRevenue) * 100 : 0;

                return (
                  <div key={product.name} className="py-2.5 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-bold w-5 text-center flex-shrink-0">
                          {medals[i] || `${i + 1}°`}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs min-[360px]:text-sm font-bold text-slate-800 truncate">
                            {product.name}
                          </p>
                          <p className="text-[10px] text-slate-400 font-medium">
                            {product.sales} unidades vendidas
                          </p>
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <span className="text-xs min-[360px]:text-sm font-black text-emerald-700">
                          ${revenue.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1.5 overflow-hidden">
                      <div
                        className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(percentage, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </CommerceLayout>
  );
}
