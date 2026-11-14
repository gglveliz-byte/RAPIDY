import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, DollarSign, TrendingUp, Clock, Bike, Loader2 } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useDriverSession } from "@/hooks/useDeliveryData";
import { useDriverEvents } from "@/hooks/useOrderEvents";

function guayaquilDateKey(value: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export default function DriverEarnings() {
  const navigate = useNavigate();
  const driverSession = useDriverSession();
  const driverId = driverSession?.id ?? null;
  const utils = trpc.useUtils();
  useDriverEvents(driverId || undefined, utils);
  const [period, setPeriod] = useState<"day" | "week" | "month">("week");

  const { data: earnings, isLoading, isError, error, refetch } = trpc.driver.getEarnings.useQuery(
    { id: driverId! },
    { enabled: !!driverId }
  );

  const dailyHistory = useMemo(() => {
    if (!earnings || earnings.length === 0) return [];
    const grouped = new Map<string, { date: string; deliveries: number; earnings: number }>();
    for (const entry of earnings as any[]) {
      const key = guayaquilDateKey(entry.createdAt ?? entry.date);
      const current = grouped.get(key) ?? { date: key, deliveries: 0, earnings: 0 };
      current.deliveries += 1;
      current.earnings += Number(entry.amount);
      grouped.set(key, current);
    }
    return [...grouped.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [earnings]);

  const periodEntries = useMemo(() => {
    if (!earnings || earnings.length === 0) return [];
    const now = new Date();
    const todayKey = guayaquilDateKey(now);
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    const weekStartKey = guayaquilDateKey(weekStart);

    return (earnings as any[]).filter((entry) => {
      const key = guayaquilDateKey(entry.createdAt ?? entry.date);
      if (period === "day") return key === todayKey;
      if (period === "week") return key >= weekStartKey;
      return key.slice(0, 7) === todayKey.slice(0, 7);
    });
  }, [earnings, period]);

  const periodEarnings = periodEntries.reduce(
    (sum, entry: any) => sum + Number(entry.amount),
    0,
  );
  const periodDeliveries = periodEntries.length;
  const totalDeliveries = earnings?.length || 0;
  const avgEarnings = periodDeliveries > 0 ? periodEarnings / periodDeliveries : 0;

  if (isLoading) {
    return (
      <div role="status" aria-live="polite" className="mobile-container bg-zinc-50 dark:bg-[#0A0A0D] min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand" aria-hidden="true" />
        <span className="sr-only">Cargando ganancias…</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mobile-container bg-zinc-50 dark:bg-[#0A0A0D] min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <p className="text-sm font-bold text-red-700 dark:text-red-400">No se pudieron cargar tus ganancias</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{error.message}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-4 min-h-11 px-4 py-2 rounded-lg bg-brand hover:brightness-110 text-zinc-950 text-xs font-bold transition-colors"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="mobile-container bg-zinc-50 dark:bg-[#0A0A0D] min-h-screen pb-6">
      {/* Header */}
      <div className="bg-gradient-to-br from-brand to-brand-strong px-4 pt-4 pb-6">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => navigate("/driver")} aria-label="Volver a pedidos" className="text-white/80 hover:text-white touch-target flex items-center justify-center rounded-xl">
            <ArrowLeft className="w-6 h-6" aria-hidden="true" />
          </button>
          <ThemeToggle
            size="lg"
            className="!bg-white/15 !border-white/30 !text-white hover:!bg-white/25 hover:!text-white shadow-sm"
          />
        </div>
        <h1 className="text-xl font-bold text-white">Mis ganancias</h1>
      </div>

      {/* Total Card */}
      <div className="px-4 -mt-3">
        <div className="bg-white dark:bg-[#1A1A1E] rounded-2xl card-shadow dark:shadow-none border border-zinc-100 dark:border-white/10 p-5">
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-1">{period === "day" ? "Ganancias de hoy" : period === "week" ? "Ganancias de la semana" : "Ganancias del mes"}</p>
          <p className="text-3xl font-bold text-brand-strong">${periodEarnings.toFixed(2)}</p>
          <div className="flex items-center gap-1 mt-1 text-xs text-green-700 dark:text-green-400">
            <TrendingUp className="w-3 h-3" />
            <span>Ganancias acumuladas</span>
          </div>
        </div>
      </div>

      {/* Period Tabs */}
      <div className="px-4 mt-4">
        <div className="flex bg-zinc-100 dark:bg-[#16161B] rounded-xl p-1 border border-zinc-200/60 dark:border-white/5">
          {(["day", "week", "month"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`flex-1 min-h-11 min-w-11 px-2 py-2 text-sm font-medium rounded-lg transition-all ${
                period === p
                  ? "bg-white dark:bg-[#1A1A1E] text-brand-strong shadow-sm"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              }`}
            >
              {p === "day" ? "Hoy" : p === "week" ? "Semana" : "Mes"}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="px-4 mt-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white dark:bg-[#1A1A1E] rounded-2xl card-shadow dark:shadow-none border border-zinc-100 dark:border-white/10 p-3 text-center">
            <Bike className="w-5 h-5 text-brand mx-auto mb-1" />
            <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{totalDeliveries}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Entregas</p>
          </div>
          <div className="bg-white dark:bg-[#1A1A1E] rounded-2xl card-shadow dark:shadow-none border border-zinc-100 dark:border-white/10 p-3 text-center">
            <Clock className="w-5 h-5 text-brand mx-auto mb-1" />
            <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{periodDeliveries}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Entregas (período)</p>
          </div>
          <div className="bg-white dark:bg-[#1A1A1E] rounded-2xl card-shadow dark:shadow-none border border-zinc-100 dark:border-white/10 p-3 text-center">
            <DollarSign className="w-5 h-5 text-brand mx-auto mb-1" />
            <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">${avgEarnings.toFixed(2)}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Promedio</p>
          </div>
        </div>
      </div>

      {/* Daily History */}
      <div className="px-4 mt-6">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Historial</h2>
        <div className="bg-white dark:bg-[#1A1A1E] rounded-2xl card-shadow dark:shadow-none border border-zinc-100 dark:border-white/10 divide-y divide-zinc-100 dark:divide-white/5 overflow-hidden">
          {dailyHistory.length > 0 ? (
            dailyHistory.map((day: any) => (
              <div key={day.date} className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {new Date(`${day.date}T12:00:00`).toLocaleDateString("es-ES", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{day.deliveries} entregas</p>
                </div>
                <span className="text-sm font-bold text-brand-strong">${day.earnings.toFixed(2)}</span>
              </div>
            ))
          ) : (
            <div className="p-6 text-center">
              <p className="text-zinc-500 dark:text-zinc-400 text-sm">Sin historial de ganancias</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}