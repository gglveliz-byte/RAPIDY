/**
 * @archivo src/pages/commerce/Orders.tsx
 * @modulo 06-commerce (Panel de Comercio y Cocina en Tiempo Real)
 * @proposito
 *   Monitor de pedidos y control de cocina en tiempo real para comercios asociados a Rapidy.
 *   Permite aceptar órdenes, iniciar preparación, despachar ("Listo para retiro"), filtrar
 *   por estados, buscar pedidos y consultar notas de clientes en tiempo real.
 *   Integra eventos en vivo vía SSE y queries reactivas con tRPC bajo la estética oficial Rapidy.
 *
 * @resumen_contenido
 *   - Componente `CommerceOrders`: Vista interactiva con selector de pestañas con conteos,
 *     buscador en tiempo real con halo Flame Orange #FF6A00 y lista de pedidos activos.
 *   - Submódulo visual `CommerceOrderCard`: Componente desacoplado que renderiza cada tarjeta de pedido.
 *
 * @dependencias_internas
 *   - `CommerceLayout` (src/components/CommerceLayout.tsx)
 *   - `CommerceOrderCard` (src/components/commerce/CommerceOrderCard.tsx)
 *   - `useMerchantCommerceId`, `useCommerceOrders`, `useUpdateOrderStatus`, `useMarkCommerceReady` (src/hooks/useDeliveryData.ts)
 *   - `useCommerceEvents` (src/hooks/useOrderEvents.ts)
 *   - `trpc` (src/providers/trpc.ts)
 */

import { useState, useMemo } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Search, ShoppingBag } from "lucide-react";
import {
  useMerchantCommerceId,
  useCommerceOrders,
  useUpdateOrderStatus,
  useMarkCommerceReady,
} from "@/hooks/useDeliveryData";
import { useCommerceEvents } from "@/hooks/useOrderEvents";
import { trpc } from "@/providers/trpc";
import CommerceLayout from "@/components/CommerceLayout";
import CommerceOrderCard from "@/components/commerce/CommerceOrderCard";

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

  // Filtrado reactivo por pestaña de estado y búsqueda por id/nombre/teléfono
  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o: any) => {
      const currentStatus = o.myCommerceStatus || o.status;
      const matchesFilter = filter === "all" || currentStatus === filter;
      const matchesSearch =
        !q ||
        String(o.id).includes(q) ||
        (o.customerName && o.customerName.toLowerCase().includes(q)) ||
        (o.customerPhone && o.customerPhone.includes(q));
      return matchesFilter && matchesSearch;
    });
  }, [orders, filter, search]);

  // Contadores agregados por estado de pedido
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

  const statusTabs = [
    { key: "all", label: "Todos", count: counts.all },
    { key: "received", label: "Recibidos", count: counts.received },
    { key: "preparing", label: "En Preparación", count: counts.preparing },
    { key: "ready_for_pickup", label: "Listos para Retiro", count: counts.ready_for_pickup },
    { key: "delivered", label: "Entregados", count: counts.delivered },
    { key: "cancelled", label: "Cancelados", count: counts.cancelled },
  ];

  return (
    <CommerceLayout>
      <div className="px-4 min-[380px]:px-6 py-4 sm:py-6 max-w-5xl mx-auto space-y-4 min-[380px]:space-y-5">
        
        {/* Cabecera Principal */}
        <div className="flex items-center justify-between gap-3 bg-white rounded-3xl p-4 sm:p-5 border border-zinc-200/80 shadow-xs">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => navigate("/commerce")}
              className="w-9 h-9 rounded-2xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
              aria-label="Volver al panel"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black text-zinc-900 truncate">
                  Monitor de Pedidos y Cocina
                </h1>
                <span className="inline-flex items-center gap-1 text-[10px] bg-[#FF6A00]/10 text-[#FF6A00] font-black px-2 py-0.5 rounded-full border border-[#FF6A00]/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#FF6A00] animate-ping" />
                  En Vivo
                </span>
              </div>
              <p className="text-xs text-zinc-400 truncate mt-0.5">
                {orders.length} {orders.length === 1 ? "pedido registrado" : "pedidos en total"} · Gestión de preparación en tiempo real
              </p>
            </div>
          </div>
        </div>

        {/* Buscador de Órdenes con Anillo de Enfoque Flame Orange */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por # de pedido, cliente o teléfono..."
            className="w-full h-11 pl-10 pr-16 bg-white border border-zinc-200/90 rounded-2xl text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/20 shadow-xs transition-all"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-400 hover:text-zinc-600 px-2 py-1 rounded-lg transition-colors cursor-pointer"
            >
              Limpiar
            </button>
          )}
        </div>

        {/* Selector de Pestañas de Estado con Indicador Numérico */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar text-xs">
          {statusTabs.map((tab) => {
            const isSelected = filter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key)}
                className={`px-3.5 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 cursor-pointer ${
                  isSelected
                    ? "bg-[#FF6A00] text-white shadow-md shadow-[#FF6A00]/25"
                    : "bg-white text-zinc-600 border border-zinc-200/80 hover:bg-zinc-50 hover:border-zinc-300"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-black ${
                    isSelected ? "bg-white/25 text-white" : "bg-zinc-100 text-zinc-600"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Indicador de Carga */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-10 h-10 border-4 border-[#FF6A00] border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-semibold text-zinc-400">Sincronizando pedidos en tiempo real...</p>
          </div>
        )}

        {/* Estado Vacío */}
        {!loading && filteredOrders.length === 0 && (
          <div className="bg-white rounded-3xl border border-zinc-200/80 p-10 text-center shadow-xs">
            <div className="w-16 h-16 rounded-full bg-[#FF6A00]/10 text-[#FF6A00] flex items-center justify-center mx-auto mb-3">
              <ShoppingBag className="w-8 h-8" />
            </div>
            <h3 className="text-base font-extrabold text-zinc-800">
              {search ? "Sin resultados para tu búsqueda" : "No hay pedidos en esta sección"}
            </h3>
            <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
              {search
                ? `No encontramos ningún pedido que coincida con "${search}". Intenta con otro término o limpia el buscador.`
                : "Los nuevos pedidos aparecerán automáticamente aquí cuando los clientes los soliciten."}
            </p>
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="mt-4 px-4 py-2 rounded-2xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-bold transition-all cursor-pointer"
              >
                Limpiar búsqueda
              </button>
            )}
          </div>
        )}

        {/* Lista de Tarjetas de Pedidos en Tiempo Real */}
        {!loading && (
          <div className="space-y-3.5">
            {filteredOrders.map((order: any) => {
              const currentStatus = order.myCommerceStatus || order.status;
              const isExpanded = expandedOrder === order.id;

              return (
                <CommerceOrderCard
                  key={order.id}
                  order={order}
                  currentStatus={currentStatus}
                  isExpanded={isExpanded}
                  onToggleExpand={(id) => setExpandedOrder(expandedOrder === id ? null : id)}
                  onMarkReady={handleMarkReady}
                  isMarkReadyPending={markCommerceReady.isPending}
                  onStatusUpdate={handleStatusUpdate}
                />
              );
            })}
          </div>
        )}

      </div>
    </CommerceLayout>
  );
}
