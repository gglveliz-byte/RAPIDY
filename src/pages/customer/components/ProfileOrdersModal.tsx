/**
 * @archivo src/pages/customer/components/ProfileOrdersModal.tsx
 * @modulo 02-customer-profile (Modal de Historial Completo de Pedidos)
 * @proposito
 *   Modal deslizable de alta gama (Bottom Sheet) que despliega la totalidad de los pedidos
 *   del cliente sin ser ocluido por la barra de navegación (z-index superior z-[120]).
 *   Soporta búsqueda por número de pedido o nombre de producto, filtrado por estado,
 *   traducción estricta al español de los estados y diseño escalable para 2 a 100+ pedidos.
 *
 * @resumen_contenido
 *   - Componente `ProfileOrdersModal`: Bottom sheet flotante con backdrop oscuro,
 *     handle de arrastre, buscador reactivo, pestañas de estado (Todos, Entregados, En proceso)
 *     y tarjetas de pedido con desglose de productos y total en USD.
 *
 * @dependencias_internas
 *   - Ninguna
 *
 * @dependencias_externas
 *   - `react` (`useState`, `useMemo`)
 *   - `lucide-react` (`X`, `ShoppingBag`, `ChevronRight`, `Clock`, `Search`, `CheckCircle2`, `Bike`, `AlertCircle`, `XCircle`, `PackageCheck`)
 *   - `react-router` (`useNavigate`)
 *
 * @tablas_bd_o_redis
 *   - PostgreSQL (Neon): `orders`, `order_items`
 */

import { useState, useMemo } from "react";
import { useNavigate } from "react-router";
import {
  X,
  ShoppingBag,
  ChevronRight,
  Clock,
  Search,
  CheckCircle2,
  Bike,
  AlertCircle,
  XCircle,
  PackageCheck,
} from "lucide-react";

export interface OrderItemDetail {
  productName: string;
  quantity: string | number;
  total: string;
}

export interface OrderHistoryItem {
  id: number;
  total: string;
  subtotal?: string;
  status: string;
  createdAt: string;
  items?: OrderItemDetail[];
}

interface ProfileOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: OrderHistoryItem[];
}

// Traductor canónico de estados a español con estilos visuales
function getOrderStatusConfig(status: string) {
  const normalized = (status || "").toLowerCase().trim();
  switch (normalized) {
    case "delivered":
      return {
        label: "Entregado",
        icon: CheckCircle2,
        badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
      };
    case "in_transit":
    case "picked_up":
      return {
        label: "En camino",
        icon: Bike,
        badgeClass: "bg-sky-50 text-sky-700 border-sky-200",
      };
    case "in_preparation":
    case "preparing":
      return {
        label: "En preparación",
        icon: Clock,
        badgeClass: "bg-amber-50 text-amber-800 border-amber-200",
      };
    case "pending_payment":
      return {
        label: "Revisando pago",
        icon: AlertCircle,
        badgeClass: "bg-yellow-50 text-yellow-800 border-yellow-200",
      };
    case "received":
    case "confirmed":
      return {
        label: "Confirmado",
        icon: PackageCheck,
        badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
      };
    case "cancelled":
      return {
        label: "Cancelado",
        icon: XCircle,
        badgeClass: "bg-rose-50 text-rose-700 border-rose-200",
      };
    default:
      return {
        label: normalized ? normalized.replace(/_/g, " ") : "Procesando",
        icon: Clock,
        badgeClass: "bg-zinc-100 text-zinc-700 border-zinc-200",
      };
  }
}

