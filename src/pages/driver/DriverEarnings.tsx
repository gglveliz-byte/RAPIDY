import { useMemo, useState } from "react";
import { Bike, CalendarDays, DollarSign, Loader2, TrendingUp, Wallet } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useDriverSession } from "@/hooks/useDeliveryData";
import { useDriverEvents } from "@/hooks/useOrderEvents";
import DriverLayout from "@/components/DriverLayout";

function guayaquilDateKey(value: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

const PERIODS = [
  { key: "day", label: "Hoy", long: "Hoy" },
  { key: "week", label: "Semana", long: "Esta semana" },
  { key: "month", label: "Mes", long: "Este mes" },
] as const;

export default function DriverEarnings() {
  const driverSession = useDriverSession();
  const driverId = driverSession?.id ?? null;
  const utils = trpc.useUtils();
  useDriverEvents(driverId || undefined, utils);
  const [period, setPeriod] = useState<"day" | "week" | "month">("week");

  const { data: earnings, isLoading, isError, error, refetch } = trpc.driver.getEarnings.useQuery(
    { id: driverId! },
    { enabled: !!driverId },
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
  const periodMeta = PERIODS.find((p) => p.key === period)!;

  if (isLoading) {
    return (
      <DriverLayout title="Ganancias" subtitle="Resumen de tus entregas">
        <div role="status" aria-live="polite" className="flex flex-1 items-center justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-brand" aria-hidden="true" />
          <span className="sr-only">Cargando ganancias…</span>
        </div>
      </DriverLayout>
    );
  }

  if (isError) {
    return (
      <DriverLayout title="Ganancias" subtitle="Resumen de tus entregas">
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="text-[13px] font-bold text-red-700 dark:text-red-400">
            No se pudieron cargar tus ganancias
          </p>
          <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">{error.message}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-4 min-h-10 rounded-lg bg-brand px-4 text-[11px] font-bold text-zinc-950 transition-colors hover:brightness-110"
          >
            Reintentar
          </button>
        </div>
      </DriverLayout>
    );
  }

  return (
    <DriverLayout title="Ganancias" subtitle="Resumen de tus entregas">
      <div className="space-y-3 px-4 py-4">
        {/* Total del período */}
        <section className="relative overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-white/10 dark:bg-[#15151A]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-brand/10 blur-2xl"
          />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                <Wallet className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
                {periodMeta.long}
              </p>
              <p className="mt-1 text-[30px] font-black leading-none tracking-tight text-zinc-900 dark:text-zinc-50">
                ${periodEarnings.toFixed(2)}
              </p>
            </div>
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
              <TrendingUp className="h-3 w-3" aria-hidden="true" />
              {periodDeliveries} {periodDeliveries === 1 ? "entrega" : "entregas"}
            </span>
          </div>

          <div className="relative mt-3 flex gap-2">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPeriod(p.key)}
                aria-pressed={period === p.key}
                className={`min-h-9 flex-1 rounded-xl text-[11.5px] font-bold transition-all ${
                  period === p.key
                    ? "bg-brand text-zinc-950 shadow-[0_2px_8px_rgba(255,106,0,0.3)]"
                    : "bg-zinc-100 text-zinc-500 hover:text-zinc-700 dark:bg-white/5 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </section>

        {/* Métricas */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl border border-zinc-200/80 bg-white p-3 text-center dark:border-white/10 dark:bg-[#15151A]">
            <Bike className="mx-auto h-4 w-4 text-brand" aria-hidden="true" />
            <p className="mt-1 text-[17px] font-black leading-none">{totalDeliveries}</p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Total
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-200/80 bg-white p-3 text-center dark:border-white/10 dark:bg-[#15151A]">
            <CalendarDays className="mx-auto h-4 w-4 text-brand" aria-hidden="true" />
            <p className="mt-1 text-[17px] font-black leading-none">{periodDeliveries}</p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Período
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-200/80 bg-white p-3 text-center dark:border-white/10 dark:bg-[#15151A]">
            <DollarSign className="mx-auto h-4 w-4 text-brand" aria-hidden="true" />
            <p className="mt-1 text-[17px] font-black leading-none">${avgEarnings.toFixed(2)}</p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Promedio
            </p>
          </div>
        </div>

        {/* Historial por día */}
        <div className="flex items-center justify-between pt-1">
          <h2 className="text-[12px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Historial
          </h2>
          {dailyHistory.length > 0 && (
            <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500">
              {dailyHistory.length} {dailyHistory.length === 1 ? "día" : "días"}
            </span>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white divide-y divide-zinc-100 dark:border-white/10 dark:bg-[#15151A] dark:divide-white/5">
          {dailyHistory.length > 0 ? (
            dailyHistory.map((day) => (
              <div key={day.date} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold capitalize leading-tight">
                    {new Date(`${day.date}T12:00:00`).toLocaleDateString("es-ES", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                  </p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    {day.deliveries} {day.deliveries === 1 ? "entrega" : "entregas"}
                  </p>
                </div>
                <span className="shrink-0 text-[13px] font-bold text-brand-strong dark:text-brand">
                  ${day.earnings.toFixed(2)}
                </span>
              </div>
            ))
          ) : (
            <div className="px-4 py-8 text-center">
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
                Sin historial de ganancias
              </p>
            </div>
          )}
        </div>
      </div>
    </DriverLayout>
  );
}
