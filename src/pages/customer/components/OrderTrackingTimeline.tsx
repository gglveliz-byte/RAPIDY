/**
 * @archivo src/pages/customer/components/OrderTrackingTimeline.tsx
 * @modulo 02-customer-orders (Línea de Tiempo y Estados del Pedido)
 * @proposito
 *   Componente de visualización del progreso del pedido en tiempo real, estados de preparación,
 *   recogida en múltiples comercios y manejo de alertas de pago rechazado con reenvío de comprobante.
 *   Estética oficial Rapidy con acentos Flame Orange (#FF6A00) y tarjetas luminous suaves.
 *
 * @resumen_contenido
 *   - Componente `OrderTrackingTimeline`: Barra de progreso animada, nodos de estado con checkmarks,
 *     insignia de estado dinámico, desglose por local y banner de acción ante rechazo de pago.
 *
 * @dependencias_externas
 *   - `lucide-react` (`AlertTriangle`, `Upload`, `Check`, `Store`)
 */

import React from "react";
import { AlertTriangle, Upload, Check, Store } from "lucide-react";
import { getOrderStatusMeta, isTerminalStatus } from "@contracts/orderStatus";

interface StatusStep {
  key: string;
  label: string;
  description: string;
}

interface OrderTrackingTimelineProps {
  order: any;
  statusSteps: StatusStep[];
  currentStepIndex: number;
  progress: number;
  isCancelled: boolean;
  isPaymentRejected: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleReuploadReceipt: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isUpdatingReceipt: boolean;
}

