/**
 * @archivo src/pages/commerce/Stats.tsx
 * @modulo 06-commerce (Métricas y Rendimiento Financiero del Comercio)
 * @proposito
 *   Visualización integral del balance financiero, volumen de ventas diarias y
 *   clasificación de productos más vendidos para el comercio autenticado en la plataforma Rapidy.
 *
 * @resumen_contenido
 *   - Componente `CommerceStats`:
 *       * Consulta reactiva de métricas del comercio (`useCommerceStats`, `useMerchantCommerceId`).
 *       * Tarjetas KPI de ventas totales ($ USD), pedidos despachados, ticket promedio y catálogo activo.
 *       * Gráfico de barras interactivo con gradiente Flame Orange (`#FF6A00`) para ventas de los últimos 7 días.
 *       * Leaderboard de productos más exitosos con medallas y barras de progreso proporcionales en Flame Orange.
 *
 * @dependencias_internas
 *   - `useCommerceStats`, `useMerchantCommerceId` (@/hooks/useDeliveryData)
 *   - `CommerceLayout` (@/components/CommerceLayout)
 */

import { useNavigate } from "react-router";
import {
  ArrowLeft,
  TrendingUp,
  ShoppingBag,
  DollarSign,
  Star,
  Award,
  BarChart2,
} from "lucide-react";
import { useCommerceStats, useMerchantCommerceId } from "@/hooks/useDeliveryData";
import CommerceLayout from "@/components/CommerceLayout";

