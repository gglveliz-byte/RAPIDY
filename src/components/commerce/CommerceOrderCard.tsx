/**
 * @archivo src/components/commerce/CommerceOrderCard.tsx
 * @modulo 06-commerce (Panel de Comercio y Cocina en Tiempo Real)
 * @proposito
 *   Tarjeta individual de orden en cocina para el monitor de pedidos en tiempo real.
 *   Muestra cabecera con número de pedido, tiempo transcurrido, insignias de estado,
 *   contacto rápido del cliente (teléfono y WhatsApp), notas especiales, desglose
 *   expandible de productos y los botones de acción para avanzar el ciclo de cocina.
 *
 * @resumen_contenido
 *   - Componente `CommerceOrderCard`: Tarjeta modular con estética oficial Rapidy (#FF6A00).
 *   - Helper visual `renderBadge`: Insignia semántica de estado sin verdes legados.
 *   - Helper `formatTimeAgo`: Tiempo relativo transcurrido para control de cocina.
 *
 * @dependencias_internas
 *   - Ninguna dependencia circular. Recibe props puras desde Orders.tsx.
 */

import {
  Package, ChevronDown, Phone, MessageSquare, Clock,
  AlertCircle, CheckCircle, CheckCircle2, XCircle,
} from "lucide-react";
import {
  getOrderStatusMeta,
  commerceCanMarkReady,
  commerceCanPrepare,
} from "@contracts/orderStatus";

export interface CommerceOrderCardProps {
  order: any;
  currentStatus: string;
  isExpanded: boolean;
  onToggleExpand: (orderId: number) => void;
  onMarkReady: (orderId: number) => void;
  isMarkReadyPending: boolean;
  onStatusUpdate: (orderId: number, status: string) => void;
  isStatusPending?: boolean;
}

function formatTimeAgo(dateInput?: string | Date | null): string {
  if (!dateInput) return "";
  try {
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return "";
    const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diffSec < 60) return "Hace un momento";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `Hace ${diffMin} min`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `Hace ${diffHours} h`;
    return `Hace ${Math.floor(diffHours / 24)} d`;
  } catch {
    return "";
  }
}

