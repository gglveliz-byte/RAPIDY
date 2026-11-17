import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { ArrowLeft, BarChart3, List, Package, User } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

const TABS = [
  { label: "Pedidos", path: "/driver", icon: List },
  { label: "Ganancias", path: "/driver/earnings", icon: BarChart3 },
  { label: "Historial", path: "/driver/history", icon: Package },
  { label: "Perfil", path: "/driver/profile", icon: User },
];

interface DriverLayoutProps {
  title: string;
  subtitle?: ReactNode;
  headerRight?: ReactNode;
  headerExtra?: ReactNode;
  children: ReactNode;
  backTo?: string;
  /** Contenido con scroll propio (por defecto) o flujo normal. */
  scroll?: boolean;
}

function DriverNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <nav
      aria-label="Navegación del repartidor"
      className="shrink-0 border-t border-zinc-200/80 bg-white/95 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] pt-1.5 backdrop-blur-xl dark:border-white/10 dark:bg-[#101014]/95"
    >
      <div className="flex items-stretch justify-around gap-1">
        {TABS.map((tab) => {
          const active = pathname === tab.path;
          const Icon = tab.icon;
          return (
            <button
              key={tab.path}
              type="button"
              onClick={() => navigate(tab.path)}
              aria-current={active ? "page" : undefined}
              aria-label={tab.label}
              className={`group flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-semibold transition-colors ${
                active
                  ? "text-brand-strong dark:text-brand"
                  : "text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
              }`}
            >
              <span
                className={`flex h-7 w-12 items-center justify-center rounded-full transition-all duration-200 ${
                  active ? "bg-brand/15 dark:bg-brand/20" : "bg-transparent"
                }`}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.5 : 2} aria-hidden="true" />
              </span>
              <span className="leading-none">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export default function DriverLayout({
  title,
  subtitle,
  headerRight,
  headerExtra,
  children,
  backTo,
  scroll = true,
}: DriverLayoutProps) {
  const navigate = useNavigate();

  return (
    <div className="mx-auto flex h-[100dvh] w-full max-w-[480px] flex-col overflow-hidden bg-[#F7F7FA] text-zinc-900 dark:bg-[#0A0A0D] dark:text-zinc-100">
      <header className="relative shrink-0 overflow-hidden bg-gradient-to-br from-brand via-brand to-brand-strong px-4 pb-4 pt-safe text-white">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-white/15 blur-2xl"
        />

        <div className="relative flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {backTo && (
              <button
                type="button"
                onClick={() => navigate(backTo)}
                aria-label="Volver"
                className="-ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white/90 transition-colors hover:bg-white/15 hover:text-white active:scale-95"
              >
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-[19px] font-black leading-tight tracking-tight">{title}</h1>
              {subtitle && (
                <div className="mt-0.5 text-[12px] font-medium text-white/85">{subtitle}</div>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {headerRight ?? (
              <ThemeToggle
                size="lg"
                className="!border-white/25 !bg-white/15 !text-white hover:!bg-white/25"
              />
            )}
          </div>
        </div>

        {headerExtra}
      </header>

      <main
        className={`min-h-0 flex-1 ${
          scroll
            ? "overflow-y-auto overscroll-contain"
            : "flex flex-col overflow-hidden"
        }`}
      >
        {children}
      </main>

      <DriverNav />
    </div>
  );
}