export default function CommerceStats() {
  const navigate = useNavigate();
  const {
    commerceId,
    loading: commerceLoading,
    error: commerceError,
    refresh: refreshCommerce,
  } = useMerchantCommerceId();
  const { data: stats, loading, error, refresh } = useCommerceStats(commerceId || 0);
  const isLoading = commerceLoading || loading;
  const loadError = commerceError || error;

  if (isLoading) {
    return (
      <CommerceLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
          <div className="w-10 h-10 border-4 border-[#FF6A00] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-semibold text-zinc-400">Cargando métricas financieras...</p>
        </div>
      </CommerceLayout>
    );
  }

  if (loadError) {
    return (
      <CommerceLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
          <div className="w-12 h-12 rounded-2xl bg-red-50 dark:bg-red-950/40 flex items-center justify-center text-red-500 mb-3">
            <BarChart2 className="w-6 h-6" />
          </div>
          <h2 className="text-sm font-bold text-zinc-800 dark:text-white mb-1">No se pudieron cargar las métricas</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-xs">
            {loadError.message || "Revisa tu conexión e inténtalo de nuevo."}
          </p>
          <button
            type="button"
            onClick={() => {
              refreshCommerce();
              refresh();
            }}
            className="mt-4 px-4 py-2 rounded-xl bg-[#FF6A00] hover:bg-[#e65f00] text-white text-xs font-bold"
          >
            Reintentar
          </button>
        </div>
      </CommerceLayout>
    );
  }

  if (!stats) {
    return (
      <CommerceLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
          <div className="w-12 h-12 rounded-2xl bg-zinc-100 flex items-center justify-center text-zinc-400 mb-3">
            <BarChart2 className="w-6 h-6" />
          </div>
          <h2 className="text-sm font-bold text-zinc-800 mb-1">Sin datos de rendimiento</h2>
          <p className="text-xs text-zinc-500 max-w-xs">
            No se pudieron cargar las estadísticas del comercio o aún no hay datos disponibles.
          </p>
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
      <div className="px-4 min-[380px]:px-6 py-4 sm:py-6 max-w-5xl mx-auto space-y-4 min-[380px]:space-y-5">
        
        {/* Encabezado */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-[#16161B] rounded-3xl p-4 sm:p-5 border border-zinc-200/80 dark:border-white/10 shadow-xs">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => navigate("/commerce")}
              className="w-10 h-10 rounded-2xl bg-zinc-100 dark:bg-white/10 hover:bg-zinc-200 dark:hover:bg-white/15 text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white flex items-center justify-center transition-all flex-shrink-0 active:scale-95 cursor-pointer"
              aria-label="Volver al panel principal"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black text-zinc-900 dark:text-white tracking-tight truncate">
                  Rendimiento & Métricas
                </h1>
                <span className="hidden min-[480px]:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#FF6A00]/10 text-[#FF6A00] border border-[#FF6A00]/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#FF6A00] animate-pulse" />
                  En Vivo
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium truncate">
                Balance de ingresos, pedidos y catálogo del comercio
              </p>
            </div>
          </div>
        </div>

        {/* 4 Tarjetas KPI Principales */}
        <div className="grid grid-cols-1 min-[340px]:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          
          {/* KPI 1: Ventas Totales */}
          <div className="bg-white dark:bg-[#16161B] rounded-3xl border border-zinc-200/80 dark:border-white/10 p-5 shadow-xs hover:border-[#FF6A00]/30 transition-all duration-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                Ventas entregadas
              </span>
              <div className="w-9 h-9 rounded-2xl bg-[#FF6A00]/10 text-[#FF6A00] flex items-center justify-center">
                <DollarSign className="w-5 h-5" />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white tracking-tight">
              ${stats.totalSales ? parseFloat(stats.totalSales).toFixed(2) : "0.00"}
              <span className="text-xs font-bold text-zinc-400 ml-1.5 tracking-normal">USD</span>
            </p>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium mt-1">Ingresos brutos acumulados</p>
          </div>

          {/* KPI 2: Pedidos Despachados */}
          <div className="bg-white dark:bg-[#16161B] rounded-3xl border border-zinc-200/80 dark:border-white/10 p-5 shadow-xs hover:border-[#FF6A00]/30 transition-all duration-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                Pedidos entregados
              </span>
              <div className="w-9 h-9 rounded-2xl bg-[#FF6A00]/10 text-[#FF6A00] flex items-center justify-center">
                <ShoppingBag className="w-5 h-5" />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white tracking-tight">
              {stats.totalOrders || 0}
              <span className="text-xs font-bold text-zinc-400 ml-1.5 tracking-normal">órdenes</span>
            </p>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium mt-1">Completados con éxito</p>
          </div>

          {/* KPI 3: Ticket Promedio */}
          <div className="bg-white dark:bg-[#16161B] rounded-3xl border border-zinc-200/80 dark:border-white/10 p-5 shadow-xs hover:border-[#FF6A00]/30 transition-all duration-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                Ticket entregado
              </span>
              <div className="w-9 h-9 rounded-2xl bg-[#FF6A00]/10 text-[#FF6A00] flex items-center justify-center">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white tracking-tight">
              ${stats.avgTicket ? parseFloat(stats.avgTicket).toFixed(2) : "0.00"}
              <span className="text-xs font-bold text-zinc-400 ml-1.5 tracking-normal">USD</span>
            </p>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium mt-1">Promedio por orden</p>
          </div>

          {/* KPI 4: Catálogo Activo */}
          <div className="bg-white dark:bg-[#16161B] rounded-3xl border border-zinc-200/80 dark:border-white/10 p-5 shadow-xs hover:border-[#FF6A00]/30 transition-all duration-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                Catálogo Activo
              </span>
              <div className="w-9 h-9 rounded-2xl bg-[#FF6A00]/10 text-[#FF6A00] flex items-center justify-center">
                <Star className="w-5 h-5" />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white tracking-tight">
              {stats.availableProducts ?? stats.totalProducts ?? 0}
              <span className="text-xs font-bold text-zinc-400 ml-1.5 tracking-normal">
                / {stats.totalProducts ?? 0}
              </span>
            </p>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium mt-1">Disponibles para vender</p>
          </div>

          {/* KPI 5: Comisión histórica */}
          <div className="bg-white dark:bg-[#16161B] rounded-3xl border border-zinc-200/80 dark:border-white/10 p-5 shadow-xs hover:border-[#FF6A00]/30 transition-all duration-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                Comisión plataforma
              </span>
              <div className="w-9 h-9 rounded-2xl bg-zinc-100 dark:bg-white/5 text-zinc-700 dark:text-zinc-300 flex items-center justify-center">
                <Award className="w-5 h-5" />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white tracking-tight">
              ${stats.totalCommission ? parseFloat(stats.totalCommission).toFixed(2) : "0.00"}
              <span className="text-xs font-bold text-zinc-400 ml-1.5 tracking-normal">USD</span>
            </p>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium mt-1">Según pedidos entregados</p>
          </div>

        </div>

        {/* Gráfico de Barras de Ventas Diarias */}
        <div className="bg-white dark:bg-[#16161B] rounded-3xl border border-zinc-200/80 dark:border-white/10 p-5 sm:p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-[#FF6A00]/10 text-[#FF6A00] flex items-center justify-center flex-shrink-0">
                <BarChart2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-white">
                  Ventas por Día (Entregados)
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Histórico de facturación diaria reciente</p>
              </div>
            </div>
            <div className="inline-flex items-center gap-1.5 self-start sm:self-auto bg-zinc-100 dark:bg-white/10 px-3 py-1 rounded-full text-xs font-semibold text-zinc-600 dark:text-zinc-300 border border-zinc-200/60 dark:border-white/10">
              <span className="w-2 h-2 rounded-full bg-[#FF6A00]" />
              Últimos 7 días
            </div>
          </div>

          <div className="flex items-end justify-between gap-2 sm:gap-4 h-48 pt-6 pb-2 border-b border-zinc-200/70 dark:border-white/10">
            {(stats.dailySales || []).map((d: any) => {
              const heightPercent = Math.max((d.sales / maxSales) * 100, 5);
              const hasSales = d.sales > 0;
              const formattedSales = typeof d.sales === "number" ? d.sales.toFixed(2) : d.sales;

              return (
                <div key={d.day} className="flex-1 flex flex-col items-center justify-end h-full relative group">
                  {/* Tooltip flotante en hover */}
                  <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none bg-zinc-900 text-white text-[10px] font-bold py-1 px-2.5 rounded-lg shadow-lg whitespace-nowrap z-20 transform -translate-y-1 group-hover:translate-y-0">
                    {hasSales ? `$${formattedSales} USD` : "Sin ventas"}
                    <div className="absolute left-1/2 -bottom-1 transform -translate-x-1/2 w-2 h-2 bg-zinc-900 rotate-45" />
                  </div>

                  {/* Etiqueta de monto estática limpia */}
                  <span className={`text-[10px] sm:text-xs font-bold mb-1.5 truncate max-w-full ${
                    hasSales ? "text-zinc-800 dark:text-zinc-200" : "text-zinc-400 dark:text-zinc-500"
                  }`}>
                    {hasSales ? `$${d.sales}` : "—"}
                  </span>
                  
                  {/* Columna de barra con gradiente Flame Orange */}
                  <div className="w-full max-w-[32px] sm:max-w-[42px] bg-zinc-100 dark:bg-white/10 rounded-t-xl overflow-hidden flex items-end justify-center h-full">
                    <div
                      className={`w-full rounded-t-xl transition-all duration-500 ease-out ${
                        hasSales
                          ? "bg-gradient-to-t from-[#FF6A00] to-[#FFA040] group-hover:brightness-110 shadow-xs"
                          : "bg-zinc-100 dark:bg-white/5"
                      }`}
                      style={{ height: `${heightPercent}%` }}
                    />
                  </div>

                  {/* Etiqueta de día */}
                  <span className="text-[11px] sm:text-xs font-semibold text-zinc-600 dark:text-zinc-400 mt-2 truncate capitalize">
                    {d.day}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Ranking de Productos Más Vendidos (Leaderboard) */}
        <div className="bg-white dark:bg-[#16161B] rounded-3xl border border-zinc-200/80 dark:border-white/10 p-5 sm:p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-[#FF6A00]/10 text-[#FF6A00] flex items-center justify-center flex-shrink-0">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-white">
                  Ranking de Productos Más Vendidos
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Líderes de facturación y volumen del catálogo</p>
              </div>
            </div>

            {totalTopRevenue > 0 && (
              <span className="self-start sm:self-auto text-xs font-bold text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-white/10 px-3 py-1 rounded-full border border-zinc-200/60 dark:border-white/10">
                Total Top: <span className="text-zinc-900 dark:text-white font-black">${totalTopRevenue.toFixed(2)} USD</span>
              </span>
            )}
          </div>

          {(!stats.topProducts || stats.topProducts.length === 0) ? (
            <div className="py-10 text-center flex flex-col items-center justify-center">
              <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400 mb-2">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                Aún no registras ventas entregadas para generar el ranking.
              </p>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                Las órdenes completadas nutrirán automáticamente esta tabla.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-white/10">
              {stats.topProducts.map((product: any, i: number) => {
                const medals = ["🥇", "🥈", "🥉"];
                const isMedalist = i < 3;
                const revenue = parseFloat(product.revenue) || 0;
                const percentage = totalTopRevenue > 0 ? (revenue / totalTopRevenue) * 100 : 0;

                return (
                  <div key={product.productId ?? product.id ?? product.name} className="py-3.5 first:pt-1 last:pb-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {isMedalist ? (
                          <span className="text-lg w-7 text-center flex-shrink-0">
                            {medals[i]}
                          </span>
                        ) : (
                          <span className="w-7 h-7 rounded-full bg-zinc-100 dark:bg-white/10 text-zinc-600 dark:text-zinc-300 font-bold text-xs flex items-center justify-center flex-shrink-0">
                            {i + 1}
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white truncate">
                            {product.name}
                          </p>
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">
                            {product.sales} {product.sales === 1 ? "unidad vendida" : "unidades vendidas"}
                          </p>
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <span className="text-xs sm:text-sm font-black text-zinc-900 dark:text-white">
                          ${revenue.toFixed(2)}
                        </span>
                        <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-bold block">USD</span>
                      </div>
                    </div>

                    {/* Barra de progreso en Flame Orange */}
                    <div className="w-full bg-zinc-100 dark:bg-white/10 rounded-full h-2 mt-2 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-[#FF6A00] to-[#FFA040] h-full rounded-full transition-all duration-500"
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