export function ProfileOrdersModal({
  isOpen,
  onClose,
  orders,
}: ProfileOrdersModalProps) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "delivered" | "active">("all");

  // Filtrado reactivo de pedidos para soportar grandes volúmenes de historial
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const normalizedStatus = (order.status || "").toLowerCase();
      
      // Filtro por pestaña
      if (statusFilter === "delivered" && normalizedStatus !== "delivered") return false;
      if (
        statusFilter === "active" &&
        (normalizedStatus === "delivered" || normalizedStatus === "cancelled")
      ) {
        return false;
      }

      // Filtro por búsqueda de texto
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesId = `#${order.id}`.includes(query) || String(order.id).includes(query);
        const matchesItems = order.items?.some((item) =>
          item.productName.toLowerCase().includes(query)
        );
        return matchesId || matchesItems;
      }

      return true;
    });
  }, [orders, statusFilter, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm select-none animate-in fade-in duration-200">
      {/* Fondo oscuro cerrable */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Contenedor del Modal Bottom Sheet */}
      <div className="relative bg-[#F7F7FA] w-full max-w-[500px] rounded-t-[32px] sm:rounded-3xl shadow-2xl flex flex-col max-h-[90dvh] min-h-[50dvh] border border-zinc-200/80 overflow-hidden text-zinc-900 z-[121] animate-in slide-in-from-bottom-8 duration-200">
        
        {/* Handle táctil para dispositivos móviles */}
        <div className="w-12 h-1.5 bg-zinc-300 rounded-full mx-auto my-2.5 shrink-0" />

        {/* Encabezado Principal */}
        <div className="px-5 pb-3 border-b border-zinc-200/80 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-[#FF6A00]/10 border border-[#FF6A00]/20 flex items-center justify-center text-[#FF6A00] shrink-0">
                <ShoppingBag className="w-4 h-4 stroke-[2.4]" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black text-zinc-900 tracking-tight leading-none">
                  Historial de pedidos
                </h2>
                <p className="text-[11px] text-zinc-500 font-medium mt-1">
                  Tienes <strong className="text-zinc-800">{orders.length}</strong> {orders.length === 1 ? "pedido registrado" : "pedidos registrados"}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-zinc-200/70 hover:bg-zinc-200 active:scale-95 flex items-center justify-center text-zinc-600 hover:text-zinc-900 transition-all cursor-pointer"
              aria-label="Cerrar modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Barra de Búsqueda (Visible si hay más de 2 pedidos) */}
          {orders.length > 2 && (
            <div className="relative mt-3">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar por # de orden o producto..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 pl-9 pr-3 text-xs bg-white rounded-xl border border-zinc-200 focus:outline-none focus:border-[#FF6A00] focus:ring-1 focus:ring-[#FF6A00]/20 text-zinc-800 placeholder-zinc-400 shadow-2xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Selector de Pestañas de Estado */}
          {orders.length > 1 && (
            <div className="flex gap-1.5 mt-2.5 overflow-x-auto no-scrollbar">
              <button
                onClick={() => setStatusFilter("all")}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  statusFilter === "all"
                    ? "bg-zinc-900 text-white shadow-xs"
                    : "bg-white text-zinc-600 border border-zinc-200/70 hover:bg-zinc-100"
                }`}
              >
                Todos ({orders.length})
              </button>
              <button
                onClick={() => setStatusFilter("delivered")}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  statusFilter === "delivered"
                    ? "bg-[#FF6A00] text-white shadow-xs shadow-[#FF6A00]/25"
                    : "bg-white text-zinc-600 border border-zinc-200/70 hover:bg-zinc-100"
                }`}
              >
                Entregados ({orders.filter((o) => (o.status || "").toLowerCase() === "delivered").length})
              </button>
              <button
                onClick={() => setStatusFilter("active")}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  statusFilter === "active"
                    ? "bg-sky-600 text-white shadow-xs"
                    : "bg-white text-zinc-600 border border-zinc-200/70 hover:bg-zinc-100"
                }`}
              >
                En proceso ({orders.filter((o) => {
                  const s = (o.status || "").toLowerCase();
                  return s !== "delivered" && s !== "cancelled";
                }).length})
              </button>
            </div>
          )}
        </div>

        {/* Lista Scrollable de Pedidos con protección de borde inferior */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-3 pb-8 min-h-0">
          {filteredOrders.length === 0 ? (
            <div className="py-14 text-center">
              <div className="w-14 h-14 rounded-full bg-zinc-100 flex items-center justify-center mx-auto mb-3 text-zinc-400">
                <ShoppingBag className="w-6 h-6 stroke-[1.5]" />
              </div>
              <p className="text-sm font-bold text-zinc-700">No se encontraron pedidos</p>
              <p className="text-xs text-zinc-400 mt-0.5">
                {searchQuery ? "Intenta con otro término de búsqueda" : "Aún no tienes pedidos en esta categoría"}
              </p>
            </div>
          ) : (
            filteredOrders.map((order) => {
              const statusCfg = getOrderStatusConfig(order.status);
              const StatusIcon = statusCfg.icon;

              return (
                <div
                  key={order.id}
                  onClick={() => {
                    onClose();
                    navigate(`/order/${order.id}`);
                  }}
                  className="w-full bg-white rounded-2xl border border-zinc-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.03)] p-4 hover:border-[#FF6A00]/50 hover:shadow-md transition-all group cursor-pointer text-left"
                >
                  {/* Fila Superior: ID del Pedido + Estado en Español */}
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-zinc-100">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-zinc-900 group-hover:text-[#FF6A00] transition-colors">
                        Pedido #{order.id}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${statusCfg.badgeClass}`}
                      >
                        <StatusIcon className="w-3 h-3 stroke-[2.5]" />
                        <span>{statusCfg.label}</span>
                      </span>
                    </div>

                    <span className="text-sm sm:text-base font-black text-[#FF6A00] shrink-0">
                      ${parseFloat(order.total || "0").toFixed(2)}
                    </span>
                  </div>

                  {/* Detalle de Productos del Pedido */}
                  {order.items && order.items.length > 0 && (
                    <div className="py-2.5 space-y-1">
                      {order.items.slice(0, 3).map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs text-zinc-600">
                          <span className="truncate pr-2">
                            • <strong className="text-zinc-800">{parseFloat(String(item.quantity))}x</strong> {item.productName}
                          </span>
                          <span className="text-zinc-400 shrink-0 text-[11px]">
                            ${parseFloat(item.total || "0").toFixed(2)}
                          </span>
                        </div>
                      ))}
                      {order.items.length > 3 && (
                        <p className="text-[11px] text-zinc-400 font-medium italic pt-0.5">
                          +{order.items.length - 3} productos adicionales...
                        </p>
                      )}
                    </div>
                  )}

                  {/* Fila Inferior: Fecha y Botón de Navegación */}
                  <div className="flex items-center justify-between pt-2 border-t border-zinc-50 text-xs">
                    <div className="flex items-center gap-1.5 text-zinc-400">
                      <Clock className="w-3.5 h-3.5" />
                      <span>
                        {new Date(order.createdAt).toLocaleDateString("es-ES", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-xs font-bold text-[#FF6A00] group-hover:translate-x-0.5 transition-transform">
                      <span>Ver detalle</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
