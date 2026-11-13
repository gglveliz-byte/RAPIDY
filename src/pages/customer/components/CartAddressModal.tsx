/**
 * @archivo src/pages/customer/components/CartAddressModal.tsx
 * @modulo 02-customer-cart (Modal de Checkout, Entrega y Confirmación de Pago)
 * @proposito
 *   Modal de checkout de alta gama para la confirmación de pedidos de clientes en Rapidy.
 *   Elevado a z-[120] para nunca ser ocluido por barras de navegación flotantes.
 *   Permite seleccionar dirección (guardada, manual o GPS), alternar método de pago
 *   (Efectivo o Transferencia con copia de datos bancarios y previsualización real de foto),
 *   resumen de costos y botón de confirmación fijo (sticky) siempre visible.
 *   Totalmente optimizado para Modo Oscuro (#141418, #1E1E24) y Modo Claro.
 *
 * @resumen_contenido
 *   - Componente `CartAddressModal`: Bottom sheet con handle, selector de entrega,
 *     selector de pago interactivo, previsualizador de comprobante y pie sticky con total en USD.
 *
 * @dependencias_internas
 *   - Ninguna
 *
 * @dependencias_externas
 *   - `react` (`useEffect`, `useRef`, `useState`)
 *   - `lucide-react` (`X`, `MapPin`, `Pencil`, `Navigation`, `Phone`, `CreditCard`, `Banknote`, `Upload`, `CheckCircle2`, `Copy`, `Check`, `AlertCircle`)
 *
 * @tablas_bd_o_redis
 *   - Ninguna (UI y estado de checkout)
 */

import { useEffect, useRef, useState } from "react";
import {
  X,
  MapPin,
  Pencil,
  Navigation,
  Phone,
  CreditCard,
  Banknote,
  Upload,
  CheckCircle2,
  Copy,
  Check,
  AlertCircle,
} from "lucide-react";

interface CustomerData {
  id: number;
  phone: string;
  address?: string;
  firstName?: string;
  lastName?: string;
}

interface CartAddressModalProps {
  customer: CustomerData;
  isOpen: boolean;
  onClose: () => void;
  addressMode: "profile" | "custom" | "current";
  onSelectAddressMode: (mode: "profile" | "custom" | "current") => void;
  customAddress: string;
  onChangeCustomAddress: (val: string) => void;
  currentAddress: string;
  geoLoading: boolean;
  onGetLocation: () => void;
  paymentMethod: "cash" | "transfer";
  onSelectPaymentMethod: (method: "cash" | "transfer") => void;
  total: string;
  subtotal: number;
  deliveryFee: number;
  bankTransferInfo?: string;
  paymentReceipt: string | null;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  loading: boolean;
  canConfirm: boolean;
  onConfirmOrder: () => void;
  error?: string;
}