export default function CommerceOrderCard({
  order,
  currentStatus,
  isExpanded,
  onToggleExpand,
  onMarkReady,
  isMarkReadyPending,
  onStatusUpdate,
  isStatusPending = false,
}: CommerceOrderCardProps) {
  const cleanPhone = (order.customerPhone || "").replace(/\D/g, "");
  const statusMeta = getOrderStatusMeta(currentStatus);
  const canPrepare = commerceCanPrepare(currentStatus);
  const canMarkReady = commerceCanMarkReady(currentStatus);
  const isPaymentPending = currentStatus === "pending_payment";
  const isPaymentRejected = currentStatus === "payment_rejected";

  return (
    <div className="bg-white dark:bg-[#16161B] border border-zinc-200/80 dark:border-white/10 rounded-3xl p-5 shadow-xs hover:border-[#FF6A00]/40 transition-all">
      {/* Cabecera de la Orden: Número, Estado y Subtotal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3.5 border-b border-zinc-100 dark:border-white/5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm sm:text-base font-black text-zinc-900 dark:text-white tracking-tight">
              Pedido #{order.id}
            </span>
            <span
              className={`text-[10px] min-[360px]:text-xs font-bold px-2.5 py-0.5 rounded-full border ${statusMeta.badgeClass}`}
            >
              {statusMeta.shortLabel}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="font-semibold text-zinc-700 dark:text-zinc-300 truncate">
              {order.customerName || "Cliente"}
            </span>
            {order.createdAt && (
              <>
                <span className="text-zinc-300 dark:text-zinc-600">•</span>
                <div className="flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                  <Clock className="w-3.5 h-3.5 text-[#FF6A00]" />
                  <span>{formatTimeAgo(order.createdAt)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-2 sm:pt-0 border-zinc-100 dark:border-white/5">
          <span className="text-base sm:text-lg font-black text-zinc-900 dark:text-white">
            ${parseFloat(order.total || 0).toFixed(2)}
          </span>
          <span className="text-[10px] text-zinc-400 font-medium">Subtotal comercio</span>
        </div>
      </div>

      {/* Contacto Rápido del Cliente */}
      {order.customerPhone && (
        <div className="flex items-center justify-between py-2.5 border-b border-zinc-100 dark:border-white/5 text-xs">
          <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300 truncate">
            <Phone className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-zinc-500 dark:text-zinc-400">Tel:</span>
            <span className="font-bold text-zinc-800 dark:text-zinc-100">{order.customerPhone}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <a
              href={`tel:${order.customerPhone}`}
              className="px-2.5 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Llamar al cliente"
            >
              <Phone className="w-3 h-3" />
              <span className="hidden min-[360px]:inline">Llamar</span>
            </a>
            <a
              href={`https://wa.me/${cleanPhone}`}
              target="_blank"
              rel="noreferrer"
              className="px-2.5 py-1.5 rounded-xl bg-[#25D366]/10 text-[#075e54] hover:bg-[#25D366]/20 text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="WhatsApp"
            >
              <MessageSquare className="w-3 h-3 text-[#128C7E]" />
              <span className="hidden min-[360px]:inline">WhatsApp</span>
            </a>
          </div>
        </div>
      )}

      {/* Notas Especiales del Pedido */}
      {order.notes && (
        <div className="my-2.5 p-3 rounded-2xl bg-amber-50/80 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-800/30 text-xs">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="font-bold text-amber-900 dark:text-amber-200">Nota especial del pedido:</p>
              <p className="text-amber-800 dark:text-amber-300 mt-0.5 whitespace-pre-wrap">{order.notes}</p>
            </div>
          </div>
        </div>
      )}

      {/* Desglose de Productos y Acordeón */}
      <div className="pt-2">
        <button
          type="button"
          onClick={() => onToggleExpand(order.id)}
          className="w-full flex items-center justify-between text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white py-1.5 transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Package className="w-4 h-4 text-[#FF6A00]" />
            <span>
              {order.items?.length || 0} {order.items?.length === 1 ? "producto pedido" : "productos pedidos"}
            </span>
          </span>
          <ChevronDown
            className={`w-4 h-4 text-zinc-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
          />
        </button>

        {isExpanded && order.items && (
          <div className="mt-2 p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-white/5 space-y-2 text-xs">
            {order.items.map((item: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-zinc-700 dark:text-zinc-300 py-0.5">
                <div className="min-w-0 pr-2">
                  <span className="font-black text-[#FF6A00] mr-1.5">{item.quantity}x</span>
                  <span className="font-medium text-zinc-800 dark:text-zinc-100">{item.productName}</span>
                </div>
                <span className="font-bold text-zinc-900 dark:text-white shrink-0">
                  ${parseFloat(item.unitPrice || 0).toFixed(2)}
                </span>
              </div>
            ))}

            {order.commerceCommission && (
              <div className="pt-2 mt-1 border-t border-zinc-200 dark:border-white/5 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                <span>Comisión estimada plataforma</span>
                <span className="text-red-500 font-bold">-${order.commerceCommission}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Botones de Acción de Cocina según Estado */}
      <div className="mt-3.5 pt-3 border-t border-zinc-100">
        {isPaymentPending && (
          <div className="w-full py-2.5 px-4 rounded-2xl bg-amber-50 text-amber-900 text-xs font-bold flex items-center justify-center gap-2 border border-amber-200/70">
            <Clock className="w-4 h-4 text-amber-600" />
            <span>Pago pendiente de validación. No prepares hasta que se confirme.</span>
          </div>
        )}

        {isPaymentRejected && (
          <div className="w-full py-2.5 px-4 rounded-2xl bg-red-50 text-red-700 text-xs font-bold flex items-center justify-center gap-2 border border-red-200/70">
            <XCircle className="w-4 h-4 text-red-500" />
            <span>Pago rechazado. No prepares este pedido.</span>
          </div>
        )}

        {canPrepare && (
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => onStatusUpdate(order.id, "preparing")}
              disabled={isStatusPending}
              className="flex-1 bg-[#FF6A00] hover:bg-[#e65f00] text-white font-bold py-3 px-5 rounded-2xl shadow-md shadow-[#FF6A00]/25 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-xs sm:text-sm cursor-pointer"
            >
              <CheckCircle className="w-4 h-4" />
              <span>{currentStatus === "received" ? "Aceptar y Preparar" : "Empezar preparación"}</span>
            </button>
            <button
              type="button"
              onClick={() => onStatusUpdate(order.id, "cancelled")}
              disabled={isStatusPending}
              className="h-11 sm:h-auto px-4 py-2.5 rounded-2xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            >
              Rechazar
            </button>
          </div>
        )}

        {canMarkReady && (
          <button
            type="button"
            onClick={() => onMarkReady(order.id)}
            disabled={isMarkReadyPending}
            className="w-full bg-[#FF6A00] hover:bg-[#e65f00] text-white font-bold py-3 px-5 rounded-2xl shadow-md shadow-[#FF6A00]/25 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer text-xs sm:text-sm"
          >
            {isMarkReadyPending ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Notificando al repartidor...</span>
              </span>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Listo para entregar al repartidor</span>
              </>
            )}
          </button>
        )}

        {currentStatus === "ready_for_pickup" && (
          <div className="w-full py-2.5 px-4 rounded-2xl bg-purple-50 text-purple-900 text-xs font-bold flex items-center justify-center gap-2 border border-purple-200/70">
            <Clock className="w-4 h-4 text-purple-600" />
            <span>Esperando que el repartidor retire el pedido</span>
          </div>
        )}

        {currentStatus === "driver_assigned" && (
          <div className="w-full py-2.5 px-4 rounded-2xl bg-sky-50 text-sky-900 text-xs font-bold flex items-center justify-center gap-2 border border-sky-200/70">
            <Package className="w-4 h-4 text-sky-600" />
            <span>Repartidor asignado · Esperando retiro</span>
          </div>
        )}

        {(currentStatus === "on_the_way" || currentStatus === "picked_up") && (
          <div className="w-full py-2.5 px-4 rounded-2xl bg-blue-50 text-blue-900 text-xs font-bold flex items-center justify-center gap-2 border border-blue-200/70">
            <Package className="w-4 h-4 text-blue-600" />
            <span>En camino · Pedido en tránsito hacia el cliente</span>
          </div>
        )}

        {currentStatus === "delivered" && (
          <div className="w-full py-2.5 px-4 rounded-2xl bg-zinc-100 text-zinc-800 text-xs font-bold flex items-center justify-center gap-2 border border-zinc-200/80">
            <CheckCircle2 className="w-4 h-4 text-zinc-600" />
            <span>Entregado exitosamente</span>
          </div>
        )}

        {currentStatus === "cancelled" && (
          <div className="w-full py-2.5 px-4 rounded-2xl bg-red-50 text-red-700 text-xs font-bold flex items-center justify-center gap-2 border border-red-200/70">
            <XCircle className="w-4 h-4 text-red-500" />
            <span>{order.cancellationReason ? `Cancelado: ${order.cancellationReason}` : "Pedido cancelado"}</span>
          </div>
        )}
      </div>
    </div>
  );
}
