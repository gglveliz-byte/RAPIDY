import { useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  Search,
  Eye,
  X,
  Package,
} from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useAdminSSE } from "@/hooks/useAdminSSE";
import { trpc } from "@/providers/trpc";
import AdminLayout from "@/components/AdminLayout";

const statusColors: Record<string, string> = {
  pending_payment: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300 font-bold border-2 border-red-400 dark:border-red-500/50 animate-pulse",
  payment_rejected: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300 font-bold border-2 border-red-600 dark:border-red-500/60",
  received: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300",
  accepted: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300",
  preparing: "bg-purple-100 text-purple-800 dark:bg-purple-500/15 dark:text-purple-300",
  ready_for_pickup: "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-300",
  driver_assigned: "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-300",
  picked_up: "bg-pink-100 text-pink-800 dark:bg-pink-500/15 dark:text-pink-300",
  on_the_way: "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300",
  delivered: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
};

const filterLabels: Record<string, string> = {
  all: "Todos",
  pending_payment: "Por Pagar",
  payment_rejected: "Pago Rechazado",
  received: "Nuevos",
  accepted: "Aceptados",
  preparing: "Preparando",
  ready_for_pickup: "Listos",
  driver_assigned: "Rep. Asignado",
  picked_up: "Retirados",
  on_the_way: "En camino",
  delivered: "Entregados",
  cancelled: "Cancelados",
};

function SettlementPanel({
  order,
  loadingKey,
  onToggleCommerce,
  onToggleDriver,
}: {
  order: any;
  loadingKey: string | null;
  onToggleCommerce: (orderId: number, commerceId: number) => void;
  onToggleDriver: (orderId: number) => void;
}) {
  if (order.status !== "delivered") {
    return <span className="text-[10px] text-zinc-500 dark:text-zinc-400">Pendiente de entrega</span>;
  }

  const settlements: any[] =
    order.commerceSettlements && order.commerceSettlements.length > 0
      ? order.commerceSettlements
      : [
          {
            commerceId: 0,
            commerceName: order.commerceName || "Comercio",
            owed: order.commerceOwed,
            action: order.commerceAction,
            settled: order.commerceSettled,
          },
        ];

  return (
    <div className="flex flex-col gap-1.5">
      {settlements.map((settlement) => {
        const key = `${order.id}:${settlement.commerceId}`;
        return (
          <div
            key={settlement.commerceId}
            className="flex items-center justify-between gap-1.5 bg-zinc-50 dark:bg-[#16161B] px-2 py-1.5 rounded-lg border border-zinc-100 dark:border-white/10"
          >
            <div className="flex flex-col min-w-0">
              <span className="text-[9px] text-zinc-500 dark:text-zinc-400 leading-none truncate">
                {settlements.length > 1 ? settlement.commerceName : "Comercio"}
              </span>
              <span
                className={`text-[11px] font-bold truncate ${
                  settlement.action === "cobrar" ? "text-blue-600 dark:text-blue-400" : "text-orange-600 dark:text-orange-400"
                }`}
              >
                {settlement.action === "cobrar" ? "Cobrar" : "Pagar"} $
                {Number(settlement.owed || 0).toFixed(2)}
              </span>
            </div>
            <button
              disabled={loadingKey === key}
              onClick={() => onToggleCommerce(order.id, settlement.commerceId)}
              className={`min-h-11 px-2.5 text-[11px] font-semibold rounded-lg transition-colors disabled:opacity-50 shrink-0 ${
                settlement.settled
                  ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400"
                  : "bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-white/10 dark:text-zinc-200 dark:hover:bg-white/15"
              }`}
            >
              {loadingKey === key ? "..." : settlement.settled ? "Saldado" : "Pendiente"}
            </button>
          </div>
        );
      })}

      <div className="flex items-center justify-between gap-1.5 bg-zinc-50 dark:bg-[#16161B] px-2 py-1.5 rounded-lg border border-zinc-100 dark:border-white/10">
        <div className="flex flex-col min-w-0">
          <span className="text-[9px] text-zinc-500 dark:text-zinc-400 leading-none">Repartidor</span>
          <span
            className={`text-[11px] font-bold truncate ${
              order.driverAction === "cobrar" ? "text-blue-600 dark:text-blue-400" : "text-orange-600 dark:text-orange-400"
            }`}
          >
            {order.driverAction === "cobrar" ? "Cobrar" : "Pagar"} $
            {Number(order.driverOwed || 0).toFixed(2)}
          </span>
        </div>
        <button
          disabled={loadingKey === `${order.id}:driver`}
          onClick={() => onToggleDriver(order.id)}
          className={`min-h-11 px-2.5 text-[11px] font-semibold rounded-lg transition-colors disabled:opacity-50 shrink-0 ${
            order.driverSettled
              ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400"
              : "bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-white/10 dark:text-zinc-200 dark:hover:bg-white/15"
          }`}
        >
          {loadingKey === `${order.id}:driver`
            ? "..."
            : order.driverSettled
              ? "Saldado"
              : "Pendiente"}
        </button>
      </div>
    </div>
  );
}