export function CartAddressModal({
  customer,
  isOpen,
  onClose,
  addressMode,
  onSelectAddressMode,
  customAddress,
  onChangeCustomAddress,
  currentAddress,
  geoLoading,
  onGetLocation,
  paymentMethod,
  onSelectPaymentMethod,
  total,
  subtotal,
  deliveryFee,
  bankTransferInfo,
  paymentReceipt,
  onFileChange,
  loading,
  canConfirm,
  onConfirmOrder,
  error,
}: CartAddressModalProps) {
  const [copiedBank, setCopiedBank] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !loading) onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  const resolvedAddress =
    addressMode === "custom"
      ? customAddress
      : addressMode === "current"
      ? currentAddress
      : customer.address || "";

  const hasValidAddress = Boolean(resolvedAddress.trim());
  const needsReceipt = paymentMethod === "transfer" && !paymentReceipt;

  const bankDetails = (bankTransferInfo || "").trim();

  const handleCopyBank = () => {
    if (!bankDetails || !navigator.clipboard?.writeText) return;
    navigator.clipboard.writeText(bankDetails).then(() => {
      setCopiedBank(true);
      setTimeout(() => setCopiedBank(false), 2000);
    });
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm select-none animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkout-title"
      tabIndex={-1}
      ref={dialogRef}
    >
      {/* Fondo oscuro para cerrar */}
      <div className="absolute inset-0" onClick={() => !loading && onClose()} />

      {/* Contenedor Bottom Sheet */}
      <div className="relative bg-surface dark:bg-[#141418] w-full max-w-[500px] rounded-t-[32px] sm:rounded-3xl shadow-2xl flex flex-col max-h-[92dvh] min-h-[55dvh] border border-zinc-200/80 dark:border-white/10 overflow-hidden text-zinc-900 dark:text-white z-[121] animate-in slide-in-from-bottom-8 duration-200">
        
        {/* Handle de arrastre móvil */}
        <div className="w-12 h-1.5 bg-zinc-300 dark:bg-zinc-700 rounded-full mx-auto my-2.5 shrink-0" />

        {/* Encabezado fijo del modal */}
        <div className="px-5 pb-3 border-b border-zinc-200/80 dark:border-white/10 flex items-center justify-between shrink-0 bg-surface dark:bg-[#141418]">
          <div>
            <h2 id="checkout-title" className="text-base sm:text-lg font-black text-zinc-900 dark:text-white tracking-tight leading-none">
              Confirmar pedido y entrega
            </h2>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium mt-1">
              Revisa tu dirección y método de pago antes de ordenar
            </p>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-200/70 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 active:scale-95 flex items-center justify-center text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white transition-all cursor-pointer"
            aria-label="Cerrar modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Cuerpo Scrollable del Modal */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-3.5 space-y-4 min-h-0">
          
          {/* 1. SECCIÓN: Dirección de Entrega */}
          <div>
            <label className="text-[11px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500 block mb-2">
              1. Dirección de entrega
            </label>
            <div className="space-y-2">
              {/* Opción A: Guardada */}
              <button
                onClick={() => onSelectAddressMode("profile")}
                className={`w-full flex items-start gap-3 p-3.5 rounded-2xl border-2 text-left transition-all cursor-pointer ${
                  addressMode === "profile"
                    ? "border-brand bg-orange-50/70 dark:bg-[#1E1E24] dark:border-brand shadow-xs"
                    : "border-zinc-200/80 dark:border-white/10 bg-white dark:bg-[#1E1E24] hover:border-zinc-300 dark:hover:border-white/20"
                }`}
              >
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                  addressMode === "profile" ? "bg-brand text-white" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400"
                }`}>
                  <MapPin className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white">Mi dirección guardada</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                    {customer.address || "Sin dirección registrada en perfil"}
                  </p>
                </div>
              </button>

              {/* Opción B: Otra dirección */}
              <div
                className={`w-full p-3.5 rounded-2xl border-2 transition-all ${
                  addressMode === "custom"
                    ? "border-brand bg-orange-50/70 dark:bg-[#1E1E24] dark:border-brand shadow-xs"
                    : "border-zinc-200/80 dark:border-white/10 bg-white dark:bg-[#1E1E24] hover:border-zinc-300 dark:hover:border-white/20"
                }`}
              >
                <button
                  onClick={() => onSelectAddressMode("custom")}
                  className="w-full flex items-center gap-3 text-left cursor-pointer"
                >
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                    addressMode === "custom" ? "bg-brand text-white" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400"
                  }`}>
                    <Pencil className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white">Ingresar otra dirección</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Escribir una dirección diferente</p>
                  </div>
                </button>

                {addressMode === "custom" && (
                  <input
                    type="text"
                    value={customAddress}
                    onChange={(e) => onChangeCustomAddress(e.target.value)}
                    placeholder="Calle principal, número y referencia..."
                    className="w-full h-10 px-3 mt-2.5 text-xs border border-zinc-200 dark:border-white/15 rounded-xl focus:border-brand focus:ring-1 focus:ring-brand outline-none bg-white dark:bg-zinc-900 font-medium text-zinc-800 dark:text-white"
                    autoFocus
                  />
                )}
              </div>

              {/* Opción C: Ubicación GPS */}
              <button
                onClick={onGetLocation}
                disabled={geoLoading}
                className={`w-full flex items-start gap-3 p-3.5 rounded-2xl border-2 text-left transition-all cursor-pointer ${
                  addressMode === "current"
                    ? "border-brand bg-orange-50/70 dark:bg-[#1E1E24] dark:border-brand shadow-xs"
                    : "border-zinc-200/80 dark:border-white/10 bg-white dark:bg-[#1E1E24] hover:border-zinc-300 dark:hover:border-white/20"
                }`}
              >
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                  addressMode === "current" ? "bg-brand text-white" : "bg-zinc-100 dark:bg-zinc-800 text-blue-600 dark:text-blue-400"
                }`}>
                  <Navigation className={`w-4 h-4 ${geoLoading ? "animate-spin" : ""}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white">
                    {geoLoading ? "Obteniendo ubicación GPS..." : "Ubicación actual en vivo"}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                    {currentAddress || "Toca para detectar tu ubicación satelital"}
                  </p>
                </div>
              </button>
            </div>

            {/* Teléfono de confirmación */}
            <div className="flex items-center gap-2 mt-2 px-3 py-2 bg-zinc-100/80 dark:bg-zinc-800/80 rounded-xl text-xs text-zinc-600 dark:text-zinc-300">
              <Phone className="w-3.5 h-3.5 text-brand shrink-0" />
              <span>Teléfono de entrega: <strong className="text-zinc-800 dark:text-white">{customer.phone}</strong></span>
            </div>
          </div>

          {/* 2. SECCIÓN: Método de Pago */}
          <div>
            <label className="text-[11px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500 block mb-2">
              2. Método de pago
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onSelectPaymentMethod("cash")}
                className={`h-12 flex items-center justify-center gap-2 rounded-2xl border-2 text-xs font-bold transition-all cursor-pointer ${
                  paymentMethod === "cash"
                    ? "border-brand bg-orange-50 dark:bg-brand/10 text-brand shadow-xs"
                    : "border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E24] text-zinc-600 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-white/20"
                }`}
              >
                <Banknote className="w-4 h-4 stroke-[2.2]" />
                <span>Efectivo al recibir</span>
              </button>

              <button
                onClick={() => onSelectPaymentMethod("transfer")}
                className={`h-12 flex items-center justify-center gap-2 rounded-2xl border-2 text-xs font-bold transition-all cursor-pointer ${
                  paymentMethod === "transfer"
                    ? "border-brand bg-orange-50 dark:bg-brand/10 text-brand shadow-xs"
                    : "border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E24] text-zinc-600 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-white/20"
                }`}
              >
                <CreditCard className="w-4 h-4 stroke-[2.2]" />
                <span>Transferencia</span>
              </button>
            </div>

            {/* Detalle si es Efectivo */}
            {paymentMethod === "cash" && (
              <div className="mt-2.5 p-3.5 bg-orange-50/70 dark:bg-brand/10 border border-orange-200/80 dark:border-brand/20 rounded-2xl flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-brand shrink-0 mt-0.5" />
                <p className="text-xs text-zinc-800 dark:text-zinc-200 leading-relaxed font-medium">
                  Pagarás <strong>${total} USD</strong> en efectivo directamente al repartidor cuando toque tu puerta.
                </p>
              </div>
            )}

            {/* Detalle si es Transferencia */}
            {paymentMethod === "transfer" && (
              <div className="mt-2.5 p-4 bg-orange-50/50 dark:bg-[#1E1E24] rounded-2xl border border-orange-100 dark:border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                    Datos Bancarios Oficiales
                  </span>
                  {bankDetails && (
                    <button
                      onClick={handleCopyBank}
                      className="flex items-center gap-1 text-[11px] font-bold text-brand bg-white dark:bg-zinc-800 px-2.5 py-1 rounded-lg border border-orange-200 dark:border-white/10 shadow-2xs hover:bg-orange-50 dark:hover:bg-zinc-700 active:scale-95 transition-all cursor-pointer"
                    >
                      {copiedBank ? <Check className="w-3 h-3 text-brand" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedBank ? "¡Copiado!" : "Copiar datos"}</span>
                    </button>
                  )}
                </div>

                {bankDetails ? (
                  <div className="p-2.5 bg-white dark:bg-zinc-900 rounded-xl border border-orange-100/80 dark:border-white/10 text-xs text-zinc-700 dark:text-zinc-300 font-mono whitespace-pre-wrap leading-relaxed shadow-2xs">
                    {bankDetails}
                  </div>
                ) : (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-900/50 text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                    Los datos bancarios aún no están configurados. Contacta al comercio antes de transferir.
                  </div>
                )}

                {/* Subida y Previsualización de Comprobante */}
                <div className="pt-1">
                  <label className="text-xs font-bold text-zinc-800 dark:text-zinc-200 block mb-1.5">
                    Adjuntar comprobante de pago *
                  </label>

                  {paymentReceipt ? (
                    <div className="p-3 bg-orange-50/40 dark:bg-zinc-900/70 rounded-xl border border-brand/30 dark:border-brand/40 flex items-center justify-between shadow-2xs">
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={paymentReceipt}
                          alt="Comprobante"
                          className="w-12 h-12 object-cover rounded-lg border border-zinc-200 dark:border-zinc-700 shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-brand flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Comprobante listo</span>
                          </p>
                          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate">Foto cargada correctamente</p>
                        </div>
                      </div>

                      <label className="text-[11px] font-bold text-brand hover:underline cursor-pointer px-2 py-1 bg-white dark:bg-zinc-800 border border-brand/20 dark:border-brand/30 rounded-lg shrink-0">
                        Cambiar
                        <input
                          type="file"
                          accept="image/*"
                          onChange={onFileChange}
                          className="hidden"
                        />
                      </label>
                    </div>
                  ) : (
                    <label className="w-full p-4 border-2 border-dashed border-orange-200 dark:border-zinc-700 bg-white dark:bg-zinc-900/50 hover:bg-orange-50/40 dark:hover:bg-zinc-900 rounded-2xl flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-colors text-center">
                      <div className="w-10 h-10 rounded-full bg-orange-50 dark:bg-brand/10 text-brand flex items-center justify-center">
                        <Upload className="w-5 h-5" />
                      </div>
                      <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                        Toca aquí para subir foto o captura
                      </span>
                      <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                        Formatos JPG, PNG o captura de pantalla
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={onFileChange}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 3. SECCIÓN: Resumen de Costos */}
          <div className="p-3.5 bg-white dark:bg-[#1E1E24] rounded-2xl border border-zinc-200/80 dark:border-white/10 space-y-1.5 shadow-2xs">
            <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400 font-medium">
              <span>Subtotal de productos:</span>
              <span className="font-bold text-zinc-800 dark:text-zinc-200">${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400 font-medium">
              <span>Tarifa de entrega (delivery):</span>
              <span className="font-bold text-zinc-800 dark:text-zinc-200">${deliveryFee.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm sm:text-base font-black text-zinc-900 dark:text-white pt-2 border-t border-zinc-100 dark:border-white/10">
              <span>Total final a pagar:</span>
              <span className="text-brand font-black">${total} USD</span>
            </div>
          </div>

          {/* Alertas informativas de validación */}
          {!hasValidAddress && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 rounded-xl flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>Por favor ingresa o confirma tu dirección de entrega para continuar.</span>
            </div>
          )}

          {needsReceipt && hasValidAddress && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 rounded-xl flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>Adjunta la foto del comprobante de transferencia para confirmar el pedido.</span>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-xl flex items-start gap-2 text-xs text-rose-700 dark:text-rose-300"
            >
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* PIE STICKY FIJO CON BOTÓN DE ACCIÓN (Siempre visible y accesible) */}
        <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] bg-white dark:bg-[#141418] border-t border-zinc-200/80 dark:border-white/10 sticky bottom-0 shrink-0 z-20 shadow-[0_-8px_24px_rgba(0,0,0,0.06)]">
          <button
            onClick={onConfirmOrder}
            disabled={loading || !canConfirm}
            className="w-full min-h-[52px] h-14 bg-brand hover:bg-brand-strong text-white font-black text-sm sm:text-base rounded-2xl shadow-lg shadow-brand/30 transition-all flex items-center justify-between px-5 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.99] cursor-pointer"
          >
            <span>{loading ? "Procesando orden..." : "Confirmar y pedir ahora"}</span>
            <span className="font-black text-base sm:text-lg">${total}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
