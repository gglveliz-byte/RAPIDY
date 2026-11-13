/**
 * @archivo src/pages/customer/components/ProfileOrdersModal.tsx
 * @modulo 02-customer-profile (Modal de Historial Completo de Pedidos)
 * @proposito
 *   Modal deslizable que despliega la totalidad de los pedidos históricos del cliente.
 *   Permite revisar el estado de cada orden, fecha de realización, importe total
 *   y acceder de inmediato al detalle del pedido mediante `/order/:id`.
 *
 * @resumen_contenido
 *   - Componente `ProfileOrdersModal`: Bottom sheet accesible desde el botón "Ver todos"
 *     del perfil de cliente con lista completa de pedidos scrollable y diseño Rapidy.
 *
 * @dependencias_internas
 *   - Ninguna
 *
 * @dependencias_externas
 *   - `lucide-react` (`X`, `ShoppingBag`, `ChevronRight`, `Clock`)
 *   - `react-router` (`useNavigate`)
 *
 * @tablas_bd_o_redis
 *   - PostgreSQL (Neon): `orders`
 */

import { useNavigate } from "react-router";
import { X, ShoppingBag, ChevronRight, Clock } from "lucide-react";

interface OrderItem {
  id: number;
  total: string;
  status: string;
  createdAt: string;
}

interface ProfileOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: OrderItem[];
}

export function ProfileOrdersModal({
  isOpen,
  onClose,
  orders,
}: ProfileOrdersModalProps) {
  const navigate = useNavigate();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs select-none">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative bg-[#F7F7FA] w-full max-w-[480px] rounded-t-3xl sm:rounded-2xl p-5 pb-safe animate-slide-up max-h-[88dvh] flex flex-col shadow-2xl text-zinc-900 border border-zinc-100">
        {/* Handle para móvil */}
        <div className="w-12 h-1 bg-zinc-300 rounded-full mx-auto mb-3 sm:hidden shrink-0" />

        {/* Encabezado del Modal */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-200/80 shrink-0">
          <div>
            <h2 className="text-base sm:text-lg font-black text-zinc-900 tracking-tight">
              Historial de pedidos
            </h2>
            <p className="text-xs text-zinc-500 font-medium">
              Total de órdenes realizadas: {orders.length}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-200/70 hover:bg-zinc-200 flex items-center justify-center text-zinc-600 hover:text-zinc-900 transition-colors cursor-pointer"
            aria-label="Cerrar modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Lista de Pedidos (Scrollable) */}
        <div className="flex-1 overflow-y-auto mt-3 space-y-2.5 pr-1 min-h-0">
          {orders.length === 0 ? (
            <div className="py-12 text-center">
              <ShoppingBag className="w-12 h-12 text-zinc-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-zinc-500">No tienes pedidos aún</p>
            </div>
          ) : (
            orders.map((order) => (
              <button
                key={order.id}
                onClick={() => {
                  onClose();
                  navigate(`/order/${order.id}`);
                }}
                className="w-full bg-white rounded-2xl border border-zinc-100 shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-4 flex items-center justify-between text-left hover:border-[#FF6A00]/40 hover:shadow-md transition-all group cursor-pointer"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-zinc-900 group-hover:text-[#FF6A00] transition-colors">
                      Pedido #{order.id}
                    </span>
                    <span
                      className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        order.status === "pending_payment"
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : order.status === "delivered"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : order.status === "cancelled"
                          ? "bg-red-50 text-red-700 border border-red-200"
                          : "bg-blue-50 text-blue-700 border border-blue-200"
                      }`}
                    >
                      {order.status === "pending_payment"
                        ? "Revisando pago"
                        : order.status.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-zinc-400 mt-1">
                    <Clock className="w-3.5 h-3.5 text-zinc-400" />
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
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-sm sm:text-base font-black text-[#FF6A00]">
                    ${order.total}
                  </span>
                  <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-[#FF6A00] transition-colors" />
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

