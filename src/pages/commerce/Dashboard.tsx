/**
 * @archivo src/pages/commerce/Dashboard.tsx
 * @modulo 03-commerce-panel (Dashboard Principal del Comercio)
 * @proposito
 *   Vista operativa del negocio: estado del local, métricas del día y pedidos
 *   que requieren acción. Sin duplicar la navegación ni los listados completos
 *   que ya viven en /commerce/orders, /commerce/products y /commerce/stats.
 */

import { useNavigate } from "react-router";
import { useState } from "react";
import {
  ArrowRight,
  ChevronRight,
  DollarSign,
  Flame,
  Package,
  Power,
  ShoppingBag,
  Store,
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
import { getCommerceOrderStatus, getOrderStatusMeta } from "@contracts/orderStatus";

const ACTIVE_STATUSES = ["received", "accepted", "preparing", "ready_for_pickup"];

function visibleStatus(order: any): string {
  return getCommerceOrderStatus(order.status, order.myCommerceStatus);
}

function statusTone(status: string): string {
  if (["received", "accepted", "preparing"].includes(status)) {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300";
  }
  if (status === "ready_for_pickup") {
    return "border-[#FF6A00]/30 bg-[#FF6A00]/10 text-[#C25200] dark:text-[#FF8533]";
  }
  if (status === "delivered") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300";
  }
  if (status === "cancelled") {
    return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300";
  }
  return "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300";
}

function guayaquilKey(value: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  alert = false,
}: {
  label: string;
  value: string | number;
  hint: string;
  icon: typeof DollarSign;
  alert?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white p-3.5 shadow-xs dark:border-white/10 dark:bg-[#16161B]">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          {label}
        </span>
        <Icon
          className={`h-3.5 w-3.5 shrink-0 ${alert ? "text-rose-500" : "text-[#FF6A00]"}`}
          aria-hidden="true"
        />
      </div>
      <p className="mt-1.5 text-[22px] font-black leading-none tracking-tight text-zinc-900 dark:text-white">
        {value}
      </p>
      <p
        className={`mt-1 truncate text-[10.5px] font-medium ${
          alert ? "text-rose-600 dark:text-rose-400" : "text-zinc-500 dark:text-zinc-400"
        }`}
      >
        {hint}
      </p>
    </div>
  );
}

