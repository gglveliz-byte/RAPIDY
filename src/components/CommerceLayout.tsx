import { useState, useEffect, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router";
import {
  LayoutDashboard, ShoppingBag, Package, BarChart3,
  LogOut, User, Store,
} from "lucide-react";
import { trpcMutate, useMerchantCommerceId, useCommerceOrders } from "@/hooks/useDeliveryData";

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
  const [storeName, setStoreName] = useState("Mi Comercio");

  const { commerceId } = useMerchantCommerceId();
  const { data: rawOrders } = useCommerceOrders(commerceId || 0);
  
  // Pending orders badge count (received or preparing)
  const pendingCount = (rawOrders || []).filter(
    (o) => o.status === "received" || o.status === "preparing"
  ).length;

  useEffect(() => {
    try {
      const storedUser = localStorage.getItem("merchant_user");
      if (storedUser) {
        const user = JSON.parse(storedUser);
        if (user?.name) setStoreName(user.name);
      }
    } catch {
      // fallback
    }
  }, []);

  const handleLogout = async () => {
    try {
      await trpcMutate("login.logout", {});
    } catch {
      // ignore
    }
    localStorage.removeItem("merchant_user");
    localStorage.removeItem("qs_session");
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row text-slate-800 antialiased overflow-x-hidden">
      
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex w-64 bg-white border-r border-slate-200 flex-col fixed inset-y-0 left-0 z-30 shadow-xs">
        {/* Brand header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-sm shadow-emerald-600/30">
              <Store className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-slate-900 text-sm truncate leading-tight">YA LLEGA</h2>
              <p className="text-[11px] text-slate-400 font-medium truncate">Panel Comercio</p>
            </div>
          </div>
        </div>

        {/* Store badge info */}
        <div className="px-4 py-3 mx-3 my-2 bg-slate-50 border border-slate-200/60 rounded-xl flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-xs flex-shrink-0">
            {storeName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-800 truncate">{storeName}</p>
            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              En línea
            </span>
          </div>
        </div>

        {/* Navigation links */}
        <nav className="flex-1 px-3 py-2 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            const isOrders = item.path === "/commerce/orders";
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  isActive
                    ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/25"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-white" : "text-slate-400"}`} />
                  <span className="truncate">{item.label}</span>
                </div>
                {isOrders && pendingCount > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      isActive ? "bg-white text-emerald-700" : "bg-emerald-100 text-emerald-800"
                    }`}
                  >
                    {pendingCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Logout button at bottom of desktop sidebar */}
        <div className="p-3 border-t border-slate-100">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-xl transition-colors group"
          >
            <LogOut className="w-4 h-4 text-red-400 group-hover:text-red-600 transition-colors" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {/* Mobile Top Header (Fixed so it never hides on scroll) */}
      <header className="md:hidden fixed top-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 min-[380px]:px-5 pt-[max(env(safe-area-inset-top,0px),2.25rem)] pb-3 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 min-[380px]:w-9 min-[380px]:h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-xs min-[380px]:text-sm flex-shrink-0 shadow-2xs">
            {storeName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="text-xs min-[380px]:text-sm font-bold text-slate-800 truncate leading-tight">
              {storeName}
            </h1>
            <p className="text-[10px] min-[380px]:text-[11px] text-emerald-600 font-medium flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Panel de Comercio
            </p>
          </div>
        </div>

        {/* Mobile Quick Logout Button */}
        <button
          type="button"
          onClick={handleLogout}
          title="Cerrar sesión"
          aria-label="Cerrar sesión de mi comercio"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-slate-600 hover:text-red-600 hover:bg-red-50 border border-slate-200 hover:border-red-200 active:scale-95 transition-all text-xs font-semibold flex-shrink-0 shadow-2xs"
        >
          <LogOut className="w-3.5 h-3.5 text-red-500" />
          <span className="text-red-600">Salir</span>
        </button>
      </header>

      {/* Main Content Area (with top padding to account for fixed header) */}
      <main className="flex-1 md:ml-64 pt-[calc(max(env(safe-area-inset-top,0px),2.25rem)+3.5rem)] md:pt-0 pb-20 min-[360px]:pb-24 md:pb-8 overflow-x-hidden">
        {children}
      </main>

      {/* Bottom Nav - Mobile */}
      <nav
        aria-label="Navegación principal móvil"
        className="md:hidden fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-slate-200/90 z-40 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom,8px))]"
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
                className={`relative flex-1 flex flex-col items-center justify-center py-1 px-0.5 rounded-lg transition-all active:scale-95 ${
                  isActive
                    ? "text-emerald-700 font-bold bg-emerald-50/80"
                    : "text-slate-400 hover:text-slate-600 font-medium"
                }`}
              >
                <div className="relative">
                  <Icon
                    className={`w-4 h-4 min-[360px]:w-5 min-[360px]:h-5 transition-transform ${
                      isActive ? "scale-110 text-emerald-700" : ""
                    }`}
                  />
                  {isOrders && pendingCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-white" />
                  )}
                </div>
                <span className="text-[8px] min-[320px]:text-[9px] min-[360px]:text-[10px] mt-0.5 truncate max-w-full tracking-tight">
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
