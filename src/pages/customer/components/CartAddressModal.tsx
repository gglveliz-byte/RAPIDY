/**
 * @archivo src/pages/customer/components/CartAddressModal.tsx
 * @modulo 02-customer-cart (Modal de Selección de Dirección y Checkout)
 * @proposito
 *   Modal deslizable inferior para la confirmación de entrega en el carrito de compras.
 *   Permite seleccionar entre la dirección guardada del perfil, una dirección escrita
 *   manualmente o la ubicación GPS en tiempo real con OpenStreetMap Nominatim.
 *   Gestiona también la carga de comprobantes para pagos por transferencia bancaria.
 *
 * @resumen_contenido
 *   - Componente `CartAddressModal`: Bottom sheet con tarjetas de selección de dirección,
 *     teléfono de contacto, caja de datos bancarios con subida de archivo y botón de confirmación.
 *
 * @dependencias_internas
 *   - Ninguna
 *
 * @dependencias_externas
 *   - `lucide-react` (`MapPin`, `Pencil`, `Navigation`, `Phone`)
 *
 * @tablas_bd_o_redis
 *   - Ninguna (UI y estado local)
 */

import { MapPin, Pencil, Navigation, Phone } from "lucide-react";

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
  bankTransferInfo?: string;
  paymentReceipt: string | null;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  loading: boolean;
  canConfirm: boolean;
  onConfirmOrder: () => void;
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
  bankTransferInfo,
  paymentReceipt,
  onFileChange,
  loading,
  canConfirm,
  onConfirmOrder,
}: CartAddressModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative bg-white w-full max-w-[480px] rounded-t-3xl sm:rounded-2xl p-5 pb-safe animate-slide-up max-h-[85dvh] overflow-y-auto shadow-2xl text-zinc-900 border border-zinc-100">
        <div className="w-12 h-1 bg-zinc-300 rounded-full mx-auto mb-4 sm:hidden" />

        <h2 className="text-base font-black text-zinc-900 mb-4 tracking-tight">
          Dirección de entrega
        </h2>

        <div className="space-y-2">
          {/* Opción 1: Mi dirección guardada */}
          <button
            onClick={() => onSelectAddressMode("profile")}
            className={`w-full flex items-start gap-3 p-3.5 rounded-2xl border-2 text-left transition-all cursor-pointer ${
              addressMode === "profile"
                ? "border-[#FF6A00] bg-orange-50/50 shadow-xs"
                : "border-zinc-100 bg-zinc-50/80 hover:bg-zinc-100"
            }`}
          >
            <MapPin className="w-5 h-5 text-[#FF6A00] mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-zinc-900">Mi dirección</p>
              <p className="text-xs text-zinc-500 truncate">
                {customer.address || "Sin dirección guardada"}
              </p>
            </div>
          </button>

          {/* Opción 2: Otra dirección manual */}
          <button
            onClick={() => onSelectAddressMode("custom")}
            className={`w-full flex items-start gap-3 p-3.5 rounded-2xl border-2 text-left transition-all cursor-pointer ${
              addressMode === "custom"
                ? "border-[#FF6A00] bg-orange-50/50 shadow-xs"
                : "border-zinc-100 bg-zinc-50/80 hover:bg-zinc-100"
            }`}
          >
            <Pencil className="w-5 h-5 text-zinc-500 mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-zinc-900">Otra dirección</p>
              {addressMode === "custom" ? (
                <input
                  type="text"
                  value={customAddress}
                  onChange={(e) => onChangeCustomAddress(e.target.value)}
                  placeholder="Escribí la dirección completa"
                  className="w-full h-9 px-3 mt-1.5 text-xs border border-zinc-200 rounded-xl focus:border-[#FF6A00] focus:ring-1 focus:ring-[#FF6A00] outline-none bg-white"
                  autoFocus
                />
              ) : (
                <p className="text-xs text-zinc-400">Ingresá una dirección manualmente</p>
              )}
            </div>
          </button>

          {/* Opción 3: Ubicación GPS actual */}
          <button
            onClick={onGetLocation}
            disabled={geoLoading}
            className={`w-full flex items-start gap-3 p-3.5 rounded-2xl border-2 text-left transition-all cursor-pointer ${
              addressMode === "current"
                ? "border-[#FF6A00] bg-orange-50/50 shadow-xs"
                : "border-zinc-100 bg-zinc-50/80 hover:bg-zinc-100"
            }`}
          >
            <Navigation className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-zinc-900">
                {geoLoading ? "Obteniendo ubicación..." : "Ubicación actual"}
              </p>
              <p className="text-xs text-zinc-500 truncate">
                {currentAddress || "Usá tu ubicación GPS en tiempo real"}
              </p>
            </div>
          </button>
        </div>

        {/* Teléfono de contacto */}
        <div className="flex items-center gap-2 mt-4 p-3 bg-zinc-50 rounded-2xl text-xs sm:text-sm text-zinc-600 border border-zinc-100">
          <Phone className="w-4 h-4 text-[#FF6A00] shrink-0" />
          <span className="font-medium">{customer.phone}</span>
        </div>

        {/* Datos bancarios para transferencias */}
        {paymentMethod === "transfer" && (
          <div className="mt-4 p-3.5 bg-orange-50/40 rounded-2xl border border-orange-100">
            <h3 className="text-xs font-bold text-zinc-900 mb-1.5 uppercase tracking-wider">
              Datos de Transferencia
            </h3>
            <p className="text-xs text-zinc-600 mb-3 whitespace-pre-wrap leading-relaxed">
              {bankTransferInfo || "Consultar datos bancarios con soporte."}
            </p>
            <div>
              <label className="text-[11px] font-bold text-zinc-700 block mb-1.5">
                Adjuntar comprobante *
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={onFileChange}
                className="w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-[#FF6A00] file:text-white hover:file:bg-[#e65f00] cursor-pointer"
              />
              {paymentReceipt && (
                <p className="text-xs text-emerald-600 mt-2 font-bold flex items-center gap-1">
                  ✓ Comprobante listo
                </p>
              )}
            </div>
          </div>
        )}

        {/* Botón de confirmación final */}
        <button
          onClick={onConfirmOrder}
          disabled={loading || !canConfirm}
          className="w-full h-12 mt-5 bg-[#FF6A00] hover:bg-[#e65f00] text-white font-bold rounded-2xl shadow-md shadow-[#FF6A00]/30 transition-all disabled:opacity-50 cursor-pointer"
        >
          {loading ? "Procesando..." : "Confirmar pedido"}
        </button>
      </div>
    </div>
  );
}