export default function CommerceDashboard() {
  const navigate = useNavigate();
  const {
    commerceId,
    loading: commerceLoading,
    error: commerceError,
  } = useMerchantCommerceId();
  const { data: products = [] } = useProductsByCommerce(commerceId || 0);
  const { data: stats } = useCommerceStats(commerceId || 0);
  const { data: commerce, loading: commerceDataLoading, error: commerceDataError } =
    useCommerce(commerceId || 0);
  const { data: orders = [] } = useCommerceOrders(commerceId || 0);
  const toggleCommerceStatus = useToggleCommerceStatus(commerceId || 0);
  const [togglingStatus, setTogglingStatus] = useState(false);

  const isOpen = commerce?.isOpen === "open";
  const isActive = commerce?.status === "active";
  const isSelling = isActive && isOpen;
  const storeName = commerce?.name || "Mi comercio";

  const availableCount = products.filter((p: any) => p.isAvailable === "yes").length;
  const featuredCount = products.filter(
    (p: any) => p.isFeatured === "yes" && p.isAvailable === "yes",
  ).length;

  const pendingOrders = (orders || []).filter((order: any) =>
    ACTIVE_STATUSES.includes(visibleStatus(order)),
  );
  const pendingCount = pendingOrders.length;

  const todayKey = guayaquilKey(new Date());
  // Misma base temporal que las ventas del día: pedidos entregados hoy.
  const todayDeliveredOrders = (orders || []).filter(
    (order: any) =>
      order.status === "delivered" &&
      guayaquilKey(order.deliveredAt ?? order.createdAt ?? new Date()) === todayKey,
  );
  const todaySales = (stats?.dailySales ?? []).find((day: any) => day.date === todayKey)?.sales ?? 0;

  const recentOrders = [...(orders || [])]
    .sort((a: any, b: any) =>
      String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")),
    )
    .slice(0, 3);

  const topProducts =
    stats?.topProducts && stats.topProducts.length > 0
      ? stats.topProducts.slice(0, 3).map((tp: any) => {
          const full = products.find((p: any) => p.id === (tp.id ?? tp.productId));
          return {
            id: tp.id ?? tp.productId,
            name: tp.name || full?.name || "Producto",
            salesCount: tp.salesCount ?? tp.sales ?? 0,
            price: tp.unitPrice ?? full?.price ?? 0,
            imageUrl: full?.imageUrl || full?.image,
          };
        })
      : products.slice(0, 3).map((p: any) => ({
          id: p.id,
          name: p.name,
          salesCount: null,
          price: p.price,
          imageUrl: p.imageUrl || p.image,
        }));

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

  if (commerceLoading || commerceDataLoading) {
    return (
      <CommerceLayout>
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#FF6A00] border-t-transparent" />
        </div>
      </CommerceLayout>
    );
  }

  if (commerceError || commerceDataError) {
    return (
      <CommerceLayout>
        <div className="flex min-h-[50vh] flex-col items-center justify-center p-6 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-500 dark:bg-red-950/40">
            <Store className="h-6 w-6" />
          </div>
          <h2 className="text-sm font-bold text-zinc-800 dark:text-white">No se pudo cargar tu comercio</h2>
          <p className="mt-1 max-w-xs text-xs text-zinc-500 dark:text-zinc-400">
            {(commerceError || commerceDataError)?.message || "Revisa tu conexión e inténtalo de nuevo."}
          </p>
        </div>
      </CommerceLayout>
    );
  }

  if (!commerceId) {
    return (
      <CommerceLayout>
        <div className="flex min-h-[50vh] flex-col items-center justify-center p-6 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-950/40">
            <Store className="h-6 w-6" />
          </div>
          <h2 className="text-sm font-bold text-zinc-800 dark:text-white">Comercio sin asignar</h2>
          <p className="mt-1 max-w-xs text-xs text-zinc-500 dark:text-zinc-400">
            Tu usuario no tiene un comercio vinculado. Contacta a soporte para completar la configuración.
          </p>
        </div>
      </CommerceLayout>
    );
  }

  return (
    <CommerceLayout>
      <div className="mx-auto max-w-5xl space-y-3 px-4 py-4 min-[380px]:px-6">
        {/* Estado del local */}
        <section className="flex flex-col gap-3 rounded-2xl border border-zinc-200/80 bg-white p-3.5 shadow-xs dark:border-white/10 dark:bg-[#16161B] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-[#FF6A00] to-[#FFA040] text-sm font-black text-white shadow-sm shadow-[#FF6A00]/25">
              {storeName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-[15px] font-black leading-tight text-zinc-900 dark:text-white">
                {storeName}
              </h1>
              <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] font-semibold">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    isSelling ? "animate-pulse bg-emerald-500" : "bg-amber-400"
                  }`}
                />
                <span className={isSelling ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
                  {isSelling ? "Operando en vivo" : isActive ? "Local en pausa" : "Comercio no activo"}
                </span>
                <span className="text-zinc-300 dark:text-zinc-600">·</span>
                <span className="truncate text-zinc-500 dark:text-zinc-400">
                  {isSelling
                    ? pendingCount > 0
                      ? `${pendingCount} ${pendingCount === 1 ? "pedido" : "pedidos"} en cocina`
                      : "Sin pedidos pendientes"
                    : "No recibes pedidos"}
                </span>
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handleToggleStore}
              disabled={togglingStatus || !isActive}
              className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[11.5px] font-bold transition-all active:scale-95 disabled:opacity-50 ${
                isSelling
                  ? "border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300"
              }`}
            >
              <Power className="h-3.5 w-3.5" aria-hidden="true" />
              {!isActive ? "Pendiente" : togglingStatus ? "..." : isSelling ? "Pausar" : "Abrir local"}
            </button>

            <button
              type="button"
              onClick={() => navigate("/commerce/orders")}
              className="relative inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#FF6A00] px-3.5 text-[11.5px] font-bold text-white shadow-sm shadow-[#FF6A00]/25 transition-all hover:brightness-110 active:scale-95"
            >
              Ver pedidos
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              {pendingCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-black text-white ring-2 ring-white dark:ring-[#16161B]">
                  {pendingCount}
                </span>
              )}
            </button>
          </div>
        </section>

        {/* Métricas del día */}
        <div className="grid grid-cols-3 gap-2.5">
          <Kpi
            label="Ventas"
            value={`$${Number(todaySales).toFixed(2)}`}
            hint={`Hoy · ticket $${stats?.avgTicket ? stats.avgTicket.toFixed(2) : "0.00"}`}
            icon={DollarSign}
          />
          <Kpi
            label="Entregas"
            value={todayDeliveredOrders.length}
            hint={`Hoy · ${stats?.totalOrders ?? 0} en total`}
            icon={ShoppingBag}
          />
          <Kpi
            label="Cocina"
            value={pendingCount}
            hint={pendingCount > 0 ? "Por preparar" : "Todo al día"}
            icon={Flame}
            alert={pendingCount > 0}
          />
        </div>

        {/* Pedidos + catálogo */}
        <div className="grid gap-3 lg:grid-cols-3">
          <section className="rounded-2xl border border-zinc-200/80 bg-white shadow-xs dark:border-white/10 dark:bg-[#16161B] lg:col-span-2">
            <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-3.5 py-2.5 dark:border-white/5">
              <div className="min-w-0">
                <h2 className="text-[13px] font-extrabold tracking-tight text-zinc-900 dark:text-white">
                  {pendingCount > 0 ? "Pedidos en vivo" : "Últimos pedidos"}
                </h2>
                <p className="text-[10.5px] text-zinc-400 dark:text-zinc-500">
                  {pendingCount > 0 ? "Requieren preparación o retiro" : "Sin pedidos pendientes ahora"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate("/commerce/orders")}
                className="flex shrink-0 items-center gap-1 text-[11px] font-bold text-[#FF6A00] transition-colors hover:text-[#e05d00]"
              >
                Ver todos <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>

            <div className="p-2.5">
              {(pendingCount > 0 ? pendingOrders.slice(0, 4) : recentOrders).length === 0 ? (
                <div className="px-3 py-8 text-center">
                  <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
                    <ShoppingBag className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <p className="text-[12px] font-semibold text-zinc-600 dark:text-zinc-300">
                    Todavía no hay pedidos
                  </p>
                  <p className="mx-auto mt-0.5 max-w-[240px] text-[10.5px] text-zinc-400 dark:text-zinc-500">
                    Cuando un cliente compre en tu local aparecerá acá al instante.
                  </p>
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {(pendingCount > 0 ? pendingOrders.slice(0, 4) : recentOrders).map((order: any) => {
                    const status = visibleStatus(order);
                    const meta = getOrderStatusMeta(status);
                    return (
                      <li key={order.id}>
                        <button
                          type="button"
                          onClick={() => navigate("/commerce/orders")}
                          className="flex w-full items-center justify-between gap-2 rounded-xl border border-transparent px-2.5 py-2 text-left transition-colors hover:border-[#FF6A00]/30 hover:bg-zinc-50 dark:hover:bg-white/5"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[12.5px] font-extrabold text-zinc-900 dark:text-white">
                                #{order.id}
                              </span>
                              <span
                                className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9.5px] font-bold leading-none ${statusTone(status)}`}
                              >
                                {meta.shortLabel}
                              </span>
                            </div>
                            <p className="mt-0.5 truncate text-[10.5px] text-zinc-500 dark:text-zinc-400">
                              {order.customerName || "Cliente"} · {order.items?.length || 0}{" "}
                              {order.items?.length === 1 ? "producto" : "productos"}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <span className="text-[13px] font-black text-[#FF6A00]">
                              ${parseFloat(order.total || 0).toFixed(2)}
                            </span>
                            <ChevronRight className="h-3.5 w-3.5 text-zinc-300 dark:text-zinc-600" aria-hidden="true" />
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          <div className="space-y-3">
            {/* Catálogo */}
            <section className="rounded-2xl border border-zinc-200/80 bg-white p-3.5 shadow-xs dark:border-white/10 dark:bg-[#16161B]">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-1.5 text-[13px] font-extrabold tracking-tight text-zinc-900 dark:text-white">
                  <Package className="h-3.5 w-3.5 text-[#FF6A00]" aria-hidden="true" />
                  Catálogo
                </h2>
                <button
                  type="button"
                  onClick={() => navigate("/commerce/products")}
                  className="text-[11px] font-bold text-[#FF6A00] transition-colors hover:text-[#e05d00]"
                >
                  Gestionar
                </button>
              </div>
              <div className="mt-2.5 grid grid-cols-3 gap-1.5 text-center">
                <div className="rounded-xl bg-zinc-50 py-2 dark:bg-white/5">
                  <p className="text-[15px] font-black leading-none text-zinc-900 dark:text-white">{availableCount}</p>
                  <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-zinc-400">Activos</p>
                </div>
                <div className="rounded-xl bg-zinc-50 py-2 dark:bg-white/5">
                  <p className="text-[15px] font-black leading-none text-zinc-900 dark:text-white">
                    {products.length - availableCount}
                  </p>
                  <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-zinc-400">Agotados</p>
                </div>
                <div className="rounded-xl bg-zinc-50 py-2 dark:bg-white/5">
                  <p className="text-[15px] font-black leading-none text-zinc-900 dark:text-white">{featuredCount}</p>
                  <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-zinc-400">Destacados</p>
                </div>
              </div>
            </section>

            {/* Más vendidos */}
            <section className="rounded-2xl border border-zinc-200/80 bg-white p-3.5 shadow-xs dark:border-white/10 dark:bg-[#16161B]">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-1.5 text-[13px] font-extrabold tracking-tight text-zinc-900 dark:text-white">
                  <Flame className="h-3.5 w-3.5 text-[#FF6A00]" aria-hidden="true" />
                  Más vendidos
                </h2>
                <button
                  type="button"
                  onClick={() => navigate("/commerce/stats")}
                  className="text-[11px] font-bold text-[#FF6A00] transition-colors hover:text-[#e05d00]"
                >
                  Ver más
                </button>
              </div>

              {topProducts.length === 0 ? (
                <p className="mt-3 text-center text-[10.5px] text-zinc-400 dark:text-zinc-500">
                  Aún no hay ventas registradas
                </p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {topProducts.map((prod: any) => (
                    <li key={prod.id} className="flex items-center gap-2">
                      <img
                        src={safeImage(prod.imageUrl, "product")}
                        alt=""
                        className="h-7 w-7 shrink-0 rounded-lg border border-zinc-200/60 object-cover bg-white dark:border-white/10 dark:bg-zinc-800"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-bold text-zinc-800 dark:text-zinc-200">{prod.name}</p>
                        <p className="text-[9.5px] text-zinc-400 dark:text-zinc-500">
                          {prod.salesCount ? `${prod.salesCount} vendidos` : "Sin ventas"}
                        </p>
                      </div>
                      <span className="shrink-0 text-[11px] font-black text-[#FF6A00]">
                        ${parseFloat(prod.price || 0).toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>
    </CommerceLayout>
  );
}
