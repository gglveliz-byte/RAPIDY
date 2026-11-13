/**
 * @archivo src/pages/customer/components/OrderTrackingDetails.tsx
 * @modulo 02-customer-orders (Detalles de Productos, Precios y Destino del Pedido)
 * @proposito
 *   Renderizado del desglose financiero (subtotal, envío en dólares, comisión y total),
 *   la lista de productos solicitados con sus cantidades, la dirección de entrega
 *   y el banner celebratorio cuando el pedido es entregado exitosamente.
 *
 * @resumen_contenido
 *   - Componente `OrderTrackingDetails`: Desglose de ítems, totales en USD ($),
 *     tarjeta de destino con íconos Rapidy y tarjeta de felicitación al completar entrega.
 *
 * @dependencias_externas
 *   - `react-router` (`useNavigate`)
 *   - `lucide-react` (`MapPin`, `Phone`, `ShoppingBag`, `Receipt`, `CheckCircle2`, `ArrowRight`)
 */

import { useNavigate } from "react-router";
import { MapPin, Phone, ShoppingBag, Receipt, CheckCircle2, ArrowRight } from "lucide-react";

interface OrderTrackingDetailsProps {
  order: any;
  isDelivered: boolean;
  isCancelled: boolean;
}

export function OrderTrackingDetails({
  order,
  isDelivered,
  isCancelled,
}: OrderTrackingDetailsProps) {
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      {/* Tarjeta de Resumen de Productos y Costos */}
      <div className="bg-white rounded-3xl p-5 border border-zinc-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
        <div className="flex items-center gap-2 mb-4 pb-2 border-b border-zinc-100">
          <Receipt className="w-4 h-4 text-brand" />
          <h3 className="text-sm font-black text-zinc-900">Detalles de la compra</h3>
        </div>

        {/* Lista de Artículos */}
        <div className="space-y-3 mb-4">
          {order.items?.length ? (
            order.items.map((item: any) => {
              const quantity = Number(item.quantity);
              return (
              <div key={item.id} className="flex justify-between items-center text-xs sm:text-sm">
                <div className="flex items-center gap-2 min-w-0 pr-2">
                  <span className="min-w-6 h-6 px-1.5 rounded-lg bg-orange-50 text-brand font-black text-[11px] flex items-center justify-center shrink-0">
                    {quantity % 1 === 0 ? quantity : quantity.toFixed(2)}x
                  </span>
                  <span className="text-zinc-700 font-semibold truncate">{item.productName}</span>
                </div>
                <span className="font-black text-zinc-900 shrink-0">
                  ${parseFloat(item.total).toFixed(2)}
                </span>
              </div>
              );
            })
          ) : (
            <p className="text-xs text-zinc-500">No hay artículos registrados en este pedido.</p>
          )}
        </div>

        {/* Desglose de Valores Monetarios */}
        <div className="border-t border-zinc-100 pt-3.5 space-y-2">
          <div className="flex justify-between text-xs text-zinc-500 font-medium">
            <span>Subtotal productos</span>
            <span className="text-zinc-800 font-semibold">
              ${parseFloat(order.subtotal || 0).toFixed(2)}
            </span>
          </div>

          <div className="flex justify-between text-xs text-zinc-500 font-medium">
            <span>Costo de envío</span>
            <span className="text-zinc-800 font-semibold">
              ${parseFloat(order.deliveryFee || 0).toFixed(2)}
            </span>
          </div>

          {/* La comisión es un acuerdo plataforma-comercio; el cliente no la paga aparte. */}
          <div className="flex justify-between items-center text-base font-black text-zinc-900 pt-3 border-t border-zinc-100">
            <span>Total a pagar</span>
            <span className="text-lg text-brand font-black tracking-tight">
              ${parseFloat(order.total || 0).toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Información de Destino y Contacto */}
      {!isDelivered && !isCancelled && (
        <div className="bg-white rounded-3xl p-5 border border-zinc-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] space-y-3">
          <h3 className="text-sm font-black text-zinc-900 mb-2">Destino de entrega</h3>

          <div className="flex items-start gap-3 text-xs sm:text-sm">
            <div className="w-8 h-8 rounded-xl bg-orange-50 text-brand flex items-center justify-center shrink-0">
              <MapPin className="w-4 h-4 stroke-[2.2]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Dirección</p>
              <p className="text-zinc-800 font-semibold mt-0.5 leading-snug">{order.deliveryAddress}</p>
            </div>
          </div>

          {order.customerPhone && (
            <div className="flex items-center gap-3 text-xs sm:text-sm pt-2 border-t border-zinc-50">
              <div className="w-8 h-8 rounded-xl bg-orange-50 text-brand flex items-center justify-center shrink-0">
                <Phone className="w-4 h-4 stroke-[2.2]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Teléfono de contacto</p>
                <p className="text-zinc-800 font-semibold mt-0.5">{order.customerPhone}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Celebración de Pedido Entregado */}
      {isDelivered && (
        <div className="bg-gradient-to-b from-orange-50/60 to-white rounded-3xl p-6 border border-orange-200/60 text-center shadow-md">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-brand to-[#FFA040] text-white flex items-center justify-center mx-auto mb-4 shadow-lg shadow-brand/30 animate-bounce motion-reduce:animate-none">
            <CheckCircle2 className="w-9 h-9 stroke-[2.5]" />
          </div>
          <h2 className="text-xl font-black text-zinc-900 mb-1">¡Pedido Entregado!</h2>
          <p className="text-xs text-zinc-500 font-medium mb-6 max-w-xs mx-auto leading-relaxed">
            Tu repartidor ha completado la entrega de forma exitosa. ¡Esperamos que disfrutes tu pedido!
          </p>
          <button
            onClick={() => navigate("/home")}
            className="w-full h-12 bg-ink hover:bg-black text-white font-black text-sm rounded-2xl active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-lg shadow-black/20 cursor-pointer"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Seguir comprando en Rapidy</span>
            <ArrowRight className="w-4 h-4 ml-1" />
          </button>
          <p className="text-[10px] text-zinc-500 font-semibold mt-3">
            Puedes volver a este pedido desde tu perfil cuando quieras.
          </p>
        </div>
      )}
    </div>
  );
}

