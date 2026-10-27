import type { ReactNode } from "react";
import { useNavigate, useLocation } from "react-router";
import {
  LayoutDashboard, ShoppingBag, Store, Truck, Package, Settings, LogOut,
} from "lucide-react";
import { trpcMutate } from "@/hooks/useDeliveryData";

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

  const handleLogout = async () => {
    await trpcMutate("login.logout", {}).catch(() => {});
    localStorage.removeItem("qs_session");
    navigate("/login");
  };

  return (
    <div className="min-h-[100dvh] h-screen bg-gray-50 flex overflow-hidden">
      {/* Sidebar — desktop */}
      <aside className="hidden lg:flex w-64 bg-white border-r border-gray-200 flex-col fixed h-full z-30">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-[#2E7D32] rounded-xl flex items-center justify-center shadow-sm">
              <Package className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-extrabold text-base tracking-tight text-gray-900 block leading-none">YA LLEGA</span>
              <span className="text-[10px] text-gray-400 font-medium tracking-wide uppercase">Panel Admin</span>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  isActive
                    ? "bg-[#2E7D32] text-white shadow-sm shadow-[#2E7D32]/20"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="p-4 border-t border-gray-100">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 rounded-xl transition-colors"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Main scroll container — handles mobile bottom nav padding and desktop full height */}
      <main className="flex-1 lg:ml-64 pb-20 sm:pb-24 lg:pb-0 flex flex-col overflow-y-auto">
        {children}
      </main>

      {/* Bottom nav — mobile */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-gray-200 flex items-center justify-around px-1 pt-1 pb-[max(0.35rem,env(safe-area-inset-bottom,6px))] z-50 shadow-lg">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex-1 min-h-[44px] flex flex-col items-center justify-center gap-0.5 px-0.5 py-1 rounded-xl transition-all active:scale-95 ${
                isActive
                  ? "text-[#2E7D32] font-bold"
                  : "text-gray-400 hover:text-gray-600 font-medium"
              }`}
            >
              <item.icon className={`w-5 h-5 transition-transform ${isActive ? "scale-110" : ""}`} />
              <span className="text-[8px] sm:text-[9px] leading-tight text-center truncate max-w-full">
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
