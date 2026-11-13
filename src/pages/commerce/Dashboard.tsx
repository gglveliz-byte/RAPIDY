/**
 * @archivo src/pages/commerce/Dashboard.tsx
 * @modulo 03-commerce-panel (Dashboard Principal del Comercio)
 * @proposito
 *   Centro de control y mando operativo para comercios y restaurantes aliados en Rapidy.
 *   Permite monitorear ventas en tiempo real, abrir o pausar la tienda,
 *   revisar pedidos entrantes, catálogo activo y accesos directos de gestión.
 *   Diseñado con la estética oficial Rapidy (Dark Velvet #0E0E12, Flame Orange #FF6A00,
 *   tarjetas blancas de alto contraste y tipografía limpia).
 *
 * @resumen_contenido
 *   - Componente `CommerceDashboard`: Banner de estado del local, cuadrícula métrica,
 *     accesos rápidos operativos, lista de pedidos recientes y catálogo de productos destacados.
 *
 * @dependencias_internas
 *   - `useMerchantCommerceId`, `useProductsByCommerce`, `useCommerceStats`,
 *     `useCommerce`, `useToggleCommerceStatus`, `useCommerceOrders` (@/hooks/useDeliveryData)
 *   - `CommerceLayout` (@/components/CommerceLayout)
 *   - `safeImage` (@/lib/imageUtils)
 *
 * @dependencias_externas
 *   - `react` (`useState`, `useEffect`)
 *   - `react-router` (`useNavigate`)
 *   - `lucide-react` (`ShoppingBag`, `Package`, `BarChart3`, `TrendingUp`, `ChevronRight`,
 *     `DollarSign`, `Plus`, `Store`, `ArrowRight`, `Power`, `Flame`)
 */

