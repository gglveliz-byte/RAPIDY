/**
 * @archivo src/components/CommerceLayout.tsx
 * @modulo 03-commerce-panel (Layout Maestro del Panel de Negocio)
 * @proposito
 *   Estructura base responsiva para el panel de comercios y restaurantes aliados de Rapidy.
 *   Diseñada con la estética oficial Rapidy (Sidebar y Topbar en Dark Velvet #0E0E12,
 *   acentos Flame Orange #FF6A00, fondo Luminous #F7F7FA y navegación móvil ergonómica).
 *
 * @resumen_contenido
 *   - Componente `CommerceLayout`: Barra lateral fija de escritorio, barra superior móvil
 *     con indicador de tienda en línea, contador en vivo de pedidos pendientes y navegación inferior.
 *
 * @dependencias_internas
 *   - `trpcMutate`, `useMerchantCommerceId`, `useCommerceOrders` (@/hooks/useDeliveryData)
 *
 * @dependencias_externas
 *   - `react` (`useState`, `useEffect`)
 *   - `react-router` (`useNavigate`, `useLocation`)
 *   - `lucide-react` (`LayoutDashboard`, `ShoppingBag`, `Package`, `BarChart3`, `LogOut`, `User`, `Store`, `Sparkles`)
 */

import { type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router";
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  BarChart3,
  LogOut,
  User,
  Store,
} from "lucide-react";
import { trpcMutate, useMerchantCommerceId, useCommerceOrders } from "@/hooks/useDeliveryData";
import { useCommerceEvents } from "@/hooks/useOrderEvents";
import { queryClient, trpc } from "@/providers/trpc";
import {
  clearRoleUser,
  clearSession,
  dispatchLogout,
  getRoleUser,
} from "@/hooks/useSessionSync";
import { getCommerceOrderStatus } from "@contracts/orderStatus";
import { ThemeToggle } from "@/components/ThemeToggle";

const navItems = [
  { icon: LayoutDashboard, label: "Inicio", path: "/commerce" },
  { icon: ShoppingBag, label: "Pedidos", path: "/commerce/orders" },
  { icon: Package, label: "Productos", path: "/commerce/products" },
  { icon: BarChart3, label: "Estadísticas", path: "/commerce/stats" },
  { icon: User, label: "Perfil", path: "/commerce/profile" },
];

