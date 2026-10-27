import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router";
import {
  ShoppingBag, Store, Users, Truck,
  TrendingUp, TrendingDown, Settings,
  DollarSign, Percent, RefreshCw, ChevronRight,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { trpcCall } from "@/hooks/useDeliveryData";
import { useAdminSSE } from "@/hooks/useAdminSSE";
import AdminLayout from "@/components/AdminLayout";

type Period = "day" | "week" | "month" | "year";

type SaleData = { date: string; sales: number; orders: number };
type EarningData = { date: string; commission: number; deliveryNet: number };

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [kpi, setKpi] = useState<any>(null);
  const [salesData, setSalesData] = useState<SaleData[]>([]);
  const [earningsData, setEarningsData] = useState<EarningData[]>([]);
  const [period, setPeriod] = useState<Period>("month");
  const [growthPercent, setGrowthPercent] = useState<number | null>(null);
  const [topCategories, setTopCategories] = useState<any[]>([]);
  const [topCommerces, setTopCommerces] = useState<any[]>([]);
  const [commerceCommissions, setCommerceCommissions] = useState<any[]>([]);
  const [driverEarnings, setDriverEarnings] = useState<any[]>([]);
  const [adminDeliveryEarnings, setAdminDeliveryEarnings] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<number>(Date.now());
  const [secondsAgo, setSecondsAgo] = useState(0);
  const prevPeriodRef = useRef<Period>(period);

  const loadCharts = useCallback(async (p: Period) => {
    try {
      const [sales, earnings] = await Promise.all([
        trpcCall<SaleData[]>("admin.salesByPeriod", { period: p }),
        trpcCall<EarningData[]>("admin.earningsByPeriod", { period: p }),
      ]);
      setSalesData(sales || []);
      setEarningsData(earnings || []);

      const prevPeriod = prevPeriodRef.current;
      prevPeriodRef.current = p;
      if (prevPeriod !== p) {
        const prevData = await trpcCall<SaleData[]>("admin.salesByPeriod", { period: prevPeriod });
        const currentTotal = (sales || []).reduce((s: number, d: SaleData) => s + d.sales, 0);
        const prevTotal = (prevData || []).reduce((s: number, d: SaleData) => s + d.sales, 0);
        if (prevTotal > 0) {
          setGrowthPercent(parseFloat(((currentTotal - prevTotal) / prevTotal * 100).toFixed(1)));
        } else {
          setGrowthPercent(null);
        }
      }
    } catch (error) {
      alert("Error al cargar los gráficos");
      setGrowthPercent(null);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      trpcCall<any>("admin.dashboard").then(setKpi).catch(console.error),
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

  return (
    <AdminLayout>
      <header className="bg-white border-b border-gray-200 px-3 lg:px-6 py-2.5 lg:py-3.5 flex items-center justify-between shrink-0">
        <h1 className="text-base lg:text-lg font-bold text-gray-800">Panel administrativo</h1>
        <div className="flex items-center gap-2 lg:gap-4">
          <div className="hidden sm:flex items-center gap-2 text-xs text-gray-400">
            <span className={`inline-block w-2 h-2 rounded-full ${connected ? "bg-green-500 animate-pulse" : "bg-amber-500"}`} />
            <span className="font-medium text-gray-600">{connected ? "En vivo" : "Reconectando..."}</span>
            <span className="text-gray-300 mx-1">|</span>
            <span>Actualizado hace {secondsAgo}s</span>
          </div>
          <button
            onClick={loadAll}
            disabled={refreshing}
            className="min-h-[36px] flex items-center gap-1.5 text-xs text-[#2E7D32] font-semibold hover:bg-green-50 px-3 py-1.5 rounded-xl border border-green-200 transition-colors disabled:opacity-50 active:scale-95 shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            <span>Recargar</span>
          </button>
          <div className="w-8 h-8 bg-[#2E7D32] rounded-full flex items-center justify-center text-white text-xs lg:text-sm font-bold shadow-xs">A</div>
        </div>
      </header>

      <div className="lg:flex lg:flex-1 lg:overflow-hidden">
        {!kpi ? (
          <div className="text-center py-12 text-gray-500 text-sm">Cargando...</div>
        ) : (
          <div className="lg:h-full lg:grid lg:grid-cols-3 gap-0 lg:gap-3 p-2 sm:p-3 lg:p-4">
            {/* Left Column */}
            <div className="lg:col-span-2 lg:overflow-y-auto space-y-2 lg:space-y-3 pb-4 lg:pb-0">
              {/* KPI Cards */}
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 lg:gap-3">
                <KpiCard icon={ShoppingBag} label="Pedidos totales" value={String(kpi.totalOrders)} color="bg-blue-100 text-blue-600" />
                <KpiCard icon={Store} label="Comercios" value={`${kpi.activeCommerces}/${kpi.totalCommerces}`} color="bg-green-100 text-green-600" />
                <KpiCard icon={Truck} label="Repartidores (Activos)" value={String(kpi.onlineDrivers)} color="bg-orange-100 text-orange-600" />
                <KpiCard icon={Users} label="Clientes" value={String(kpi.totalCustomers)} color="bg-purple-100 text-purple-600" />
              </div>

              {/* Revenue + Sales Chart */}
              <div className="bg-white rounded-xl card-shadow p-3 lg:p-4">
                <div className="flex items-center justify-between mb-2 lg:mb-3">
                  <div>
                    <p className="text-[10px] lg:text-xs text-gray-500 font-medium">Facturación total</p>
                    <p className="text-xl lg:text-2xl font-black text-gray-900">${kpi.totalRevenue}</p>
                    {growthPercent !== null && (
                      <div className={`flex items-center gap-1 mt-0.5 text-[10px] lg:text-xs font-semibold ${growthPercent >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {growthPercent >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                        <span>{growthPercent >= 0 ? "+" : ""}{growthPercent}% vs periodo anterior</span>
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] lg:text-xs text-gray-500 font-medium">Comisiones</p>
                    <p className="text-base lg:text-xl font-extrabold text-[#2E7D32]">${kpi.totalCommission}</p>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                  <h2 className="text-xs lg:text-sm font-bold text-gray-800">Ventas Totales de Comercios (Bruto)</h2>
                  <div className="flex bg-gray-100 rounded-lg p-0.5 shrink-0 self-start sm:self-auto">
                    {(["day", "week", "month", "year"] as Period[]).map((p) => (
                      <button
                        key={p}
                        onClick={() => setPeriod(p)}
                        className={`min-h-[28px] px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-semibold rounded-md transition-all active:scale-95 ${period === p ? "bg-white text-[#2E7D32] shadow-xs" : "text-gray-500 hover:text-gray-800"}`}
                      >
                        {p === "day" ? "Día" : p === "week" ? "Semana" : p === "month" ? "Mes" : "Año"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="h-28 lg:h-36">
                  {salesData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={salesData.slice(-12)}>
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(-5)} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                        <Tooltip formatter={(value: number) => [`$${value.toFixed(2)}`, "Ventas"]} />
                        <Bar dataKey="sales" fill="#2E7D32" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-gray-400 text-xs">Sin datos</div>
                  )}
                </div>
              </div>

              {/* Comisiones Chart */}
              <div className="bg-white rounded-xl card-shadow p-2 lg:p-4">
                <div className="flex items-center justify-between mb-2 lg:mb-3">
                  <h2 className="text-xs lg:text-sm font-semibold text-gray-800">Tu Ganancia: Comisiones a Comercios</h2>
                  <div className="flex bg-gray-100 rounded-lg p-0.5">
                    {(["day", "week", "month", "year"] as Period[]).map((p) => (
                      <button
                        key={`comm-${p}`}
                        onClick={() => setPeriod(p)}
                        className={`px-2 lg:px-3 py-1 text-[10px] lg:text-xs font-medium rounded-md transition-colors ${period === p ? "bg-white text-[#2E7D32] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                      >
                        {p === "day" ? "Dia" : p === "week" ? "Semana" : p === "month" ? "Mes" : "Año"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="h-40 lg:h-52">
                  {earningsData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={earningsData.slice(-12)}>
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(-5)} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                        <Tooltip formatter={(value: number) => [`$${value.toFixed(2)}`, "Comisión"]} />
                        <Bar dataKey="commission" fill="#2E7D32" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-gray-400 text-xs">Sin datos</div>
                  )}
                </div>
              </div>

              {/* Delivery Net Chart */}
              <div className="bg-white rounded-xl card-shadow p-2 lg:p-4">
                <div className="flex items-center justify-between mb-2 lg:mb-3">
                  <h2 className="text-xs lg:text-sm font-semibold text-gray-800">Tu Ganancia: Envíos (Neto)</h2>
                  <div className="flex bg-gray-100 rounded-lg p-0.5">
                    {(["day", "week", "month", "year"] as Period[]).map((p) => (
                      <button
                        key={`del-${p}`}
                        onClick={() => setPeriod(p)}
                        className={`px-2 lg:px-3 py-1 text-[10px] lg:text-xs font-medium rounded-md transition-colors ${period === p ? "bg-white text-[#2E7D32] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                      >
                        {p === "day" ? "Dia" : p === "week" ? "Semana" : p === "month" ? "Mes" : "Año"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="h-40 lg:h-52">
                  {earningsData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={earningsData.slice(-12)}>
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(-5)} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                        <Tooltip formatter={(value: number) => [`$${value.toFixed(2)}`, "Neto Envíos"]} />
                        <Bar dataKey="deliveryNet" fill="#2E7D32" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-gray-400 text-xs">Sin datos</div>
                  )}
                </div>
              </div>

              {/* Admin Delivery Earnings */}
              {adminDeliveryEarnings && (
                <div className="bg-gradient-to-r from-[#2E7D32] to-[#388E3C] rounded-xl card-shadow p-3 lg:p-4 text-white">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="w-4 h-4" />
                    <h2 className="text-xs lg:text-sm font-semibold">Ganancias del admin (costos de envio)</h2>
                  </div>
                  <div className="grid grid-cols-3 gap-2 lg:gap-4">
                    <div>
                      <p className="text-[9px] lg:text-[10px] text-white/70">Total cobrado</p>
                      <p className="text-sm lg:text-xl font-bold">${adminDeliveryEarnings.totalDeliveryFees}</p>
                    </div>
                    <div>
                      <p className="text-[9px] lg:text-[10px] text-white/70">Pagado a repartidores</p>
                      <p className="text-sm lg:text-xl font-bold">-${adminDeliveryEarnings.totalDriverPayouts}</p>
                    </div>
                    <div>
                      <p className="text-[9px] lg:text-[10px] text-white/70">Ganancia neta</p>
                      <p className="text-sm lg:text-xl font-bold">${adminDeliveryEarnings.adminNet}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Categories + Commerces Ranking */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-1.5 lg:gap-3">
                <div className="bg-white rounded-xl card-shadow p-2 lg:p-4">
                  <h2 className="text-xs lg:text-sm font-semibold text-gray-800 mb-2 lg:mb-3">Categorias mas vendidas</h2>
                  <div className="space-y-1.5 lg:space-y-2">
                    {topCategories.slice(0, 5).map((cat, i) => (
                      <div key={cat.id} className="flex items-center gap-2 lg:gap-3">
                        <span className={`w-5 h-5 lg:w-6 lg:h-6 rounded-full flex items-center justify-center text-[10px] lg:text-xs font-bold ${i < 3 ? "bg-[#2E7D32] text-white" : "bg-gray-100 text-gray-600"}`}>
                          {i + 1}
                        </span>
                        <div className="flex-1 flex justify-between items-center">
                          <p className="text-xs lg:text-sm font-medium text-gray-800">{cat.name}</p>
                          <p className="text-[10px] lg:text-xs text-gray-500">${cat.sales.toFixed(2)}</p>
                        </div>
                      </div>
                    ))}
                    {topCategories.length === 0 && <p className="text-xs text-gray-400">Sin datos</p>}
                  </div>
                </div>

                <div className="bg-white rounded-xl card-shadow p-2 lg:p-4">
                  <h2 className="text-xs lg:text-sm font-semibold text-gray-800 mb-2 lg:mb-3">Comercios mas vendidos</h2>
                  <div className="space-y-1.5 lg:space-y-2">
                    {topCommerces.slice(0, 5).map((comm, i) => (
                      <div key={comm.id} className="flex items-center gap-2 lg:gap-3">
                        <span className={`w-5 h-5 lg:w-6 lg:h-6 rounded-full flex items-center justify-center text-[10px] lg:text-xs font-bold ${i < 3 ? "bg-[#2E7D32] text-white" : "bg-gray-100 text-gray-600"}`}>
                          {i + 1}
                        </span>
                        <div className="flex-1 flex justify-between items-center min-w-0">
                          <p className="text-xs lg:text-sm font-medium text-gray-800 truncate mr-2">{comm.name}</p>
                          <div className="flex items-center gap-2 text-[10px] lg:text-xs text-gray-500 whitespace-nowrap">
                            <span>{comm.orders} ped.</span>
                            <span>${comm.revenue.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                    {topCommerces.length === 0 && <p className="text-xs text-gray-400">Sin datos</p>}
                  </div>
                </div>
              </div>

              {/* Quick Access */}
              <div className="bg-white rounded-xl card-shadow overflow-hidden">
                <div className="p-2 lg:p-4 border-b border-gray-100">
                  <h2 className="text-xs lg:text-sm font-semibold text-gray-800">Acceso rapido</h2>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-1 p-1.5 lg:p-2">
                  {[
                    { label: "Comercios", path: "/admin/commerces", icon: Store },
                    { label: "Repartidores", path: "/admin/drivers", icon: Truck },
                    { label: "Pedidos", path: "/admin/orders", icon: ShoppingBag },
                    { label: "Configurar", path: "/admin/settings", icon: Settings },
                  ].map((link) => (
                    <button key={link.path} onClick={() => navigate(link.path)} className="flex items-center justify-between bg-gray-50 hover:bg-gray-100 rounded-lg p-2 lg:p-3 transition-colors">
                      <div className="flex items-center gap-2">
                        <link.icon className="w-4 h-4 text-[#2E7D32]" />
                        <span className="text-xs lg:text-sm text-gray-700 font-medium">{link.label}</span>
                      </div>
                      <ChevronRight className="w-3 h-3 text-gray-400 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column — scrollable tables */}
            <div className="flex flex-col gap-3 lg:overflow-hidden mt-2 lg:mt-0 pb-4 lg:pb-0">
              {/* Commerce Commissions */}
              <div className="bg-white rounded-xl card-shadow flex-1 flex flex-col lg:overflow-hidden">
                <div className="p-3.5 border-b border-gray-100 shrink-0">
                  <h2 className="text-xs sm:text-sm font-bold text-gray-800 flex items-center gap-2">
                    <Percent className="w-4 h-4 text-[#2E7D32]" />
                    Comisiones por comercio
                  </h2>
                </div>
                {commerceCommissions.length > 0 ? (
                  <div className="flex-1 overflow-y-auto">
                    {/* Desktop Table */}
                    <table className="hidden lg:table w-full text-[11px]">
                      <thead className="bg-gray-50 text-gray-500 sticky top-0 z-10">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">Comercio</th>
                          <th className="text-right px-3 py-2 font-medium">%</th>
                          <th className="text-right px-3 py-2 font-medium">Comision</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {commerceCommissions.map((c) => (
                          <tr key={c.commerceId} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-800 font-medium truncate max-w-[120px]">{c.name}</td>
                            <td className="px-3 py-2 text-right text-gray-600">{c.commissionRate}%</td>
                            <td className="px-3 py-2 text-right text-[#2E7D32] font-semibold">${c.commissionEarned}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Mobile Native List */}
                    <div className="lg:hidden flex flex-col divide-y divide-gray-100">
                      {commerceCommissions.map((c) => (
                        <div key={c.commerceId} className="flex items-center justify-between p-3 active:bg-gray-50 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
                              <Store className="w-4 h-4 text-[#2E7D32]" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-gray-800">{c.name}</p>
                              <p className="text-xs text-gray-500">Tasa de comisión: {c.commissionRate}%</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-[#2E7D32]">${c.commissionEarned}</p>
                            <p className="text-[10px] text-gray-400">Total a cobrar</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-4 text-center text-xs text-gray-400">Sin datos</div>
                )}
              </div>

              {/* Driver Earnings */}
              <div className="bg-white rounded-xl card-shadow flex-1 flex flex-col lg:overflow-hidden">
                <div className="p-3.5 border-b border-gray-100 shrink-0">
                  <h2 className="text-xs sm:text-sm font-bold text-gray-800 flex items-center gap-2">
                    <Truck className="w-4 h-4 text-[#2E7D32]" />
                    Comisiones por Repartidor
                  </h2>
                </div>
                {driverEarnings.length > 0 ? (
                  <div className="flex-1 overflow-y-auto">
                    {/* Desktop Table */}
                    <table className="hidden lg:table w-full text-[11px]">
                      <thead className="bg-gray-50 text-gray-500 sticky top-0 z-10">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">Repartidor</th>
                          <th className="text-right px-3 py-2 font-medium">Ganancia Repartidor</th>
                          <th className="text-right px-3 py-2 font-medium">Tu Comisión</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {driverEarnings.map((d) => (
                          <tr key={d.driverId} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-800 font-medium truncate max-w-[100px]">{d.name}</td>
                            <td className="px-3 py-2 text-right text-gray-600">${d.total}</td>
                            <td className="px-3 py-2 text-right text-[#2E7D32] font-semibold">${d.adminCommission}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Mobile Native List */}
                    <div className="lg:hidden flex flex-col divide-y divide-gray-100">
                      {driverEarnings.map((d) => (
                        <div key={d.driverId} className="p-3 active:bg-gray-50 transition-colors">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                                <Truck className="w-4 h-4 text-blue-600" />
                              </div>
                              <p className="text-sm font-semibold text-gray-800">{d.name}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold text-[#2E7D32]">${d.adminCommission}</p>
                              <p className="text-[10px] text-gray-400">Tu Comisión</p>
                            </div>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-2 text-center">
                            <div>
                              <p className="text-[10px] text-gray-500">Ganancia Repartidor</p>
                              <p className="text-xs font-semibold text-gray-700">${d.total}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-4 text-center text-xs text-gray-400">Sin datos</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function KpiCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string; color: string }) {
  return (
    <div className="bg-white rounded-xl card-shadow p-2.5 sm:p-3 lg:p-4 flex lg:flex-col items-center lg:items-start gap-2.5 lg:gap-1.5 transition-all">
      <div className={`w-8 h-8 lg:w-9 lg:h-9 rounded-xl flex shrink-0 items-center justify-center ${color}`}>
        <Icon className="w-4 h-4 lg:w-4.5 lg:h-4.5" />
      </div>
      <div className="min-w-0">
        <p className="text-base sm:text-lg lg:text-xl font-extrabold text-gray-900 leading-tight">{value}</p>
        <p className="text-[10px] sm:text-xs text-gray-500 font-medium leading-tight truncate">{label}</p>
      </div>
    </div>
  );
}
