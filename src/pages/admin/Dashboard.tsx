import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import {
  ShoppingBag, Store, Users, Truck,
  TrendingUp, TrendingDown, Settings,
  DollarSign, Percent, RefreshCw, ChevronRight, LogOut, AlertCircle, BarChart3,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { trpcCall, trpcMutate } from "@/hooks/useDeliveryData";
import { useAdminSSE } from "@/hooks/useAdminSSE";
import AdminLayout from "@/components/AdminLayout";
import { queryClient } from "@/providers/trpc";
import { clearRoleUser, clearSession, dispatchLogout } from "@/hooks/useSessionSync";

type Period = "day" | "week" | "month" | "year";

type SaleData = { date: string; sales: number; orders: number };
type EarningData = { date: string; commission: number; deliveryNet: number };

const BRAND = "#FF6A00";
const CARD_CLASS =
  "bg-white dark:bg-[#1A1A1E] rounded-xl border border-zinc-100 dark:border-white/10 card-shadow dark:shadow-none";

const axisTick = { fontSize: 10, fill: "currentColor" };
const axisLine = { stroke: "currentColor", strokeOpacity: 0.3 };
const tooltipContentStyle = {
  backgroundColor: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 12,
  padding: "8px 12px",
  fontSize: 12,
  color: "hsl(var(--popover-foreground))",
  boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
};
const tooltipLabelStyle = { color: "hsl(var(--muted-foreground))", fontWeight: 600, marginBottom: 4 };
const tooltipItemStyle = { color: "hsl(var(--popover-foreground))" };

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [kpi, setKpi] = useState<any>(null);
  const [salesData, setSalesData] = useState<SaleData[]>([]);
  const [earningsData, setEarningsData] = useState<EarningData[]>([]);
  const [period, setPeriod] = useState<Period>("month");
  const [growthPercent, setGrowthPercent] = useState<number | null>(null);
  const [growthWindowDays, setGrowthWindowDays] = useState<number | null>(null);
  const [topCategories, setTopCategories] = useState<any[]>([]);
  const [topCommerces, setTopCommerces] = useState<any[]>([]);
  const [commerceCommissions, setCommerceCommissions] = useState<any[]>([]);
  const [driverEarnings, setDriverEarnings] = useState<any[]>([]);
  const [adminDeliveryEarnings, setAdminDeliveryEarnings] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<number>(0);
  const [secondsAgo, setSecondsAgo] = useState(0);

  const loadCharts = useCallback(async (p: Period) => {
    try {
      const [sales, earnings, growth] = await Promise.all([
        trpcCall<SaleData[]>("admin.salesByPeriod", { period: p }),
        trpcCall<EarningData[]>("admin.earningsByPeriod", { period: p }),
        trpcCall<{ growthPercent: number | null; windowDays: number }>("admin.salesGrowth", { period: p }),
      ]);
      setSalesData(sales || []);
      setEarningsData(earnings || []);
      setGrowthPercent(growth?.growthPercent ?? null);
      setGrowthWindowDays(growth?.windowDays ?? null);
    } catch (error) {
      console.warn("Error al cargar los gráficos:", error);
      setGrowthPercent(null);
      setGrowthWindowDays(null);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setRefreshing(true);
    setLoadError(false);
    await Promise.all([
      trpcCall<any>("admin.dashboard")
        .then(setKpi)
        .catch((error) => {
          console.error(error);
          setLoadError(true);
        }),
      trpcCall<any[]>("admin.categoryRanking").then(setTopCategories).catch(console.error),
      trpcCall<any[]>("admin.topCommerces", { limit: 5 }).then(setTopCommerces).catch(console.error),
      trpcCall<any[]>("admin.commerceCommissions").then(setCommerceCommissions).catch(console.error),
      trpcCall<any[]>("admin.driverEarningsBreakdown").then(setDriverEarnings).catch(console.error),
      trpcCall<any>("admin.adminDeliveryEarnings").then(setAdminDeliveryEarnings).catch(console.error),
    ]);
    await loadCharts(period);
    setRefreshing(false);
    setLastUpdate(Date.now());
    setSecondsAgo(0);
  }, [loadCharts, period]);

  const { connected } = useAdminSSE(loadAll);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastUpdate) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [lastUpdate]);

  useEffect(() => {
    loadCharts(period);
  }, [period, loadCharts]);

  const handleLogout = async () => {
    await trpcMutate("login.logout", { scope: "admin" }).catch(() => {});
    clearRoleUser("admin");
    clearSession("admin");
    dispatchLogout("admin");
    queryClient.clear();
    navigate("/login");
  };

  return (
    <AdminLayout>
      <header className="bg-white dark:bg-[#111115] border-b border-zinc-100 dark:border-white/10 px-3 lg:px-6 pt-safe-top pb-2.5 lg:py-3.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-1.5 h-5 rounded-full bg-brand shrink-0" aria-hidden="true" />
          <h1 className="text-sm sm:text-base lg:text-lg font-bold text-zinc-900 dark:text-zinc-100 truncate">
            <span className="sm:hidden">Panel Admin</span>
            <span className="hidden sm:inline">Panel administrativo</span>
          </h1>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-3 shrink-0">
          <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <span className={`inline-block w-2 h-2 rounded-full ${connected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
            <span className="font-medium text-zinc-600 dark:text-zinc-300">{connected ? "En vivo" : "Reconectando..."}</span>
            <span className="text-zinc-300 dark:text-zinc-600 mx-1">|</span>
            <span className="text-zinc-500 dark:text-zinc-400">Actualizado hace {secondsAgo}s</span>
          </div>
          <button
            type="button"
            onClick={loadAll}
            disabled={refreshing}
            aria-label="Recargar datos"
            className="min-h-[44px] min-w-11 flex items-center gap-1.5 text-xs text-brand-strong dark:text-brand font-semibold bg-brand/5 hover:bg-brand/10 px-2.5 sm:px-3 py-1.5 rounded-xl border border-brand/20 dark:border-brand/30 transition-colors disabled:opacity-50 active:scale-95 shadow-2xs"
            title="Recargar datos"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Recargar</span>
          </button>
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Cerrar sesión"
            className="min-h-[44px] min-w-11 flex items-center gap-1 text-xs text-red-600 dark:text-red-400 font-semibold hover:bg-red-50 dark:hover:bg-red-500/10 px-2 sm:px-2.5 py-1.5 rounded-xl border border-red-200 dark:border-red-500/30 transition-colors active:scale-95 shadow-2xs"
            title="Cerrar sesión"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden xs:inline sm:inline">Salir</span>
          </button>
          <div className="w-7 h-7 sm:w-8 sm:h-8 bg-brand rounded-full flex items-center justify-center text-zinc-950 text-xs sm:text-sm font-bold shadow-xs">A</div>
        </div>
      </header>

      <div className="lg:flex lg:flex-1 lg:overflow-hidden bg-[#F7F7FA] dark:bg-[#0A0A0D]">
        {!kpi ? (
          loadError ? (
            <div className="flex w-full flex-1 flex-col items-center justify-center gap-3 px-4 py-20 text-center">
              <div className="w-12 h-12 rounded-2xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-red-500 dark:text-red-400" />
              </div>
              <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">No se pudieron cargar los datos</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Revisa la conexión e inténtalo de nuevo.</p>
              <button
                type="button"
                onClick={loadAll}
                disabled={refreshing}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-strong text-zinc-950 text-sm font-semibold transition-colors disabled:opacity-50 active:scale-95"
              >
                Reintentar
              </button>
            </div>
          ) : (
            <div className="flex w-full flex-1 flex-col items-center justify-center gap-3 py-24 text-center">
              <RefreshCw className="w-6 h-6 animate-spin text-brand-strong dark:text-brand" />
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Cargando panel...</p>
            </div>
          )
        ) : (
          <div className="lg:h-full lg:grid lg:grid-cols-3 gap-0 lg:gap-3 p-2 sm:p-3 lg:p-4">
            {/* Left Column */}
            <div className="lg:col-span-2 lg:overflow-y-auto space-y-2 lg:space-y-3 pb-4 lg:pb-0">
              {/* KPI Cards */}
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 lg:gap-3">
                <KpiCard icon={ShoppingBag} label="Pedidos totales" value={String(kpi.totalOrders)} color="bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400" />
                <KpiCard icon={Store} label="Comercios" value={`${kpi.activeCommerces}/${kpi.totalCommerces}`} color="bg-brand/10 text-brand-strong dark:bg-brand/15 dark:text-brand" />
                <KpiCard icon={Truck} label="Repartidores (Activos)" value={String(kpi.onlineDrivers)} color="bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400" />
                <KpiCard icon={Users} label="Clientes" value={String(kpi.totalCustomers)} color="bg-purple-100 text-purple-600 dark:bg-purple-500/15 dark:text-purple-400" />
              </div>

              {/* Revenue + Sales Chart */}
              <div className={`${CARD_CLASS} p-3 lg:p-4`}>
                <div className="flex items-center justify-between mb-2 lg:mb-3">
                  <div>
                    <p className="text-[10px] lg:text-xs text-zinc-500 dark:text-zinc-400 font-medium">Facturación total</p>
                    <p className="text-xl lg:text-2xl font-black text-zinc-900 dark:text-zinc-100">${kpi.totalRevenue}</p>
                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">Pedidos entregados</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] lg:text-xs text-zinc-500 dark:text-zinc-400 font-medium">Comisiones</p>
                    <p className="text-base lg:text-xl font-extrabold text-brand-strong dark:text-brand">${kpi.totalCommission}</p>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                  <div>
                    <h2 className="text-xs lg:text-sm font-bold text-zinc-800 dark:text-zinc-200">Ventas Totales de Comercios (Bruto)</h2>
                    {growthPercent !== null && (
                      <div className={`flex items-center gap-1 mt-0.5 text-[10px] lg:text-xs font-semibold ${growthPercent >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                        {growthPercent >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                        <span>
                          {growthPercent >= 0 ? "+" : ""}{growthPercent}% vs {growthWindowDays ?? 30} días anteriores
                        </span>
                      </div>
                    )}
                  </div>
                  <PeriodTabs value={period} onChange={setPeriod} className="self-start sm:self-auto" />
                </div>
                <div className="h-28 lg:h-36 text-zinc-500 dark:text-zinc-400">
                  {salesData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={salesData.slice(-12)}>
                        <XAxis dataKey="date" tick={axisTick} tickFormatter={(v) => v.slice(-5)} axisLine={axisLine} tickLine={axisLine} />
                        <YAxis tick={axisTick} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} axisLine={axisLine} tickLine={axisLine} />
                        <Tooltip
                          cursor={{ fill: "currentColor", opacity: 0.12 }}
                          contentStyle={tooltipContentStyle}
                          labelStyle={tooltipLabelStyle}
                          itemStyle={tooltipItemStyle}
                          formatter={(value: any) => [`$${Number(value || 0).toFixed(2)}`, "Ventas"]}
                        />
                        <Bar dataKey="sales" fill={BRAND} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <ChartEmpty />
                  )}
                </div>
              </div>

              {/* Comisiones Chart */}
              <div className={`${CARD_CLASS} p-2.5 sm:p-3 lg:p-4`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2 mb-2 lg:mb-3">
                  <h2 className="text-xs lg:text-sm font-semibold text-zinc-800 dark:text-zinc-200">Tu Ganancia: Comisiones a Comercios</h2>
                  <PeriodTabs value={period} onChange={setPeriod} className="self-start sm:self-auto" />
                </div>
                <div className="h-40 lg:h-52 text-zinc-500 dark:text-zinc-400">
                  {earningsData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={earningsData.slice(-12)}>
                        <XAxis dataKey="date" tick={axisTick} tickFormatter={(v) => v.slice(-5)} axisLine={axisLine} tickLine={axisLine} />
                        <YAxis tick={axisTick} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} axisLine={axisLine} tickLine={axisLine} />
                        <Tooltip
                          cursor={{ fill: "currentColor", opacity: 0.12 }}
                          contentStyle={tooltipContentStyle}
                          labelStyle={tooltipLabelStyle}
                          itemStyle={tooltipItemStyle}
                          formatter={(value: any) => [`$${Number(value || 0).toFixed(2)}`, "Comisión"]}
                        />
                        <Bar dataKey="commission" fill={BRAND} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <ChartEmpty />
                  )}
                </div>
              </div>

              {/* Delivery Net Chart */}
              <div className={`${CARD_CLASS} p-2.5 sm:p-3 lg:p-4`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2 mb-2 lg:mb-3">
                  <h2 className="text-xs lg:text-sm font-semibold text-zinc-800 dark:text-zinc-200">Tu Ganancia: Envíos (Neto)</h2>
                  <PeriodTabs value={period} onChange={setPeriod} className="self-start sm:self-auto" />
                </div>
                <div className="h-40 lg:h-52 text-zinc-500 dark:text-zinc-400">
                  {earningsData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={earningsData.slice(-12)}>
                        <XAxis dataKey="date" tick={axisTick} tickFormatter={(v) => v.slice(-5)} axisLine={axisLine} tickLine={axisLine} />
                        <YAxis tick={axisTick} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} axisLine={axisLine} tickLine={axisLine} />
                        <Tooltip
                          cursor={{ fill: "currentColor", opacity: 0.12 }}
                          contentStyle={tooltipContentStyle}
                          labelStyle={tooltipLabelStyle}
                          itemStyle={tooltipItemStyle}
                          formatter={(value: any) => [`$${Number(value || 0).toFixed(2)}`, "Neto Envíos"]}
                        />
                        <Bar dataKey="deliveryNet" fill={BRAND} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <ChartEmpty />
                  )}
                </div>
              </div>

              {/* Admin Delivery Earnings */}
              {adminDeliveryEarnings && (
                <div className="bg-brand rounded-xl card-shadow dark:shadow-none p-3 lg:p-4 text-zinc-950">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="w-4 h-4" />
                    <h2 className="text-xs lg:text-sm font-semibold">Ganancias del admin (costos de envio)</h2>
                  </div>
                  <div className="grid grid-cols-3 gap-2 lg:gap-4">
                    <div>
                      <p className="text-[9px] lg:text-[10px] text-zinc-950">Total cobrado</p>
                      <p className="text-sm lg:text-xl font-bold">${adminDeliveryEarnings.totalDeliveryFees}</p>
                    </div>
                    <div>
                      <p className="text-[9px] lg:text-[10px] text-zinc-950">Pagado a repartidores</p>
                      <p className="text-sm lg:text-xl font-bold">-${adminDeliveryEarnings.totalDriverPayouts}</p>
                    </div>
                    <div>
                      <p className="text-[9px] lg:text-[10px] text-zinc-950">Ganancia neta</p>
                      <p className="text-sm lg:text-xl font-bold">${adminDeliveryEarnings.adminNet}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Categories + Commerces Ranking */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-1.5 lg:gap-3">
                <div className={`${CARD_CLASS} p-2 lg:p-4`}>
                  <h2 className="text-xs lg:text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-2 lg:mb-3">Categorias mas vendidas</h2>
                  <div className="space-y-1.5 lg:space-y-2">
                    {topCategories.slice(0, 5).map((cat, i) => (
                      <div key={cat.id} className="flex items-center gap-2 lg:gap-3">
                        <span className={`w-5 h-5 lg:w-6 lg:h-6 rounded-full flex items-center justify-center text-[10px] lg:text-xs font-bold ${i < 3 ? "bg-brand text-zinc-950" : "bg-zinc-100 dark:bg-white/10 text-zinc-600 dark:text-zinc-300"}`}>
                          {i + 1}
                        </span>
                        <div className="flex-1 flex justify-between items-center">
                          <p className="text-xs lg:text-sm font-medium text-zinc-800 dark:text-zinc-200">{cat.name}</p>
                          <p className="text-[10px] lg:text-xs text-zinc-500 dark:text-zinc-400">${cat.sales.toFixed(2)}</p>
                        </div>
                      </div>
                    ))}
                    {topCategories.length === 0 && <p className="text-xs text-zinc-500 dark:text-zinc-400">Sin datos</p>}
                  </div>
                </div>

                <div className={`${CARD_CLASS} p-2 lg:p-4`}>
                  <h2 className="text-xs lg:text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-2 lg:mb-3">Comercios mas vendidos</h2>
                  <div className="space-y-1.5 lg:space-y-2">
                    {topCommerces.slice(0, 5).map((comm, i) => (
                      <div key={comm.id} className="flex items-center gap-2 lg:gap-3">
                        <span className={`w-5 h-5 lg:w-6 lg:h-6 rounded-full flex items-center justify-center text-[10px] lg:text-xs font-bold ${i < 3 ? "bg-brand text-zinc-950" : "bg-zinc-100 dark:bg-white/10 text-zinc-600 dark:text-zinc-300"}`}>
                          {i + 1}
                        </span>
                        <div className="flex-1 flex justify-between items-center min-w-0">
                          <p className="text-xs lg:text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate mr-2">{comm.name}</p>
                          <div className="flex items-center gap-2 text-[10px] lg:text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                            <span>{comm.orders} ped.</span>
                            <span>${comm.revenue.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                    {topCommerces.length === 0 && <p className="text-xs text-zinc-500 dark:text-zinc-400">Sin datos</p>}
                  </div>
                </div>
              </div>

              {/* Quick Access */}
              <div className={`${CARD_CLASS} overflow-hidden`}>
                <div className="p-2 lg:p-4 border-b border-zinc-100 dark:border-white/10">
                  <h2 className="text-xs lg:text-sm font-semibold text-zinc-800 dark:text-zinc-200">Acceso rapido</h2>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-1 p-1.5 lg:p-2">
                  {[
                    { label: "Comercios", path: "/admin/commerces", icon: Store },
                    { label: "Repartidores", path: "/admin/drivers", icon: Truck },
                    { label: "Pedidos", path: "/admin/orders", icon: ShoppingBag },
                    { label: "Configurar", path: "/admin/settings", icon: Settings },
                  ].map((link) => (
                    <button key={link.path} type="button" onClick={() => navigate(link.path)} className="min-h-[44px] flex items-center justify-between bg-zinc-50 hover:bg-zinc-100 dark:bg-[#16161B] dark:hover:bg-white/10 rounded-lg p-2 lg:p-3 transition-colors">
                      <div className="flex items-center gap-2">
                        <link.icon className="w-4 h-4 text-brand-strong dark:text-brand" />
                        <span className="text-xs lg:text-sm text-zinc-700 dark:text-zinc-200 font-medium">{link.label}</span>
                      </div>
                      <ChevronRight className="w-3 h-3 text-zinc-500 dark:text-zinc-400 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column — scrollable tables */}
            <div className="flex flex-col gap-3 lg:overflow-hidden mt-2 lg:mt-0 pb-4 lg:pb-0">
              {/* Commerce Commissions */}
              <div className={`${CARD_CLASS} flex-1 flex flex-col lg:overflow-hidden`}>
                <div className="p-3.5 border-b border-zinc-100 dark:border-white/10 shrink-0">
                  <h2 className="text-xs sm:text-sm font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
                    <Percent className="w-4 h-4 text-brand-strong dark:text-brand" />
                    Comisiones por comercio
                  </h2>
                </div>
                {commerceCommissions.length > 0 ? (
                  <div className="flex-1 overflow-y-auto">
                    {/* Desktop Table */}
                    <table className="hidden lg:table w-full text-[11px]">
                      <thead className="bg-zinc-50 dark:bg-[#16161B] text-zinc-500 dark:text-zinc-400 sticky top-0 z-10">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">Comercio</th>
                          <th className="text-right px-3 py-2 font-medium">%</th>
                          <th className="text-right px-3 py-2 font-medium">Comision</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
                        {commerceCommissions.map((c) => (
                          <tr key={c.commerceId} className="hover:bg-zinc-50 dark:hover:bg-white/5">
                            <td className="px-3 py-2 text-zinc-800 dark:text-zinc-200 font-medium truncate max-w-[120px]">{c.name}</td>
                            <td className="px-3 py-2 text-right text-zinc-600 dark:text-zinc-400">{c.commissionRate}%</td>
                            <td className="px-3 py-2 text-right text-brand-strong dark:text-brand font-semibold">${c.commissionEarned}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Mobile Native List */}
                    <div className="lg:hidden flex flex-col divide-y divide-zinc-100 dark:divide-white/5">
                      {commerceCommissions.map((c) => (
                        <div key={c.commerceId} className="flex items-center justify-between p-3 active:bg-zinc-50 dark:active:bg-white/5 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-brand/10 dark:bg-brand/15 flex items-center justify-center shrink-0">
                              <Store className="w-4 h-4 text-brand-strong dark:text-brand" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{c.name}</p>
                              <p className="text-xs text-zinc-500 dark:text-zinc-400">Tasa de comisión: {c.commissionRate}%</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-brand-strong dark:text-brand">${c.commissionEarned}</p>
                            <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Total a cobrar</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <TableEmpty />
                )}
              </div>

              {/* Driver Earnings */}
              <div className={`${CARD_CLASS} flex-1 flex flex-col lg:overflow-hidden`}>
                <div className="p-3.5 border-b border-zinc-100 dark:border-white/10 shrink-0">
                  <h2 className="text-xs sm:text-sm font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
                    <Truck className="w-4 h-4 text-brand-strong dark:text-brand" />
                    Comisiones por Repartidor
                  </h2>
                </div>
                {driverEarnings.length > 0 ? (
                  <div className="flex-1 overflow-y-auto">
                    {/* Desktop Table */}
                    <table className="hidden lg:table w-full text-[11px]">
                      <thead className="bg-zinc-50 dark:bg-[#16161B] text-zinc-500 dark:text-zinc-400 sticky top-0 z-10">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">Repartidor</th>
                          <th className="text-right px-3 py-2 font-medium">Ganancia Repartidor</th>
                          <th className="text-right px-3 py-2 font-medium">Tu Comisión</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
                        {driverEarnings.map((d) => (
                          <tr key={d.driverId} className="hover:bg-zinc-50 dark:hover:bg-white/5">
                            <td className="px-3 py-2 text-zinc-800 dark:text-zinc-200 font-medium truncate max-w-[100px]">{d.name}</td>
                            <td className="px-3 py-2 text-right text-zinc-600 dark:text-zinc-400">${d.total}</td>
                            <td className="px-3 py-2 text-right text-brand-strong dark:text-brand font-semibold">${d.adminCommission}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Mobile Native List */}
                    <div className="lg:hidden flex flex-col divide-y divide-zinc-100 dark:divide-white/5">
                      {driverEarnings.map((d) => (
                        <div key={d.driverId} className="p-3 active:bg-zinc-50 dark:active:bg-white/5 transition-colors">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-500/15 flex items-center justify-center shrink-0">
                                <Truck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                              </div>
                              <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{d.name}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold text-brand-strong dark:text-brand">${d.adminCommission}</p>
                              <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Tu Comisión</p>
                            </div>
                          </div>
                          <div className="bg-zinc-50 dark:bg-[#16161B] rounded-lg p-2 text-center">
                            <div>
                              <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Ganancia Repartidor</p>
                              <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">${d.total}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <TableEmpty />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function PeriodTabs({
  value,
  onChange,
  className = "",
}: {
  value: Period;
  onChange: (period: Period) => void;
  className?: string;
}) {
  return (
    <div className={`flex bg-zinc-100 dark:bg-white/5 rounded-lg p-0.5 shrink-0 ${className}`}>
      {(["day", "week", "month", "year"] as Period[]).map((p) => {
        const isActive = value === p;
        return (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-pressed={isActive}
            className={`min-h-11 min-w-11 px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-semibold rounded-md transition-all active:scale-95 ${
              isActive
                ? "bg-white dark:bg-[#26262C] text-brand-strong dark:text-brand shadow-xs"
                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100"
            }`}
          >
            {p === "day" ? "Día" : p === "week" ? "Semana" : p === "month" ? "Mes" : "Año"}
          </button>
        );
      })}
    </div>
  );
}

function ChartEmpty() {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-1.5 text-zinc-500 dark:text-zinc-400">
      <BarChart3 className="w-5 h-5" />
      <span className="text-xs">Sin datos</span>
    </div>
  );
}

function TableEmpty() {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 p-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
      <BarChart3 className="w-5 h-5" />
      <span>Sin datos</span>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string; color: string }) {
  return (
    <div className={`${CARD_CLASS} p-2.5 sm:p-3 lg:p-4 flex flex-col items-start gap-1 sm:gap-1.5 transition-all min-w-0`}>
      <div className={`w-7 h-7 sm:w-8 sm:h-8 lg:w-9 lg:h-9 rounded-xl flex shrink-0 items-center justify-center ${color}`}>
        <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 lg:w-4.5 lg:h-4.5" />
      </div>
      <div className="min-w-0 w-full">
        <p className="text-base sm:text-lg lg:text-xl font-extrabold text-zinc-900 dark:text-zinc-100 leading-tight truncate">{value}</p>
        <p className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400 font-medium leading-tight truncate">{label}</p>
      </div>
    </div>
  );
}