export function OrderTrackingTimeline({
  order,
  statusSteps,
  currentStepIndex,
  progress,
  isCancelled,
  isPaymentRejected,
  fileInputRef,
  handleReuploadReceipt,
  isUpdatingReceipt,
}: OrderTrackingTimelineProps) {
  const hasDriver = !!order?.driver;
  const meta = getOrderStatusMeta(order?.status);
  const terminal = isTerminalStatus(order?.status);
  const pickedCount = order?.commerces?.filter((c: any) => c.status === "picked_up").length ?? 0;
  const commerceCount = order?.commerces?.length ?? 0;
  const showPickupCount =
    hasDriver &&
    !terminal &&
    commerceCount > 0 &&
    ["picked_up", "on_the_way"].includes(order?.status) &&
    pickedCount > 0;

  return (
    <div className="space-y-4">
      {/* Banner de Pago Rechazado o Tarjeta de Progreso Principal */}
      {isPaymentRejected ? (
        <div className="bg-rose-50/80 rounded-3xl p-5 border border-rose-200/80 text-center shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-3">
            <AlertTriangle className="w-6 h-6 stroke-[2.2]" />
          </div>
          <h3 className="text-base font-black text-rose-900 mb-1">Pago Rechazado</h3>
          <p className="text-xs text-rose-700/90 leading-relaxed mb-4 max-w-xs mx-auto">
            El comprobante subido no pudo ser validado o es ilegible. Por favor, sube un nuevo comprobante para continuar con la preparación de tu pedido.
          </p>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            ref={fileInputRef}
            onChange={handleReuploadReceipt}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUpdatingReceipt}
            className="w-full min-h-[48px] bg-gradient-to-r from-brand to-[#FF8533] text-white font-black text-sm rounded-2xl hover:brightness-105 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-md shadow-brand/30 cursor-pointer disabled:opacity-50"
          >
            <Upload className="w-4 h-4 stroke-[2.5]" />
            {isUpdatingReceipt ? "Subiendo comprobante..." : "Reenviar nuevo comprobante"}
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-3xl p-5 border border-zinc-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
          {/* Fila superior: Etiqueta y Badge de Estado */}
          <div className="flex items-center justify-between mb-2 gap-2">
            <span className="text-[11px] font-black text-zinc-400 uppercase tracking-wider">
              Estado actual
            </span>

            <span
              className={`text-xs font-black px-3 py-1 rounded-full border shadow-2xs ${
                isCancelled
                  ? "text-rose-600 bg-rose-50 border-rose-200"
                  : meta.badgeClass
              }`}
            >
              {showPickupCount ? `${pickedCount}/${commerceCount} recogidos` : meta.shortLabel}
            </span>
          </div>

          {!isCancelled && (
            <>
              {/* Título del paso actual */}
              <div className="my-2.5" aria-live="polite">
                <p className="text-base sm:text-lg font-black text-zinc-900 tracking-tight">
                  {meta.description}
                </p>
                <p className="text-xs text-zinc-500 font-semibold mt-0.5">
                  {meta.step >= 0
                    ? `Paso ${Math.min(meta.step + 1, statusSteps.length)} de ${statusSteps.length}`
                    : "En revisión"}
                </p>
              </div>

              {/* Barra de progreso interactiva */}
              <div
                className="h-2 bg-zinc-100 rounded-full overflow-hidden my-3"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(Math.min(progress, 100))}
                aria-label="Progreso del pedido"
              >
                <div
                  className="h-full bg-gradient-to-r from-brand to-[#FFA040] rounded-full transition-all duration-700 ease-out shadow-[0_0_12px_rgba(255,106,0,0.4)]"
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
              </div>

              {/* Nodos de progreso (Step Dots) */}
              <div className="flex justify-between items-center px-1 pt-1">
                {statusSteps.map((step, i) => {
                  const isPast = i < currentStepIndex;
                  const isCurrent = i === currentStepIndex;
                  return (
                    <div
                      key={step.key}
                      className="flex flex-col items-center"
                      aria-label={`${step.label}${isCurrent ? ", paso actual" : isPast ? ", completado" : ""}`}
                    >
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black transition-all ${
                          isPast
                            ? "bg-brand text-white shadow-xs"
                            : isCurrent
                              ? "bg-brand text-white ring-4 ring-brand/20 scale-110 shadow-md shadow-brand/30"
                              : "bg-zinc-100 text-zinc-400"
                        }`}
                      >
                        {isPast ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : i + 1}
                      </div>
                      <span className="text-[9px] font-medium text-zinc-500 mt-1 hidden sm:block max-w-[54px] text-center truncate">
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {isCancelled && (
            <p className="text-xs text-rose-700/90 leading-relaxed mt-2">
              {order.cancellationReason
                ? `Motivo: ${order.cancellationReason}`
                : "Este pedido fue cancelado. Si tienes dudas, contáctanos."}
            </p>
          )}
        </div>
      )}

      {/* Recogida en Comercios (en caso de múltiples locales) */}
      {!terminal && hasDriver && order.commerces?.some((c: any) => c.status !== "preparing") && (
        <div className="bg-white rounded-3xl p-5 border border-zinc-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
          <div className="flex items-center gap-2 mb-3">
            <Store className="w-4 h-4 text-brand" />
            <h3 className="text-sm font-black text-zinc-900">Recogida en Comercios</h3>
          </div>
          <div className="space-y-2.5">
            {order.commerces?.map((c: any) => {
              const cStatus = c?.status || "preparing";
              const isReady = cStatus === "ready_for_pickup";
              const isPreparing = cStatus === "preparing";
              const statusLabel = isPreparing ? "Preparando" : isReady ? "Listo para recoger" : "Recogido";
              const statusBadgeStyle = isPreparing
                ? "text-zinc-600 bg-zinc-100 border-zinc-200"
                : isReady
                  ? "text-amber-700 bg-amber-50 border-amber-200"
                  : "text-brand bg-orange-50 border-orange-200";

              return (
                <div key={c.id} className="flex items-center justify-between py-1.5 border-b border-zinc-50 last:border-0">
                  <span className="text-xs sm:text-sm font-bold text-zinc-700">{c.name}</span>
                  <span className={`text-[11px] font-black px-2.5 py-0.5 rounded-full border ${statusBadgeStyle}`}>
                    {statusLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

