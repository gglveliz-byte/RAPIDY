import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router";
import {
  LayoutDashboard, ShoppingBag, Store, Truck, Package, Settings, LogOut,
} from "lucide-react";
import { trpcMutate } from "@/hooks/useDeliveryData";
import { queryClient } from "@/providers/trpc";
import { clearRoleUser, clearSession, dispatchLogout } from "@/hooks/useSessionSync";
import { ThemeToggle } from "@/components/ThemeToggle";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/admin" },
  { icon: Store, label: "Comercios", path: "/admin/commerces" },
  { icon: Truck, label: "Repartidores", path: "/admin/drivers" },
  { icon: ShoppingBag, label: "Pedidos", path: "/admin/orders" },
  { icon: Package, label: "Productos", path: "/admin/products" },
  { icon: Settings, label: "Config", path: "/admin/settings" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  // Un solo ThemeToggle montado a la vez para que su estado no se desincronice
  // entre el sidebar (desktop) y la barra inferior (mobile).
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 1024px)").matches : true,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(min-width: 1024px)");
    const handleChange = (event: MediaQueryListEvent) => setIsDesktop(event.matches);
    setIsDesktop(media.matches);
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  const handleLogout = async () => {
    await trpcMutate("login.logout", { scope: "admin" }).catch(() => {});
    clearRoleUser("admin");
    clearSession("admin");
    dispatchLogout("admin");
    queryClient.clear();
    navigate("/login");
  };

  return (
    <div className="min-h-[100dvh] h-screen bg-[#F7F7FA] dark:bg-[#0A0A0D] text-zinc-900 dark:text-zinc-100 flex overflow-hidden antialiased">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2.5 focus:rounded-xl focus:bg-white focus:text-zinc-900 focus:font-semibold focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-brand"
      >
        Saltar al contenido
      </a>

      {/* Sidebar — desktop */}
      <aside className="hidden lg:flex w-64 bg-white dark:bg-[#111115] border-r border-zinc-100 dark:border-white/10 flex-col fixed h-full z-30">
        <div className="p-6 border-b border-zinc-100 dark:border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-brand rounded-xl flex items-center justify-center shadow-sm shadow-brand/30">
              <Package className="w-5 h-5 text-zinc-950" />
            </div>
            <div>
              <span className="font-extrabold text-base tracking-tight text-zinc-900 dark:text-zinc-100 block leading-none">RAPIDY</span>
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium tracking-wide uppercase">Panel Admin</span>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => navigate(item.path)}
                aria-current={isActive ? "page" : undefined}
                className={`w-full min-h-[44px] flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  isActive
                    ? "bg-brand/10 text-brand-strong dark:text-brand"
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-zinc-100"
                }`}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="p-4 border-t border-zinc-100 dark:border-white/10 space-y-1.5">
          {isDesktop && (
            <div className="flex items-center justify-between px-3.5 py-1.5 bg-zinc-50 dark:bg-white/5 rounded-xl border border-zinc-100 dark:border-white/10">
              <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Tema</span>
              <ThemeToggle size="lg" />
            </div>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="w-full min-h-[44px] flex items-center gap-3 px-3.5 py-2.5 text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-colors"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Main scroll container — handles mobile bottom nav padding and desktop full height */}
      <main id="main-content" tabIndex={-1} className="flex-1 lg:ml-64 pb-32 sm:pb-36 lg:pb-0 flex flex-col overflow-y-auto focus:outline-none">
        {children}
      </main>

      {/* Bottom nav — mobile */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white dark:bg-[#111115] border-t border-zinc-100 dark:border-white/10 z-30 shadow-lg dark:shadow-black/40 px-1 pt-1 pb-[max(0.35rem,env(safe-area-inset-bottom,6px))]">
        {/* Utilidades: tema + logout accesible */}
        <div className="flex items-center justify-between gap-2 px-2 pb-0.5">
          <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Panel Admin</span>
          <div className="flex items-center gap-1.5">
            {!isDesktop && <ThemeToggle size="sm" className="!w-11 !h-11 !rounded-xl" />}
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
              className="min-h-[44px] flex items-center gap-1.5 px-3 rounded-xl text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 border border-red-200 dark:border-red-500/30 transition-colors active:scale-95"
            >
              <LogOut className="w-4 h-4" />
              Salir
            </button>
          </div>
        </div>
        <div className="flex items-center justify-around">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => navigate(item.path)}
                aria-current={isActive ? "page" : undefined}
                className={`flex-1 min-h-[44px] max-w-[56px] flex flex-col items-center justify-center gap-0.5 px-0.5 py-1 rounded-xl transition-all active:scale-95 ${
                  isActive
                    ? "text-brand-strong bg-brand/10 font-bold dark:text-brand"
                    : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 font-medium"
                }`}
              >
                <item.icon className={`w-4 h-4 sm:w-5 sm:h-5 transition-transform ${isActive ? "scale-110" : ""}`} />
                <span className="text-[7.5px] sm:text-[9px] leading-tight text-center truncate max-w-full font-medium">
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