export default function CommerceLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const merchantUser = getRoleUser<{ name?: string }>("merchant");

  const { commerceId, commerce } = useMerchantCommerceId();
  const { data: rawOrders } = useCommerceOrders(commerceId || 0);
  const utils = trpc.useUtils();
  useCommerceEvents(commerceId || undefined, utils);

  const storeName = commerce?.name || merchantUser?.name || "Mi Comercio";
  const isSelling = commerce?.status === "active" && commerce?.isOpen === "open";

  // Contador dinámico de pedidos que requieren acción de cocina.
  const pendingCount = (rawOrders || []).filter((order: any) =>
    ["received", "accepted", "preparing"].includes(
      getCommerceOrderStatus(order.status, order.myCommerceStatus),
    ),
  ).length;

  const handleLogout = async () => {
    try {
      await trpcMutate("commerce.unregisterDeviceToken", {});
    } catch { /* el logout debe continuar */ }
    try {
      await trpcMutate("login.logout", { scope: "merchant" });
    } catch {
      // Si falla la red, igual limpiamos la UI local y salimos del panel.
    }
    clearRoleUser("merchant");
    clearSession("merchant");
    dispatchLogout("merchant");
    queryClient.clear();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-[#F7F7FA] dark:bg-[#0A0A0D] flex flex-col md:flex-row text-zinc-900 dark:text-zinc-100 antialiased overflow-x-hidden selection:bg-[#FF6A00]/20">
      {/* 1. SIDEBAR DESKTOP (Dark Velvet #0E0E12) */}
      <aside className="hidden md:flex w-64 bg-[#0E0E12] border-r border-white/10 flex-col fixed inset-y-0 left-0 z-30 shadow-2xl">
        {/* Cabecera de Marca */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-tr from-[#FF6A00] to-[#FFA040] rounded-xl flex items-center justify-center text-white shadow-md shadow-[#FF6A00]/30">
              <Store className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="font-black text-white text-base tracking-tight leading-none">RAPIDY</h2>
                <span className="text-[10px] bg-[#FF6A00]/20 text-[#FF6A00] border border-[#FF6A00]/30 font-black px-1.5 py-0.2 rounded-full">
                  PRO
                </span>
              </div>
              <p className="text-[10px] text-zinc-400 font-semibold tracking-wider uppercase mt-0.5">
                Panel del Negocio
              </p>
            </div>
          </div>
        </div>

        {/* Tarjeta de Información de la Tienda */}
        <div className="px-4 py-3 mx-3 my-3 bg-white/5 border border-white/10 rounded-2xl flex items-center gap-2.5 shadow-inner">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#FF6A00] to-[#FF8533] text-white font-black flex items-center justify-center text-xs shrink-0 shadow-sm shadow-[#FF6A00]/30">
            {storeName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-white truncate leading-snug">{storeName}</p>
            <span className={`inline-flex items-center gap-1.5 text-[10px] font-black ${isSelling ? "text-[#FF6A00]" : "text-amber-300"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isSelling ? "bg-[#FF6A00] animate-ping" : "bg-amber-400"}`} />
              {isSelling ? "Operando en Vivo" : commerce?.status !== "active" ? "No activo" : "Local pausado"}
            </span>
          </div>
        </div>

        {/* Enlaces de Navegación Vertical */}
        <nav className="flex-1 px-3 py-2 space-y-1.5">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            const isOrders = item.path === "/commerce/orders";
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer ${isActive
                    ? "bg-[#FF6A00] text-white shadow-md shadow-[#FF6A00]/30"
                    : "text-zinc-400 hover:text-white hover:bg-white/5"
                  }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-transform ${isActive ? "text-white scale-110" : "text-zinc-500"
                      }`}
                  />
                  <span className="truncate">{item.label}</span>
                </div>
                {isOrders && pendingCount > 0 && (
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-black ${isActive ? "bg-white text-[#FF6A00]" : "bg-[#FF6A00] text-white animate-pulse"
                      }`}
                  >
                    {pendingCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Botón de Conmutador de Tema y Cerrar Sesión */}
        <div className="p-3 border-t border-white/10 space-y-1.5">
          <div className="flex items-center justify-between px-3.5 py-1.5 bg-white/5 rounded-2xl border border-white/5">
            <span className="text-xs font-bold text-zinc-400">Tema</span>
            <ThemeToggle size="sm" />
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3.5 py-2 text-xs font-bold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-2xl transition-all cursor-pointer group"
          >
            <LogOut className="w-4 h-4 text-rose-500 group-hover:scale-110 transition-transform" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {/* 2. CABECERA MÓVIL SUPERIOR (Dark Velvet Fijo) */}
      <header
        className="md:hidden fixed top-0 inset-x-0 z-40 bg-[#0E0E12]/95 backdrop-blur-2xl border-b border-white/10 px-4 min-[380px]:px-5 pt-12 pb-3 flex items-center justify-between shadow-xl transition-all"
        style={{
          paddingTop: "max(48px, env(safe-area-inset-top, 48px))",
          minHeight: "calc(max(48px, env(safe-area-inset-top, 48px)) + 52px)",
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#FF6A00] to-[#FFA040] text-white flex items-center justify-center font-black text-xs shrink-0 shadow-md shadow-[#FF6A00]/30">
            {storeName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="text-xs min-[380px]:text-sm font-black text-white truncate leading-tight">
              {storeName}
            </h1>
            <p className={`text-[10px] min-[380px]:text-[11px] font-black flex items-center gap-1.5 mt-0.5 ${isSelling ? "text-[#FF6A00]" : "text-amber-300"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isSelling ? "bg-[#FF6A00] animate-ping" : "bg-amber-400"}`} />
              {isSelling ? "Panel de Negocio" : commerce?.status !== "active" ? "Comercio no activo" : "Local pausado"}
            </p>
          </div>
        </div>

        {/* Botones de Cabecera Móvil: ThemeToggle + Salir */}
        <div className="flex items-center gap-2 shrink-0">
          <ThemeToggle size="sm" className="!bg-white/10 !border-white/15 !text-white" />
          <button
            type="button"
            onClick={handleLogout}
            title="Cerrar sesión"
            aria-label="Cerrar sesión de mi comercio"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20 active:scale-95 transition-all text-xs font-bold shrink-0 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 text-rose-400" />
            <span>Salir</span>
          </button>
        </div>
      </header>

      {/* 3. ÁREA PRINCIPAL DE CONTENIDO */}
      <main
        className="flex-1 md:ml-64 pt-[calc(max(48px,env(safe-area-inset-top,48px))+56px)] md:pt-0 pb-24 md:pb-8 overflow-x-hidden min-h-screen"
      >
        {children}
      </main>

      {/* 4. NAVEGACIÓN MÓVIL INFERIOR (Dark Velvet #0E0E12) */}
      <nav
        aria-label="Navegación principal móvil"
        className="md:hidden fixed bottom-0 inset-x-0 bg-[#0E0E12]/95 backdrop-blur-2xl border-t border-white/10 z-40 shadow-[0_-8px_30px_rgba(0,0,0,0.6)] px-2 pt-2 pb-[max(0.6rem,env(safe-area-inset-bottom,10px))]"
      >
        <div className="flex items-center justify-around w-full max-w-lg mx-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            const isOrders = item.path === "/commerce/orders";

            return (
              <button
                key={item.path}
                type="button"
                onClick={() => navigate(item.path)}
                className={`relative flex-1 flex flex-col items-center justify-center py-1 px-0.5 rounded-xl transition-all active:scale-95 cursor-pointer ${isActive
                    ? "text-[#FF6A00] font-black bg-[#FF6A00]/10"
                    : "text-zinc-400 hover:text-zinc-200 font-medium"
                  }`}
              >
                <div className="relative">
                  <Icon
                    className={`w-4 h-4 min-[360px]:w-5 min-[360px]:h-5 transition-transform ${isActive ? "scale-110 text-[#FF6A00]" : ""
                      }`}
                  />
                  {isOrders && pendingCount > 0 && (
                    <span className="absolute -top-1 -right-1.5 min-w-[16px] h-4 bg-[#FF6A00] text-white text-[9px] font-black rounded-full flex items-center justify-center px-1 shadow-sm shadow-[#FF6A00]/40 animate-pulse" />
                  )}
                </div>
                <span className="text-[9px] min-[320px]:text-[10px] mt-1 truncate max-w-full tracking-tight font-bold">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