import { useNavigate } from "react-router";
import { useEffect, useState } from "react";
import {
  ShoppingBag, Package, BarChart3, TrendingUp, ChevronRight,
  DollarSign, Plus, Store, ArrowRight, Power, Flame
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
import { safeImage } from "@/lib/imageUtils";
import {
  getCommerceOrderStatus,
  getOrderStatusMeta,
} from "@contracts/orderStatus";

function visibleStatus(order: any): string {
  return getCommerceOrderStatus(order.status, order.myCommerceStatus);
}

const QUICK_ACTIONS = [
  { icon: Plus, title: "Nuevo Producto", subtitle: "Añadir al catálogo", path: "/commerce/products" },
  { icon: ShoppingBag, title: "Ver Pedidos", subtitle: "Gestionar órdenes", path: "/commerce/orders" },
  { icon: BarChart3, title: "Estadísticas", subtitle: "Métricas y balance", path: "/commerce/stats" },
  { icon: Store, title: "Mi Perfil", subtitle: "Datos del local", path: "/commerce/profile" },
];

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
    if (!commerceId || !isActive) return;
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
  const isActive = commerce?.status === "active";
  const isSelling = isActive && isOpen;
  const featuredCount = products.filter(
    (p: any) => p.isFeatured === "yes" && p.isAvailable === "yes",
  ).length;
  const availableCount = products.filter((p: any) => p.isAvailable === "yes").length;
  const inPrepCount = orders.filter((o: any) =>
    ["received", "accepted", "preparing"].includes(visibleStatus(o)),
  ).length;
  const recentOrders = (orders || []).slice(0, 4);

  // Lista de productos más vendidos / destacados para la vista previa
  const topProducts =
    stats?.topProducts && stats.topProducts.length > 0
      ? stats.topProducts.slice(0, 4).map((tp: any) => {
          const full = products.find((p: any) => p.id === (tp.id ?? tp.productId));
          return {
            id: tp.id ?? tp.productId,
            name: tp.name || full?.name || "Producto",
            salesCount: tp.salesCount ?? tp.sales,
            price: tp.unitPrice ?? full?.price ?? 0,
            imageUrl: full?.imageUrl || full?.image,
            category: full?.category || tp.category || "Menú",
          };
        })
      : products.slice(0, 4).map((p: any) => ({
          id: p.id,
          name: p.name,
          salesCount: null,
          price: p.price,
          imageUrl: p.imageUrl || p.image,
          category: p.category || "Menú",
        }));

  return (
    <CommerceLayout>
      <div className="px-4 min-[380px]:px-6 py-4 sm:py-6 max-w-5xl mx-auto space-y-5">
        
        {/* Banner de Estado del Comercio */}
        {isSelling ? (
          <div className="relative overflow-hidden rounded-3xl p-5 sm:p-6 border border-white/10 bg-gradient-to-br from-[#0E0E12] via-[#16161F] to-[#0E0E12] text-white shadow-xl shadow-black/15 transition-all">
            <div className="absolute -top-12 -right-12 w-56 h-56 bg-[#FF6A00]/15 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-10 left-1/4 w-44 h-44 bg-[#FF6A00]/10 rounded-full blur-2xl pointer-events-none" />

            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1.5 max-w-xl">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FF6A00]/15 border border-[#FF6A00]/30 text-[#FF8533] text-[11px] font-bold uppercase tracking-wider">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF6A00] opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#FF6A00]" />
                  </span>
                  <span>Local Abierto • Recibiendo Pedidos</span>
                </div>
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight truncate">{commerceName}</h1>
                <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                  Tu comercio está activo en Rapidy. Administra tu catálogo, pedidos en vivo y métricas en tiempo real.
                </p>
              </div>

              <div className="flex items-center gap-3 self-start md:self-center">
                <button
                  type="button"
                  onClick={handleToggleStore}
                  disabled={togglingStatus}
                  className="group flex items-center gap-2.5 px-4.5 py-2.5 rounded-2xl bg-white/10 hover:bg-red-500/15 border border-white/15 hover:border-red-400/30 text-white hover:text-red-300 font-bold text-xs shadow-inner backdrop-blur-md transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  <div className="w-6 h-6 rounded-xl bg-red-500/20 text-red-400 group-hover:bg-red-500 group-hover:text-white flex items-center justify-center transition-colors">
                    <Power className="w-3.5 h-3.5" />
                  </div>
                  <span>{togglingStatus ? "Actualizando..." : "Pausar / Cerrar"}</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-3xl p-5 sm:p-6 border border-zinc-300/80 bg-gradient-to-br from-[#1C1818] via-[#231E1E] to-[#181414] text-white shadow-lg transition-all">
            <div className="absolute -top-12 -right-12 w-56 h-56 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1.5 max-w-xl">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-bold uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span>{isActive ? "Local en Pausa • Fuera de Línea" : "Comercio no activo"}</span>
                </div>
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight truncate">{commerceName}</h1>
                <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                  {isActive
                    ? "Tu comercio no está visible para clientes. Actívalo en cualquier momento para comenzar a recibir órdenes."
                    : "Tu comercio está pendiente de activación o suspendido por administración. Contacta a soporte para revisar su estado."}
                </p>
              </div>

              <div className="flex items-center gap-3 self-start md:self-center">
                <button
                  type="button"
                  onClick={handleToggleStore}
                  disabled={togglingStatus || !isActive}
                  className="flex items-center gap-2.5 px-5 py-2.5 rounded-2xl bg-[#FF6A00] hover:bg-[#FF7A1A] text-white font-bold text-xs shadow-lg shadow-[#FF6A00]/25 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>{!isActive ? "Pendiente de activación" : togglingStatus ? "Actualizando..." : "Abrir Local Ahora"}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tarjetas de Resumen Métrico */}
        <div className="grid grid-cols-1 min-[340px]:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          
          {/* Métricas: Ventas Totales */}
          <div className="bg-white dark:bg-[#16161B] border border-zinc-200/80 dark:border-white/10 rounded-3xl p-5 shadow-xs hover:border-[#FF6A00]/40 transition-all flex flex-col justify-between group">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Ventas entregadas</span>
              <div className="w-9 h-9 rounded-2xl bg-[#FF6A00]/10 text-[#FF6A00] flex items-center justify-center font-bold group-hover:scale-105 transition-transform">
                <DollarSign className="w-4.5 h-4.5" />
              </div>
            </div>
            <div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white tracking-tight">
                  ${stats?.totalSales ? stats.totalSales.toFixed(2) : "0.00"}
                </span>
                <span className="text-xs font-bold text-[#FF6A00]">USD</span>
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium mt-1 truncate">
                Ticket prom: <span className="font-semibold text-zinc-700 dark:text-zinc-300">${stats?.avgTicket ? stats.avgTicket.toFixed(2) : "0.00"} USD</span>
              </p>
            </div>
          </div>

          {/* Métricas: Pedidos Totales & En Preparación */}
          <div className="bg-white dark:bg-[#16161B] border border-zinc-200/80 dark:border-white/10 rounded-3xl p-5 shadow-xs hover:border-[#FF6A00]/40 transition-all flex flex-col justify-between group">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Pedidos entregados</span>
              <div className="w-9 h-9 rounded-2xl bg-[#FF6A00]/10 text-[#FF6A00] flex items-center justify-center font-bold group-hover:scale-105 transition-transform">
                <ShoppingBag className="w-4.5 h-4.5" />
              </div>
            </div>
            <div>
              <p className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white tracking-tight">{stats?.totalOrders ?? 0}</p>
              <p className="text-[11px] font-semibold text-[#FF6A00] mt-1 flex items-center gap-1.5 truncate">
                <span className="w-2 h-2 rounded-full bg-[#FF6A00] animate-pulse" />
                {inPrepCount} en preparación
              </p>
            </div>
          </div>

          {/* Métricas: Catálogo de Productos */}
          <div className="bg-white dark:bg-[#16161B] border border-zinc-200/80 dark:border-white/10 rounded-3xl p-5 shadow-xs hover:border-[#FF6A00]/40 transition-all flex flex-col justify-between group">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Catálogo Activo</span>
              <div className="w-9 h-9 rounded-2xl bg-[#FF6A00]/10 text-[#FF6A00] flex items-center justify-center font-bold group-hover:scale-105 transition-transform">
                <Package className="w-4.5 h-4.5" />
              </div>
            </div>
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white tracking-tight">{availableCount}</span>
                <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500">/ {products.length} productos</span>
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium mt-1 truncate">
                <span className="font-semibold text-zinc-700 dark:text-zinc-300">{featuredCount}</span> destacados en tienda
              </p>
            </div>
          </div>

          {/* Métricas: Comisión de Plataforma */}
          <div className="bg-white dark:bg-[#16161B] border border-zinc-200/80 dark:border-white/10 rounded-3xl p-5 shadow-xs hover:border-[#FF6A00]/40 transition-all flex flex-col justify-between group">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Comisión Aplicada</span>
              <div className="w-9 h-9 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 flex items-center justify-center font-bold group-hover:scale-105 transition-transform">
                <TrendingUp className="w-4.5 h-4.5" />
              </div>
            </div>
            <div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white tracking-tight">
                  ${stats?.totalCommission ? stats.totalCommission.toFixed(2) : "0.00"}
                </span>
                <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500">USD</span>
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium mt-1 truncate">Liquidación Rapidy</p>
            </div>
          </div>

        </div>

        {/* Botones de Acceso Rápido */}
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3 px-1">Accesos Rápidos</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.path}
                  type="button"
                  onClick={() => navigate(action.path)}
                  className="bg-white dark:bg-[#16161B] border border-zinc-200/80 dark:border-white/10 hover:border-[#FF6A00] dark:hover:border-[#FF6A00] rounded-2xl p-4 shadow-xs hover:shadow-md transition-all active:scale-95 flex flex-col items-center text-center group cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-2xl bg-[#FF6A00]/10 text-[#FF6A00] flex items-center justify-center mb-2.5 group-hover:bg-[#FF6A00] group-hover:text-white transition-colors">
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 group-hover:text-[#FF6A00] transition-colors">{action.title}</span>
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5 hidden sm:block">{action.subtitle}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Sección de 2 Columnas: Pedidos Recientes & Productos Destacados */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Columna: Pedidos Recientes */}
          <div className="bg-white dark:bg-[#16161B] rounded-3xl border border-zinc-200/80 dark:border-white/10 p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-extrabold text-zinc-900 dark:text-white tracking-tight">Pedidos Recientes</h2>
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500">Últimas órdenes registradas en tu local</p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate("/commerce/orders")}
                  className="text-xs text-[#FF6A00] hover:text-[#e05d00] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  Ver todos <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {recentOrders.length === 0 ? (
                <div className="py-10 text-center space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 flex items-center justify-center mx-auto">
                    <ShoppingBag className="w-6 h-6" />
                  </div>
                  <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">No tienes pedidos recientes</p>
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500 max-w-xs mx-auto">
                    Cuando un cliente ordene en Rapidy, aparecerá aquí al instante.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {recentOrders.map((order: any) => {
                    const status = visibleStatus(order);
                    const meta = getOrderStatusMeta(status);
                    return (
                      <div
                        key={order.id}
                        onClick={() => navigate("/commerce/orders")}
                        className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/80 border border-zinc-200/70 dark:border-white/5 hover:border-[#FF6A00]/40 flex items-center justify-between gap-3 cursor-pointer transition-all group"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-extrabold text-zinc-900 dark:text-white">Pedido #{order.id}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${meta.badgeClass}`}>
                              {meta.shortLabel}
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                            {order.customerName || "Cliente"} • {order.items?.length || 0} productos
                          </p>
                        </div>

                        <div className="text-right flex items-center gap-2 shrink-0">
                          <div>
                            <span className="text-sm font-black text-[#FF6A00] tracking-tight">
                              ${parseFloat(order.total || 0).toFixed(2)}
                            </span>
                            <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 ml-1">USD</span>
                          </div>
                          <ChevronRight className="w-4 h-4 text-zinc-400 dark:text-zinc-500 group-hover:text-[#FF6A00] group-hover:translate-x-0.5 transition-all" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {recentOrders.length > 0 && (
              <button
                type="button"
                onClick={() => navigate("/commerce/orders")}
                className="mt-4 w-full py-2.5 rounded-2xl border border-zinc-200/80 dark:border-white/10 hover:border-[#FF6A00] text-zinc-700 dark:text-zinc-300 hover:text-[#FF6A00] font-bold text-xs transition-colors text-center cursor-pointer"
              >
                Ir a la cola de pedidos completa
              </button>
            )}
          </div>

          {/* Columna: Productos Más Vendidos / Catálogo */}
          <div className="bg-white dark:bg-[#16161B] rounded-3xl border border-zinc-200/80 dark:border-white/10 p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-extrabold text-zinc-900 dark:text-white tracking-tight flex items-center gap-1.5">
                    <Flame className="w-4 h-4 text-[#FF6A00]" />
                    Más Populares
                  </h2>
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500">Artículos con mayor demanda en tu menú</p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate("/commerce/products")}
                  className="text-xs text-[#FF6A00] hover:text-[#e05d00] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  Ver catálogo <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {topProducts.length === 0 ? (
                <div className="py-10 text-center space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 flex items-center justify-center mx-auto">
                    <Package className="w-6 h-6" />
                  </div>
                  <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">No tienes productos registrados</p>
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500 max-w-xs mx-auto">
                    Crea tus primeros artículos para comenzar a recibir ventas.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate("/commerce/products")}
                    className="mt-3 px-4 py-2 rounded-xl bg-[#FF6A00] text-white text-xs font-bold hover:bg-[#FF7A1A] transition-colors cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" /> Añadir Producto
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {topProducts.map((prod: any) => (
                    <div
                      key={prod.id}
                      onClick={() => navigate("/commerce/products")}
                      className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/80 border border-zinc-200/70 dark:border-white/5 hover:border-[#FF6A00]/40 flex items-center justify-between gap-3 cursor-pointer transition-all group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={safeImage(prod.imageUrl, "product")}
                          alt={prod.name}
                          className="w-11 h-11 rounded-xl object-cover border border-zinc-200/60 dark:border-white/10 shrink-0 bg-white dark:bg-zinc-800"
                        />
                        <div className="min-w-0 space-y-0.5">
                          <h3 className="text-xs font-extrabold text-zinc-900 dark:text-white truncate group-hover:text-[#FF6A00] transition-colors">
                            {prod.name}
                          </h3>
                          <p className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate">
                            {prod.salesCount
                              ? `${prod.salesCount} vendidos en total`
                              : prod.category || "Platillo destacado"}
                          </p>
                        </div>
                      </div>

                      <div className="text-right flex items-center gap-2 shrink-0">
                        <div>
                          <span className="text-sm font-black text-[#FF6A00] tracking-tight">
                            ${parseFloat(prod.price || 0).toFixed(2)}
                          </span>
                          <span className="text-[10px] font-bold text-zinc-400 ml-1">USD</span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-[#FF6A00] group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {topProducts.length > 0 && (
              <button
                type="button"
                onClick={() => navigate("/commerce/products")}
                className="mt-4 w-full py-2.5 rounded-2xl border border-zinc-200/80 hover:border-[#FF6A00] text-zinc-700 hover:text-[#FF6A00] font-bold text-xs transition-colors text-center cursor-pointer"
              >
                Administrar catálogo completo
              </button>
            )}
          </div>

        </div>

      </div>
    </CommerceLayout>
  );
}
