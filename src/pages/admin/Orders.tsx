import { useState } from "react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Search,
  Eye,
  X,
  Package,
} from "lucide-react";
import { useAdminOrders } from "@/hooks/useDeliveryData";
import { useAdminSSE } from "@/hooks/useAdminSSE";
import { trpc } from "@/providers/trpc";
import AdminLayout from "@/components/AdminLayout";

const statusColors: Record<string, string> = {
  pending_payment: "bg-red-100 text-red-800 font-bold border-2 border-red-400 animate-pulse",
  payment_rejected: "bg-red-100 text-red-800 font-bold border-2 border-red-600",
  received: "bg-yellow-100 text-yellow-800",
  accepted: "bg-blue-100 text-blue-800",
  preparing: "bg-purple-100 text-purple-800",
  ready_for_pickup: "bg-indigo-100 text-indigo-800",
  driver_assigned: "bg-indigo-100 text-indigo-800",
  picked_up: "bg-pink-100 text-pink-800",
  on_the_way: "bg-orange-100 text-orange-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
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

export default function AdminOrders() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [loadingCommerceId, setLoadingCommerceId] = useState<number | null>(null);
  const [loadingDriverId, setLoadingDriverId] = useState<number | null>(null);
  
  const { data: orders, loading } = useAdminOrders();
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

  const queryClient = useQueryClient();

  const toggleCommerce = trpc.admin.toggleCommerceSettled.useMutation({
    onSuccess: () => {
      utils.admin.orders.invalidate();
      queryClient.invalidateQueries({ queryKey: ["admin.orders"] });
    },
    onSettled: () => setLoadingCommerceId(null)
  });
  
  const toggleDriver = trpc.admin.toggleDriverSettled.useMutation({
    onSuccess: () => {
      utils.admin.orders.invalidate();
      queryClient.invalidateQueries({ queryKey: ["admin.orders"] });
    },
    onSettled: () => setLoadingDriverId(null)
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
      <header className="bg-white border-b border-gray-200 px-3 lg:px-4 py-2 lg:py-4">
        <div className="flex items-center gap-2 lg:gap-3">
          <button onClick={() => navigate("/admin")} className="touch-target">
            <ArrowLeft className="w-4 h-4 lg:w-5 lg:h-5 text-gray-600" />
          </button>
          <h1 className="text-base lg:text-lg font-bold text-gray-800">Pedidos</h1>
        </div>
      </header>

      <div className="lg:flex-1 lg:overflow-hidden p-2 lg:p-4">
        <div className="lg:h-full lg:flex lg:flex-col max-w-6xl mx-auto">
          <div className="flex gap-2 lg:gap-3 mb-3 lg:mb-4 lg:shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por ID o cliente..."
                className="w-full h-9 lg:h-10 pl-9 pr-4 bg-white rounded-xl border border-gray-200 text-xs lg:text-sm focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20"
              />
            </div>
          </div>

          <div className="flex gap-1.5 lg:gap-2 mb-3 lg:mb-4 overflow-x-auto no-scrollbar pb-1.5 lg:shrink-0 -mx-1 px-1 sm:mx-0 sm:px-0">
            {["all", "pending_payment", "payment_rejected", "received", "accepted", "preparing", "ready_for_pickup", "driver_assigned", "picked_up", "on_the_way", "delivered", "cancelled"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`min-h-[36px] px-3 sm:px-3.5 py-1.5 rounded-full text-[11px] sm:text-xs font-semibold whitespace-nowrap transition-all active:scale-95 shadow-xs ${
                  filter === f
                    ? "bg-[#2E7D32] text-white shadow-sm shadow-[#2E7D32]/20"
                    : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                }`}
              >
                {filterLabels[f]}
              </button>
            ))}
          </div>

          <div className="bg-white lg:bg-transparent lg:rounded-xl lg:card-shadow lg:overflow-hidden lg:flex-1 lg:min-h-0">
            {/* Desktop Table View */}
            <div className="hidden lg:block overflow-x-auto lg:h-full lg:overflow-y-auto bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 lg:sticky lg:top-0 lg:z-10">
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
                <tbody className="divide-y divide-gray-50">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-gray-500 text-sm">
                        Cargando pedidos...
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-gray-500 text-sm">
                        No hay pedidos
                      </td>
                    </tr>
                  ) : (
                    filtered.map((o: any) => (
                      <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-bold text-gray-800">#{o.id}</td>
                        <td className="px-4 py-3">
                          <p className="text-gray-800 font-medium leading-tight">{o.customerName}</p>
                          <p className="text-xs text-gray-500 leading-tight">{o.customerPhone}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{o.commerceName}</td>
                        <td className="px-4 py-3 text-gray-600">{o.driverName || "-"}</td>
                        <td className="px-4 py-3 font-bold text-gray-800">${parseFloat(o.total || "0").toFixed(2)}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusColors[o.status] || "bg-gray-100 text-gray-600"}`}>
                            {(o.status || "").replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{o.createdAt ? new Date(o.createdAt).toLocaleString() : "-"}</td>
                        <td className="px-4 py-3 min-w-[200px]">
                          {o.status === "delivered" ? (
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center justify-between gap-2 bg-gray-50 p-1.5 rounded-lg border border-gray-100">
                                <div className="flex flex-col">
                                  <span className="text-[10px] text-gray-500 leading-none">Comercio</span>
                                  <span className={`text-xs font-semibold ${o.commerceAction === 'cobrar' ? 'text-blue-600' : 'text-orange-600'}`}>
                                    {o.commerceAction === 'cobrar' ? 'Cobrar' : 'Pagar'} ${o.commerceOwed}
                                  </span>
                                </div>
                                <button
                                  disabled={loadingCommerceId === o.id}
                                  onClick={() => {
                                    setLoadingCommerceId(o.id);
                                    toggleCommerce.mutate({ id: o.id });
                                  }}
                                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-colors disabled:opacity-50 ${o.commerceSettled ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}
                                >
                                  {loadingCommerceId === o.id ? '...' : o.commerceSettled ? 'Saldado' : 'Pendiente'}
                                </button>
                              </div>
                              <div className="flex items-center justify-between gap-2 bg-gray-50 p-1.5 rounded-lg border border-gray-100">
                                <div className="flex flex-col">
                                  <span className="text-[10px] text-gray-500 leading-none">Repartidor</span>
                                  <span className={`text-xs font-semibold ${o.driverAction === 'cobrar' ? 'text-blue-600' : 'text-orange-600'}`}>
                                    {o.driverAction === 'cobrar' ? 'Cobrar' : 'Pagar'} ${o.driverOwed}
                                  </span>
                                </div>
                                <button
                                  disabled={loadingDriverId === o.id}
                                  onClick={() => {
                                    setLoadingDriverId(o.id);
                                    toggleDriver.mutate({ id: o.id });
                                  }}
                                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-colors disabled:opacity-50 ${o.driverSettled ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}
                                >
                                  {loadingDriverId === o.id ? '...' : o.driverSettled ? 'Saldado' : 'Pendiente'}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <span className="text-[10px] text-gray-400">Pendiente de entrega</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => setSelectedOrderId(o.id)} className="w-9 h-9 inline-flex items-center justify-center hover:bg-gray-100 rounded-xl text-gray-600 hover:text-gray-900 transition-colors" title="Ver detalles">
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
                <div className="p-4 text-center text-gray-500 text-sm">Cargando pedidos...</div>
              ) : filtered.length === 0 ? (
                <div className="p-4 text-center text-gray-500 text-sm">No hay pedidos</div>
              ) : (
                filtered.map((o: any) => (
                  <div key={o.id} className="bg-white rounded-xl card-shadow p-4 flex flex-col gap-3">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <span className="text-[11px] text-gray-500 font-semibold block leading-tight">#{o.id} • {o.createdAt ? new Date(o.createdAt).toLocaleDateString() : "-"}</span>
                        <h3 className="text-lg font-extrabold text-gray-900">${parseFloat(o.total || "0").toFixed(2)}</h3>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${statusColors[o.status] || "bg-gray-100 text-gray-600"}`}>
                        {(o.status || "").replace(/_/g, " ")}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                      <div>
                        <span className="block text-[10px] text-gray-500">Cliente</span>
                        <span className="font-semibold text-gray-800 block truncate">{o.customerName}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-gray-500">Teléfono</span>
                        <span className="text-gray-700 block truncate">{o.customerPhone}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-gray-500">Comercio</span>
                        <span className="text-gray-800 font-medium block truncate">{o.commerceName}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-gray-500">Repartidor</span>
                        <span className="text-gray-800 font-medium block truncate">{o.driverName || "No asignado"}</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        {o.status === "delivered" ? (
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center justify-between gap-1.5 bg-gray-50 px-2 py-1.5 rounded-lg border border-gray-100">
                              <div className="flex flex-col min-w-0">
                                <span className="text-[9px] text-gray-400 leading-none">Comercio</span>
                                <span className={`text-[11px] font-bold truncate ${o.commerceAction === 'cobrar' ? 'text-blue-600' : 'text-orange-600'}`}>
                                  {o.commerceAction === 'cobrar' ? 'Cobrar' : 'Pagar'} ${o.commerceOwed}
                                </span>
                              </div>
                              <button
                                disabled={loadingCommerceId === o.id}
                                onClick={() => {
                                  setLoadingCommerceId(o.id);
                                  toggleCommerce.mutate({ id: o.id });
                                }}
                                className={`min-h-[34px] px-2.5 text-[11px] font-semibold rounded-lg transition-colors disabled:opacity-50 shrink-0 ${o.commerceSettled ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                              >
                                {loadingCommerceId === o.id ? '...' : o.commerceSettled ? 'Saldado' : 'Pendiente'}
                              </button>
                            </div>
                            <div className="flex items-center justify-between gap-1.5 bg-gray-50 px-2 py-1.5 rounded-lg border border-gray-100">
                              <div className="flex flex-col min-w-0">
                                <span className="text-[9px] text-gray-400 leading-none">Repartidor</span>
                                <span className={`text-[11px] font-bold truncate ${o.driverAction === 'cobrar' ? 'text-blue-600' : 'text-orange-600'}`}>
                                  {o.driverAction === 'cobrar' ? 'Cobrar' : 'Pagar'} ${o.driverOwed}
                                </span>
                              </div>
                              <button
                                disabled={loadingDriverId === o.id}
                                onClick={() => {
                                  setLoadingDriverId(o.id);
                                  toggleDriver.mutate({ id: o.id });
                                }}
                                className={`min-h-[34px] px-2.5 text-[11px] font-semibold rounded-lg transition-colors disabled:opacity-50 shrink-0 ${o.driverSettled ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                              >
                                {loadingDriverId === o.id ? '...' : o.driverSettled ? 'Saldado' : 'Pendiente'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <span className="text-[11px] text-gray-400 italic">Pendiente de entrega</span>
                        )}
                      </div>
                      <button
                        onClick={() => setSelectedOrderId(o.id)}
                        className="min-h-[40px] min-w-[40px] flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-xl text-gray-700 transition-all active:scale-95 shrink-0"
                        title="Ver detalles"
                      >
                        <Eye className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Details Modal */}
      {selectedOrderId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4 animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90dvh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-3.5 sm:p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50 shrink-0">
              <h2 className="text-base sm:text-lg font-bold text-gray-800 flex items-center gap-2">
                <Package className="w-5 h-5 text-[#2E7D32]" />
                Detalles del Pedido #{selectedOrderId}
              </h2>
              <button
                onClick={() => setSelectedOrderId(null)}
                className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 sm:p-5 overflow-y-auto flex-1">
              {detailsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-[#2E7D32] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : detailsError || !orderDetails ? (
                <div className="flex justify-center py-8 text-red-500 text-sm font-medium">
                  Error al cargar los detalles del pedido. Intente de nuevo.
                </div>
              ) : (
                <div className="space-y-4 sm:space-y-5">
                  {/* Status & Customer */}
                  <div className="bg-gray-50 rounded-xl p-3.5 sm:p-4 space-y-2.5 sm:space-y-3 border border-gray-100">
                    <div className="flex justify-between items-center">
                      <span className="text-xs sm:text-sm text-gray-500">Estado</span>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusColors[orderDetails.status] || "bg-gray-100 text-gray-600"}`}>
                        {(orderDetails.status || "").replace(/_/g, " ")}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs sm:text-sm text-gray-500">Cliente</span>
                      <span className="text-xs sm:text-sm font-semibold text-gray-800">
                        {orderDetails.customer ? `${orderDetails.customer.firstName} ${orderDetails.customer.lastName}` : "Invitado"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs sm:text-sm text-gray-500">Teléfono</span>
                      <span className="text-xs sm:text-sm font-medium text-gray-800">{orderDetails.customerPhone}</span>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 pt-1 border-t border-gray-200/60">
                      <span className="text-xs sm:text-sm text-gray-500 shrink-0">Dirección de Entrega:</span>
                      <span className="text-xs sm:text-sm font-medium text-gray-800 sm:text-right break-words">{orderDetails.deliveryAddress}</span>
                    </div>
                  </div>

                  {/* Items */}
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-gray-800 mb-2.5 border-b border-gray-100 pb-2">
                      Productos ({orderDetails.items.length})
                    </h3>
                    <div className="space-y-2.5">
                      {orderDetails.items.map((item: any) => (
                        <div key={item.id} className="flex justify-between items-start gap-2 text-xs sm:text-sm">
                          <div>
                            <p className="font-semibold text-gray-800">
                              <span className="text-[#2E7D32] mr-1.5">{item.quantity}x</span>
                              {item.productName}
                            </p>
                            {item.notes && <p className="text-[11px] text-gray-500 mt-0.5">Nota: {item.notes}</p>}
                          </div>
                          <span className="font-semibold text-gray-800 shrink-0">${parseFloat(item.total).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Payment Info */}
                  {orderDetails.paymentMethod === "transfer" && (
                    <div className="bg-gray-50 rounded-xl p-3.5 sm:p-4 border border-gray-200">
                      <h3 className="text-xs sm:text-sm font-bold text-gray-800 mb-2 border-b border-gray-200 pb-1.5">Información de Pago (Transferencia)</h3>
                      {orderDetails.paymentReceipt ? (
                        <div className="mt-2 text-center">
                          <p className="text-xs font-medium text-gray-600 mb-2 text-left">Comprobante adjunto:</p>
                          <img
                            src={orderDetails.paymentReceipt}
                            alt="Comprobante"
                            className="max-w-full rounded-xl border border-gray-200 max-h-[260px] sm:max-h-[320px] object-contain mx-auto shadow-xs"
                          />
                        </div>
                      ) : (
                        <p className="text-xs sm:text-sm text-orange-600 font-medium">No se adjuntó comprobante de pago.</p>
                      )}
                      
                      {orderDetails.status === "pending_payment" && (
                        <div className="mt-3.5 flex gap-2.5">
                          <button
                            onClick={handleApprovePayment}
                            disabled={updateStatus.isPending}
                            className="flex-1 min-h-[44px] bg-[#2E7D32] text-white font-semibold py-2 rounded-xl hover:bg-[#1B5E20] active:scale-98 transition-all shadow-sm shadow-[#2E7D32]/20"
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
                  <div className="border-t border-gray-200 pt-3 space-y-1.5 text-xs sm:text-sm">
                    <div className="flex justify-between text-gray-600">
                      <span>Subtotal</span>
                      <span className="font-medium">${parseFloat(orderDetails.subtotal || "0").toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Costo de envío</span>
                      <span className="font-medium">${parseFloat(orderDetails.deliveryFee || "0").toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm sm:text-base font-extrabold text-gray-900 pt-2 border-t border-gray-100">
                      <span>Total</span>
                      <span className="text-[#2E7D32]">${parseFloat(orderDetails.total || "0").toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-3 sm:p-4 border-t border-gray-100 bg-gray-50 flex justify-end shrink-0">
              <button
                onClick={() => setSelectedOrderId(null)}
                className="min-h-[42px] px-5 bg-white border border-gray-300 rounded-xl text-xs sm:text-sm font-semibold text-gray-700 hover:bg-gray-100 active:scale-98 transition-all shadow-xs"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}