export default function AdminOrders() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const ordersQuery = trpc.admin.orders.useQuery({ limit: 100, offset: page * 100 });
  const orders = ordersQuery.data ?? [];
  const loading = ordersQuery.isLoading;
  const { data: orderDetails, isLoading: detailsLoading, isError: detailsError } = trpc.admin.orderDetail.useQuery(
    { id: selectedOrderId! },
    { enabled: !!selectedOrderId }
  );

  const utils = trpc.useUtils();
  
  useAdminSSE(() => {
    utils.admin.orders.invalidate();
    if (selectedOrderId) {
      utils.admin.orderDetail.invalidate({ id: selectedOrderId });
    }
  });

  const updateStatus = trpc.admin.updateOrderStatus.useMutation({
    onSuccess: () => {
      utils.admin.orders.invalidate();
      if (selectedOrderId) {
        utils.admin.orderDetail.invalidate({ id: selectedOrderId });
      }
    }
  });

  const toggleCommerce = trpc.admin.toggleCommerceSettled.useMutation({
    onSuccess: () => utils.admin.orders.invalidate(),
    onSettled: () => setLoadingKey(null),
    onError: (error) => alert(error.message || "No se pudo liquidar el comercio."),
  });
  
  const toggleDriver = trpc.admin.toggleDriverSettled.useMutation({
    onSuccess: () => utils.admin.orders.invalidate(),
    onSettled: () => setLoadingKey(null),
    onError: (error) => alert(error.message || "No se pudo liquidar al repartidor."),
  });

  const handleApprovePayment = async () => {
    if (!selectedOrderId) return;
    if (confirm("¿Confirmar que el pago ha sido recibido correctamente? Los negocios serán notificados.")) {
      await updateStatus.mutateAsync({ id: selectedOrderId, status: "received" });
    }
  };

  const handleRejectPayment = async () => {
    if (!selectedOrderId) return;
    const reason = prompt("Razón del rechazo (ej. Comprobante ilegible):", "Comprobante inválido o ilegible");
    if (reason !== null) {
      await updateStatus.mutateAsync({ id: selectedOrderId, status: "payment_rejected", notes: reason });
    }
  };

  const filtered = orders.filter((o: any) => {
    const matchesSearch =
      (o.customerName?.toLowerCase() || "").includes(search.toLowerCase()) ||
      (o.customerPhone || "").includes(search) ||
      o.id.toString().includes(search);
    const matchesFilter = filter === "all" || o.status === filter;
    return matchesSearch && matchesFilter;
  });

  return (
    <AdminLayout>
      <div className="flex flex-1 flex-col min-h-full bg-[#F7F7FA] dark:bg-[#0A0A0D] text-zinc-900 dark:text-zinc-100">
        <header className="bg-white dark:bg-[#1A1A1E] border-b border-zinc-100 dark:border-white/10 px-3 lg:px-4 pt-safe-top pb-2 lg:py-4">
          <div className="flex items-center gap-2 lg:gap-3 min-w-0">
            <button type="button" onClick={() => navigate("/admin")} aria-label="Volver al panel" className="touch-target shrink-0 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors">
              <ArrowLeft className="w-4 h-4 lg:w-5 lg:h-5 text-zinc-600 dark:text-zinc-300" />
            </button>
            <h1 className="text-base lg:text-lg font-bold text-zinc-800 dark:text-zinc-100 truncate">Pedidos</h1>
          </div>
        </header>

      <div className="lg:flex-1 lg:overflow-hidden p-2 lg:p-4">
        <div className="lg:h-full lg:flex lg:flex-col max-w-6xl mx-auto">
          <div className="flex gap-2 lg:gap-3 mb-3 lg:mb-4 lg:shrink-0">
            <div className="relative flex-1">
              <label htmlFor="orders-search" className="sr-only">Buscar por ID o cliente</label>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 dark:text-zinc-400" />
              <input
                id="orders-search"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por ID o cliente..."
                className="w-full h-9 lg:h-10 pl-9 pr-4 bg-white dark:bg-[#1A1A1E] rounded-xl border border-zinc-200 dark:border-white/10 text-xs lg:text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </div>
          </div>

          <div className="flex gap-1.5 lg:gap-2 mb-3 lg:mb-4 overflow-x-auto no-scrollbar pb-1.5 lg:shrink-0 -mx-1 px-1 sm:mx-0 sm:px-0">
            {["all", "pending_payment", "payment_rejected", "received", "accepted", "preparing", "ready_for_pickup", "driver_assigned", "picked_up", "on_the_way", "delivered", "cancelled"].map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={`min-h-11 px-3 sm:px-3.5 py-1.5 rounded-full text-[11px] sm:text-xs font-semibold whitespace-nowrap transition-all active:scale-95 shadow-xs ${
                  filter === f
                    ? "bg-brand text-zinc-950 shadow-sm shadow-brand/20"
                    : "bg-white dark:bg-[#1A1A1E] text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-white/10 hover:bg-zinc-50 dark:hover:bg-white/10"
                }`}
              >
                {filterLabels[f]}
              </button>
            ))}
          </div>

          <div className="lg:rounded-xl lg:card-shadow dark:shadow-none lg:overflow-hidden lg:flex-1 lg:min-h-0 lg:border lg:border-zinc-100 dark:border-white/10">
            {/* Desktop Table View */}
            <div className="hidden lg:block overflow-x-auto lg:h-full lg:overflow-y-auto bg-white dark:bg-[#1A1A1E]">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 dark:bg-[#16161B] text-zinc-600 dark:text-zinc-400 lg:sticky lg:top-0 lg:z-10">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">ID</th>
                    <th className="text-left px-4 py-3 font-medium">Cliente</th>
                    <th className="text-left px-4 py-3 font-medium">Comercio</th>
                    <th className="text-left px-4 py-3 font-medium">Repartidor</th>
                    <th className="text-left px-4 py-3 font-medium">Total</th>
                    <th className="text-left px-4 py-3 font-medium">Estado</th>
                    <th className="text-left px-4 py-3 font-medium">Fecha</th>
                    <th className="text-left px-4 py-3 font-medium">Pagos y Cobros</th>
                    <th className="text-center px-4 py-3 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-zinc-500 dark:text-zinc-400 text-sm">
                        Cargando pedidos...
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-zinc-500 dark:text-zinc-400 text-sm">
                        No hay pedidos
                      </td>
                    </tr>
                  ) : (
                    filtered.map((o: any) => (
                      <tr key={o.id} className="hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 font-bold text-zinc-800 dark:text-zinc-100">#{o.id}</td>
                        <td className="px-4 py-3">
                          <p className="text-zinc-800 dark:text-zinc-100 font-medium leading-tight">{o.customerName}</p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-tight">{o.customerPhone}</p>
                        </td>
                        <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{o.commerceName}</td>
                        <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{o.driverName || "-"}</td>
                        <td className="px-4 py-3 font-bold text-zinc-800 dark:text-zinc-100">${parseFloat(o.total || "0").toFixed(2)}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusColors[o.status] || "bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-300"}`}>
                            {(o.status || "").replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400 text-xs">{o.createdAt ? new Date(o.createdAt).toLocaleString() : "-"}</td>
                        <td className="px-4 py-3 min-w-[220px]">
                          <SettlementPanel
                            order={o}
                            loadingKey={loadingKey}
                            onToggleCommerce={(orderId, commerceId) => {
                              setLoadingKey(`${orderId}:${commerceId}`);
                              toggleCommerce.mutate({ id: orderId, commerceId });
                            }}
                            onToggleDriver={(orderId) => {
                              setLoadingKey(`${orderId}:driver`);
                              toggleDriver.mutate({ id: orderId });
                            }}
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button type="button" onClick={() => setSelectedOrderId(o.id)} aria-label={`Ver detalles del pedido #${o.id}`} className="min-h-11 min-w-11 inline-flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-white/10 rounded-xl text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors" title="Ver detalles">
                            <Eye className="w-5 h-5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="lg:hidden flex flex-col gap-3 pb-4">
              {loading ? (
                <div className="p-4 text-center text-zinc-500 dark:text-zinc-400 text-sm">Cargando pedidos...</div>
              ) : filtered.length === 0 ? (
                <div className="p-4 text-center text-zinc-500 dark:text-zinc-400 text-sm">No hay pedidos</div>
              ) : (
                filtered.map((o: any) => (
                  <div key={o.id} className="bg-white dark:bg-[#1A1A1E] rounded-xl card-shadow dark:shadow-none p-4 flex flex-col gap-3 border border-zinc-100 dark:border-white/10">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-semibold block leading-tight">#{o.id} • {o.createdAt ? new Date(o.createdAt).toLocaleDateString() : "-"}</span>
                        <h3 className="text-lg font-extrabold text-zinc-900 dark:text-zinc-100">${parseFloat(o.total || "0").toFixed(2)}</h3>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${statusColors[o.status] || "bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-300"}`}>
                        {(o.status || "").replace(/_/g, " ")}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-xs bg-zinc-50 dark:bg-[#16161B] p-2.5 rounded-xl border border-zinc-100 dark:border-white/10">
                      <div>
                        <span className="block text-[10px] text-zinc-500 dark:text-zinc-400">Cliente</span>
                        <span className="font-semibold text-zinc-800 dark:text-zinc-100 block truncate">{o.customerName}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-zinc-500 dark:text-zinc-400">Teléfono</span>
                        <span className="text-zinc-700 dark:text-zinc-300 block truncate">{o.customerPhone}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-zinc-500 dark:text-zinc-400">Comercio</span>
                        <span className="text-zinc-800 dark:text-zinc-100 font-medium block truncate">{o.commerceName}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-zinc-500 dark:text-zinc-400">Repartidor</span>
                        <span className="text-zinc-800 dark:text-zinc-100 font-medium block truncate">{o.driverName || "No asignado"}</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-zinc-100 dark:border-white/10 flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <SettlementPanel
                          order={o}
                          loadingKey={loadingKey}
                          onToggleCommerce={(orderId, commerceId) => {
                            setLoadingKey(`${orderId}:${commerceId}`);
                            toggleCommerce.mutate({ id: orderId, commerceId });
                          }}
                          onToggleDriver={(orderId) => {
                            setLoadingKey(`${orderId}:driver`);
                            toggleDriver.mutate({ id: orderId });
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedOrderId(o.id)}
                        aria-label={`Ver detalles del pedido #${o.id}`}
                        className="min-h-11 min-w-11 flex items-center justify-center bg-zinc-100 hover:bg-zinc-200 dark:bg-white/10 dark:hover:bg-white/15 rounded-xl text-zinc-700 dark:text-zinc-200 transition-all active:scale-95 shrink-0"
                        title="Ver detalles"
                      >
                        <Eye className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-3 lg:p-4 border-t border-zinc-100 dark:border-white/10 bg-white dark:bg-[#1A1A1E] flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                disabled={page === 0 || ordersQuery.isFetching}
                className="min-h-[44px] px-4 rounded-xl border border-zinc-200 dark:border-white/10 text-xs lg:text-sm font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/10 disabled:opacity-40"
              >
                Anteriores
              </button>
              <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Página {page + 1}</span>
              <button
                type="button"
                onClick={() => setPage((current) => current + 1)}
                disabled={orders.length < 100 || ordersQuery.isFetching}
                className="min-h-[44px] px-4 rounded-xl border border-zinc-200 dark:border-white/10 text-xs lg:text-sm font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/10 disabled:opacity-40"
              >
                Siguientes
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Details Modal */}
      <DialogPrimitive.Root open={Boolean(selectedOrderId)} onOpenChange={(open) => { if (!open) setSelectedOrderId(null); }}>
        {selectedOrderId && (
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-black/70 dark:bg-black/80 backdrop-blur-xs animate-fade-in" />
            <DialogPrimitive.Content
              aria-describedby={undefined}
              className="fixed left-1/2 top-1/2 z-[70] -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-[#1A1A1E] rounded-2xl w-[calc(100%_-_1.25rem)] sm:w-full max-w-lg max-h-[80dvh] sm:max-h-[85dvh] flex flex-col overflow-hidden shadow-2xl border border-zinc-100 dark:border-white/10 focus:outline-none"
            >
            <div className="p-3.5 sm:p-4 border-b border-zinc-100 dark:border-white/10 flex items-center justify-between bg-zinc-50/80 dark:bg-white/5 shrink-0">
              <DialogPrimitive.Title className="text-base sm:text-lg font-bold text-zinc-800 dark:text-zinc-100 flex items-center gap-2 truncate pr-2">
                <Package className="w-5 h-5 text-brand-strong dark:text-brand shrink-0" />
                <span className="truncate">Detalles del Pedido #{selectedOrderId}</span>
              </DialogPrimitive.Title>
              <DialogPrimitive.Close
                aria-label="Cerrar"
                className="min-h-11 min-w-11 flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 rounded-full hover:bg-zinc-200 dark:hover:bg-white/10 transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </DialogPrimitive.Close>
            </div>
            
            <div className="p-4 sm:p-5 overflow-y-auto flex-1">
              {detailsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                </div>
              ) : detailsError || !orderDetails ? (
                <div className="flex justify-center py-8 text-red-500 dark:text-red-400 text-sm font-medium">
                  Error al cargar los detalles del pedido. Intente de nuevo.
                </div>
              ) : (
                <div className="space-y-4 sm:space-y-5">
                  {/* Status & Customer */}
                  <div className="bg-zinc-50 dark:bg-[#16161B] rounded-xl p-3.5 sm:p-4 space-y-2.5 sm:space-y-3 border border-zinc-100 dark:border-white/10">
                    <div className="flex justify-between items-center">
                      <span className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">Estado</span>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusColors[orderDetails.status] || "bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-300"}`}>
                        {(orderDetails.status || "").replace(/_/g, " ")}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">Cliente</span>
                      <span className="text-xs sm:text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                        {orderDetails.customer ? `${orderDetails.customer.firstName} ${orderDetails.customer.lastName}` : "Invitado"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">Teléfono</span>
                      <span className="text-xs sm:text-sm font-medium text-zinc-800 dark:text-zinc-100">{orderDetails.customerPhone}</span>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 pt-1 border-t border-zinc-200/60 dark:border-white/10">
                      <span className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 shrink-0">Dirección de Entrega:</span>
                      <span className="text-xs sm:text-sm font-medium text-zinc-800 dark:text-zinc-100 sm:text-right break-words">{orderDetails.deliveryAddress}</span>
                    </div>
                  </div>

                  {/* Items */}
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-zinc-800 dark:text-zinc-100 mb-2.5 border-b border-zinc-100 dark:border-white/10 pb-2">
                      Productos ({orderDetails.items.length})
                    </h3>
                    <div className="space-y-2.5">
                      {orderDetails.items.map((item: any) => (
                        <div key={item.id} className="flex justify-between items-start gap-2 text-xs sm:text-sm">
                          <div>
                            <p className="font-semibold text-zinc-800 dark:text-zinc-100">
                              <span className="text-brand-strong dark:text-brand mr-1.5">{item.quantity}x</span>
                              {item.productName}
                            </p>
                            {item.notes && <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">Nota: {item.notes}</p>}
                          </div>
                          <span className="font-semibold text-zinc-800 dark:text-zinc-100 shrink-0">${parseFloat(item.total).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Payment Info */}
                  {orderDetails.paymentMethod === "transfer" && (
                    <div className="bg-zinc-50 dark:bg-[#16161B] rounded-xl p-3.5 sm:p-4 border border-zinc-200 dark:border-white/10">
                      <h3 className="text-xs sm:text-sm font-bold text-zinc-800 dark:text-zinc-100 mb-2 border-b border-zinc-200 dark:border-white/10 pb-1.5">Información de Pago (Transferencia)</h3>
                      {orderDetails.paymentReceipt ? (
                        <div className="mt-2 text-center">
                          <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-2 text-left">Comprobante adjunto:</p>
                          <img
                            src={orderDetails.paymentReceipt}
                            alt="Comprobante"
                            className="max-w-full rounded-xl border border-zinc-200 dark:border-white/10 max-h-[260px] sm:max-h-[320px] object-contain mx-auto shadow-xs dark:shadow-none"
                          />
                        </div>
                      ) : (
                        <p className="text-xs sm:text-sm text-orange-600 dark:text-orange-400 font-medium">No se adjuntó comprobante de pago.</p>
                      )}
                      
                      {orderDetails.status === "pending_payment" && (
                        <div className="mt-3.5 flex gap-2.5">
                          <button
                            onClick={handleApprovePayment}
                            disabled={updateStatus.isPending}
                            className="flex-1 min-h-[44px] bg-brand text-zinc-950 font-semibold py-2 rounded-xl hover:bg-brand-strong active:scale-98 transition-all shadow-sm shadow-brand/20"
                          >
                            {updateStatus.isPending ? "Aprobando..." : "Aprobar Pago"}
                          </button>
                          <button
                            onClick={handleRejectPayment}
                            disabled={updateStatus.isPending}
                            className="flex-1 min-h-[44px] bg-red-600 text-white font-semibold py-2 rounded-xl hover:bg-red-700 active:scale-98 transition-all shadow-sm shadow-red-600/20"
                          >
                            Rechazar
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Summary */}
                  <div className="border-t border-zinc-200 dark:border-white/10 pt-3 space-y-1.5 text-xs sm:text-sm">
                    <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                      <span>Subtotal</span>
                      <span className="font-medium">${parseFloat(orderDetails.subtotal || "0").toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                      <span>Costo de envío</span>
                      <span className="font-medium">${parseFloat(orderDetails.deliveryFee || "0").toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm sm:text-base font-extrabold text-zinc-900 dark:text-zinc-100 pt-2 border-t border-zinc-100 dark:border-white/10">
                      <span>Total</span>
                      <span className="text-brand-strong dark:text-brand">${parseFloat(orderDetails.total || "0").toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-3 sm:p-4 border-t border-zinc-100 dark:border-white/10 bg-zinc-50 dark:bg-white/5 flex justify-end shrink-0">
              <button
                onClick={() => setSelectedOrderId(null)}
                className="min-h-11 px-5 bg-white dark:bg-[#1A1A1E] border border-zinc-300 dark:border-white/10 rounded-xl text-xs sm:text-sm font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/10 active:scale-98 transition-all shadow-xs dark:shadow-none"
              >
                Cerrar
              </button>
            </div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </DialogPrimitive.Root>
      </div>
    </AdminLayout>
  );
}