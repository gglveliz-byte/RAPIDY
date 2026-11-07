import { useState, useMemo } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft, CheckCircle, Package, ChevronDown, Phone,
  MessageSquare, Clock, Search, AlertCircle, ShoppingBag,
  CheckCircle2, XCircle
} from "lucide-react";
import {
  useMerchantCommerceId,
  useCommerceOrders,
  useUpdateOrderStatus,
  useMarkCommerceReady,
} from "@/hooks/useDeliveryData";
import { useCommerceEvents } from "@/hooks/useOrderEvents";
import { trpc } from "@/providers/trpc";
import CommerceLayout from "@/components/CommerceLayout";

export default function CommerceOrders() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [expandedOrder, setExpandedOrder] = useState<number | null>(null);

  const { commerceId } = useMerchantCommerceId();
  const updateOrderStatus = useUpdateOrderStatus(commerceId || undefined);
  const markCommerceReady = useMarkCommerceReady(commerceId || undefined);
  const { data: rawOrders = [], loading } = useCommerceOrders(commerceId || 0);

  const orders = useMemo(() => {
    return (rawOrders || []).map((o: any) => {
      if (o.status === "delivered" || o.status === "cancelled") {
        return { ...o, myCommerceStatus: o.status };
      }
      return o;
    });
  }, [rawOrders]);

  const commerceUtils = trpc.useUtils();
  useCommerceEvents(commerceId || undefined, commerceUtils);

  const handleMarkReady = async (orderId: number) => {
    try {
      await markCommerceReady.mutateAsync({ orderId, commerceId: commerceId! });
    } catch (err) {
      console.error(err);
    }
  };

  const handleStatusUpdate = async (orderId: number, status: string) => {
    try {
      await updateOrderStatus.mutateAsync({ id: orderId, status });
    } catch (err) {
      console.error(err);
    }
  };

  // Filter & Search logic
  const filteredOrders = useMemo(() => {
    return orders.filter((o: any) => {
      const currentStatus = o.myCommerceStatus || o.status;
      const matchesFilter = filter === "all" || currentStatus === filter;
      const matchesSearch =
        search.trim() === "" ||
        String(o.id).includes(search.trim()) ||
        (o.customerName && o.customerName.toLowerCase().includes(search.toLowerCase())) ||
        (o.customerPhone && o.customerPhone.includes(search));
      return matchesFilter && matchesSearch;
    });
  }, [orders, filter, search]);

  // Counts by status
  const counts = useMemo(() => {
    const res: Record<string, number> = {
      all: orders.length,
      received: 0,
      preparing: 0,
      ready_for_pickup: 0,
      on_the_way: 0,
      delivered: 0,
      cancelled: 0,
    };
    orders.forEach((o: any) => {
      const st = o.myCommerceStatus || o.status;
      if (res[st] !== undefined) res[st]++;
    });
    return res;
  }, [orders]);

  const statusBadge = (status: string) => {
    const config: Record<string, { label: string; bg: string; text: string }> = {
      received: { label: "Nuevo", bg: "bg-amber-100", text: "text-amber-800" },
      preparing: { label: "Preparando", bg: "bg-indigo-100", text: "text-indigo-800" },
      ready_for_pickup: { label: "Listo para retirar", bg: "bg-purple-100", text: "text-purple-800" },
      picked_up: { label: "En reparto", bg: "bg-blue-100", text: "text-blue-800" },
      on_the_way: { label: "En camino", bg: "bg-blue-100", text: "text-blue-800" },
      delivered: { label: "Entregado", bg: "bg-emerald-100", text: "text-emerald-800" },
      cancelled: { label: "Cancelado", bg: "bg-red-100", text: "text-red-800" },
    };
    const c = config[status] || { label: status, bg: "bg-slate-100", text: "text-slate-800" };
    return (
      <span className={`text-[10px] min-[360px]:text-xs font-bold px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>
        {c.label}
      </span>
    );
  };

  return (
    <CommerceLayout>
      <div className="px-4 min-[380px]:px-6 py-4 sm:py-6 max-w-5xl mx-auto space-y-4 min-[380px]:space-y-5">
        
        {/* Header */}
        <div className="flex items-center justify-between gap-2 bg-white rounded-2xl min-[380px]:rounded-3xl p-3 min-[380px]:p-4.5 border border-slate-200/80 shadow-2xs">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => navigate("/commerce")}
              className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors flex-shrink-0"
              aria-label="Volver"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <h1 className="text-sm min-[360px]:text-base font-extrabold text-slate-800 truncate">
                Gestión de Pedidos
              </h1>
              <p className="text-[10px] text-slate-400 truncate">
                {orders.length} pedidos en total
              </p>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por # de pedido o cliente..."
            className="w-full h-9 min-[360px]:h-10 pl-9 pr-3 bg-white border border-slate-200/90 rounded-xl text-xs min-[360px]:text-sm focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 outline-none text-slate-800 shadow-2xs placeholder:text-slate-400 transition-all"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs px-1"
            >
              Limpiar
            </button>
          )}
        </div>

        {/* Filter Pills with Counters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
          {[
            { key: "all", label: "Todos", count: counts.all },
            { key: "received", label: "Nuevos", count: counts.received },
            { key: "preparing", label: "Preparando", count: counts.preparing },
            { key: "ready_for_pickup", label: "Listos", count: counts.ready_for_pickup },
            { key: "delivered", label: "Entregados", count: counts.delivered },
          ].map((tab) => {
            const isSelected = filter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  isSelected
                    ? "bg-emerald-600 text-white shadow-2xs"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[9px] px-1.5 py-0.2 rounded-full font-extrabold ${
                    isSelected ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Empty state */}
        {!loading && filteredOrders.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-8 text-center shadow-2xs">
            <ShoppingBag className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-slate-700">Sin pedidos</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
              {search
                ? "No hay pedidos que coincidan con la búsqueda."
                : "No hay pedidos en este estado en este momento."}
            </p>
          </div>
        )}

        {/* Orders List */}
        {!loading && (
          <div className="space-y-2.5 min-[360px]:space-y-3">
            {filteredOrders.map((order: any) => {
              const currentStatus = order.myCommerceStatus || order.status;
              const isExpanded = expandedOrder === order.id;
              const cleanPhone = (order.customerPhone || "").replace(/\D/g, "");

              return (
                <div
                  key={order.id}
                  className="bg-white rounded-2xl min-[380px]:rounded-3xl border border-slate-200/80 p-3.5 min-[380px]:p-4.5 shadow-2xs hover:shadow-xs transition-shadow"
                >
                  {/* Top Bar: Order # + Status + Total */}
                  <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-100">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs min-[360px]:text-sm font-black text-slate-800">
                          Pedido #{order.id}
                        </span>
                        {statusBadge(currentStatus)}
                      </div>
                      <p className="text-[10px] min-[360px]:text-xs text-slate-400 mt-0.5 truncate">
                        {order.customerName || "Cliente"}
                      </p>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <span className="text-sm min-[360px]:text-base font-black text-emerald-700">
                        ${parseFloat(order.total || 0).toFixed(2)}
                      </span>
                      <p className="text-[9px] text-slate-400 font-medium">Total con envío</p>
                    </div>
                  </div>

                  {/* Customer Contact & Quick Phone / WhatsApp actions */}
                  {order.customerPhone && (
                    <div className="flex items-center justify-between py-2 border-b border-slate-100 text-xs">
                      <span className="text-[11px] text-slate-600 truncate">
                        Tel: <span className="font-semibold">{order.customerPhone}</span>
                      </span>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <a
                          href={`tel:${order.customerPhone}`}
                          className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-[10px] font-bold flex items-center gap-1 transition-colors"
                          title="Llamar al cliente"
                        >
                          <Phone className="w-3 h-3" />
                          <span className="hidden min-[340px]:inline">Llamar</span>
                        </a>
                        <a
                          href={`https://wa.me/${cleanPhone}`}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2 py-1 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 text-[10px] font-bold flex items-center gap-1 transition-colors"
                          title="WhatsApp"
                        >
                          <MessageSquare className="w-3 h-3" />
                          <span className="hidden min-[340px]:inline">WhatsApp</span>
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Items Summary & Toggle Accordion */}
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                      className="w-full flex items-center justify-between text-[11px] font-bold text-slate-600 hover:text-slate-800 py-1 transition-colors"
                    >
                      <span className="flex items-center gap-1">
                        <Package className="w-3.5 h-3.5 text-slate-400" />
                        {order.items?.length || 0} productos pedidos
                      </span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                      />
                    </button>

                    {isExpanded && order.items && (
                      <div className="mt-2 p-2.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1.5 text-xs">
                        {order.items.map((item: any, i: number) => (
                          <div key={i} className="flex items-center justify-between text-slate-700">
                            <span className="truncate pr-2">
                              <span className="font-bold text-emerald-700">{item.quantity}x</span>{" "}
                              {item.productName}
                            </span>
                            <span className="font-semibold text-slate-800 flex-shrink-0">
                              ${parseFloat(item.unitPrice || 0).toFixed(2)}
                            </span>
                          </div>
                        ))}

                        {order.commerceCommission && (
                          <div className="pt-2 mt-1 border-t border-slate-200/80 flex items-center justify-between text-[10px] text-slate-500">
                            <span>Comisión plataforma</span>
                            <span className="text-red-500 font-bold">-${order.commerceCommission}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Action Buttons depending on status */}
                  <div className="mt-3 pt-2.5 border-t border-slate-100">
                    {currentStatus === "received" && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleStatusUpdate(order.id, "preparing")}
                          className="flex-1 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm shadow-indigo-600/25 active:scale-95 transition-all"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          Aceptar y Preparar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStatusUpdate(order.id, "cancelled")}
                          className="h-9 px-3 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold active:scale-95 transition-all"
                        >
                          Rechazar
                        </button>
                      </div>
                    )}

                    {currentStatus === "preparing" && (
                      <button
                        type="button"
                        onClick={() => handleMarkReady(order.id)}
                        disabled={markCommerceReady.isPending}
                        className="w-full h-9 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm shadow-purple-600/25 active:scale-95 transition-all disabled:opacity-50"
                      >
                        {markCommerceReady.isPending ? (
                          <span className="flex items-center gap-1.5">
                            <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Marcando listo...
                          </span>
                        ) : (
                          <>
                            <CheckCircle className="w-3.5 h-3.5" />
                            Marcar como Listo para Retiro
                          </>
                        )}
                      </button>
                    )}

                    {currentStatus === "ready_for_pickup" && (
                      <div className="w-full h-8 rounded-xl bg-purple-50 text-purple-800 text-[11px] font-bold flex items-center justify-center gap-1.5 border border-purple-200/60">
                        <Clock className="w-3.5 h-3.5 text-purple-600" />
                        Esperando que el repartidor retire el pedido
                      </div>
                    )}

                    {(currentStatus === "on_the_way" || currentStatus === "picked_up") && (
                      <div className="w-full h-8 rounded-xl bg-blue-50 text-blue-800 text-[11px] font-bold flex items-center justify-center gap-1.5 border border-blue-200/60">
                        <Package className="w-3.5 h-3.5 text-blue-600" />
                        En camino al cliente
                      </div>
                    )}

                    {currentStatus === "delivered" && (
                      <div className="w-full h-8 rounded-xl bg-emerald-50 text-emerald-800 text-[11px] font-bold flex items-center justify-center gap-1.5 border border-emerald-200/60">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        Entregado exitosamente
                      </div>
                    )}

                    {currentStatus === "cancelled" && (
                      <div className="w-full h-8 rounded-xl bg-red-50 text-red-700 text-[11px] font-bold flex items-center justify-center gap-1.5 border border-red-200/60">
                        <XCircle className="w-3.5 h-3.5 text-red-500" />
                        Pedido cancelado
                      </div>
                    )}
                  </div>

                </div>
              );
            })}
          </div>
        )}

      </div>
    </CommerceLayout>
  );
}
