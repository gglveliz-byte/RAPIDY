/**
 * @archivo Cart.tsx
 * @modulo Cliente / Carrito de Compras
 * @proposito Pantalla rediseñada del carrito de compras para clientes en Rapidy,
 * con paleta Dark Velvet & Flame Orange, cálculo de totales, gestión de direcciones y checkout.
 */

import { useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  Minus,
  Plus,
  Trash2,
  MapPin,
  Phone,
  CreditCard,
  Banknote,
  Package,
  Navigation,
  Pencil,
} from "lucide-react";
import { useCart } from "@/hooks/useCart";
import { useCustomerSession } from "@/hooks/useCustomerSession";
import { useCreateOrder, usePublicSettings, useCommerces } from "@/hooks/useDeliveryData";
import { getAddressFromCoords } from "@/lib/locationUtils";

export default function Cart() {
  const navigate = useNavigate();
  const { items, subtotal, totalItems, updateQuantity, removeItem, clearCart, getItemsByCommerce } =
    useCart();
  const { customer, isAuthenticated } = useCustomerSession();
  const createOrderMutation = useCreateOrder();
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "transfer">("cash");
  const [paymentReceipt, setPaymentReceipt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [orderId, setOrderId] = useState<number | null>(null);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [addressMode, setAddressMode] = useState<"profile" | "custom" | "current">("profile");
  const [customAddress, setCustomAddress] = useState("");
  const [geoLoading, setGeoLoading] = useState(false);
  const [currentAddress, setCurrentAddress] = useState("");

  const settings = usePublicSettings();
  const { data: commerces, loading: loadingCommerces } = useCommerces();

  const deliveryFee = parseFloat(settings.delivery_fee || "2.50");
  const commissionRate = parseFloat(settings.commission_rate || "8.00");
  const commission = ((subtotal * commissionRate) / 100).toFixed(2);
  const total = (subtotal + deliveryFee).toFixed(2);

  const grouped = getItemsByCommerce();

  const invalidItems = items.filter((item) => {
    const commerce = commerces.find((c: any) => c.id === item.commerceId);
    return !loadingCommerces && (!commerce || commerce.isOpen !== "open");
  });

  const getDeliveryAddress = () => {
    if (addressMode === "custom") return customAddress;
    if (addressMode === "current") return currentAddress;
    return customer?.address || "";
  };

  const handleGetLocation = async () => {
    if (!navigator.geolocation) return;
    setGeoLoading(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
      );
      const addr = await getAddressFromCoords(pos.coords.latitude, pos.coords.longitude);
      setCurrentAddress(addr);
      setAddressMode("current");
    } catch {
      // Ignorar error de geolocalización de forma silenciosa
    } finally {
      setGeoLoading(false);
    }
  };

  const handleCheckout = () => {
    if (!isAuthenticated || !customer) {
      navigate("/register");
      return;
    }
    setShowAddressModal(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPaymentReceipt(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const confirmOrder = async () => {
    if (!customer) return;
    if (items.length === 0) return;

    const deliveryAddress = getDeliveryAddress();
    if (!deliveryAddress.trim()) return;

    if (paymentMethod === "transfer" && !paymentReceipt) {
      return;
    }

    setShowAddressModal(false);
    setLoading(true);
    try {
      const result: any = await createOrderMutation.mutateAsync({
        customerId: customer.id,
        items: items.map((i) => ({
          productId: i.productId,
          commerceId: i.commerceId,
          quantity: i.quantity,
        })),
        deliveryAddress,
        customerPhone: customer.phone,
        paymentMethod,
        paymentReceipt: paymentMethod === "transfer" ? (paymentReceipt || undefined) : undefined,
        deliveryFee: deliveryFee.toFixed(2),
        commission,
      });
      if (result.success) {
        setOrderId(result.order.id);
        setOrderPlaced(true);
        clearCart();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (orderPlaced && orderId) {
    return (
      <div className="mobile-container bg-[#121212] min-h-screen text-white flex flex-col items-center justify-center px-6 text-center">
        <div className="w-20 h-20 bg-[#FF6A00]/15 ring-2 ring-[#FF6A00]/30 rounded-full flex items-center justify-center mb-4 text-[#FF6A00] shadow-[0_0_25px_rgba(255,106,0,0.3)]">
          <Package className="w-10 h-10 text-[#FF6A00]" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">¡Pedido confirmado!</h1>
        <p className="text-zinc-400 text-sm mb-6">
          Tu pedido #{orderId} ha sido recibido y está siendo preparado.
        </p>
        <div className="w-full space-y-3">
          <button
            onClick={() => navigate(`/order/${orderId}`)}
            className="w-full h-12 bg-gradient-to-r from-[#FF6A00] to-[#EE5A00] text-white font-bold rounded-xl shadow-[0_4px_16px_rgba(255,106,0,0.3)] hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center"
          >
            Seguir pedido
          </button>
          <button
            onClick={() => navigate("/home")}
            className="w-full h-12 border border-white/20 text-white font-bold rounded-xl hover:bg-white/5 active:scale-[0.98] transition-all flex items-center justify-center"
          >
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mobile-container bg-[#121212] min-h-screen text-white flex flex-col items-center justify-center px-6 text-center">
        <ShoppingCartEmpty />
        <h2 className="text-lg font-bold text-white mt-4 mb-2">Tu carrito está vacío</h2>
        <p className="text-zinc-400 text-sm mb-6">Agrega productos de tus comercios favoritos</p>
        <button
          onClick={() => navigate("/home")}
          className="h-12 px-8 bg-gradient-to-r from-[#FF6A00] to-[#EE5A00] text-white font-bold rounded-xl shadow-[0_4px_16px_rgba(255,106,0,0.4)] hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center"
        >
          Explorar comercios
        </button>
      </div>
    );
  }

  return (
    <div className="mobile-container bg-[#121212] min-h-screen text-white h-screen h-[100dvh] flex flex-col">
      {/* Header */}
      <div className="bg-[#0E0E12]/95 backdrop-blur-md px-4 pt-safe-top pb-3 flex items-center gap-3 border-b border-white/10 shrink-0 shadow-lg text-white">
        <button
          onClick={() => navigate("/home")}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-zinc-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/5 active:scale-90 transition-transform"
          aria-label="Volver"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <h1 className="text-base font-bold text-white tracking-tight">Carrito ({totalItems})</h1>
      </div>

      {/* Products list — scrollable */}
      <div className="flex-1 overflow-y-auto px-4 mt-3 space-y-3.5 min-h-0 pb-4">
        {Object.entries(grouped).map(([commerceId, group]) => (
          <div key={commerceId} className="bg-[#18181F] rounded-2xl border border-white/10 overflow-hidden shadow-lg">
            <div className="px-4 py-2.5 bg-white/5 border-b border-white/5 text-xs font-bold text-zinc-300 uppercase tracking-wider">
              {group.commerceName}
            </div>
            <div className="divide-y divide-white/5">
              {group.items.map((item) => (
                <div key={item.productId} className="p-3.5 flex gap-3">
                  <div
                    className="w-16 h-16 rounded-xl bg-zinc-800 bg-cover bg-center shrink-0 border border-white/5"
                    style={{ backgroundImage: `url(${item.image})` }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <h4 className="text-sm font-bold text-white truncate pr-2">
                        {item.name} {item.unitType === "kg" && <span className="text-xs text-zinc-400 font-normal ml-1">({item.quantity} kg)</span>}
                      </h4>
                      <button
                        onClick={() => removeItem(item.productId)}
                        className="text-zinc-500 hover:text-red-400 active:scale-90 transition-all p-1 -mr-1"
                        aria-label="Eliminar producto"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between mt-2.5">
                      <span className="text-base font-extrabold text-[#FF6A00]">
                        ${(parseFloat(item.price) * item.quantity).toFixed(2)}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateQuantity(item.productId, item.quantity - (item.unitType === "kg" ? 0.1 : 1))}
                          className="w-8 h-8 rounded-xl bg-white/10 text-zinc-300 hover:bg-white/20 active:scale-90 transition-transform flex items-center justify-center"
                          aria-label="Disminuir cantidad"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-xs font-bold text-white min-w-[24px] text-center">
                          {item.unitType === "kg" ? Number(item.quantity).toFixed(2) : item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(item.productId, item.quantity + (item.unitType === "kg" ? 0.1 : 1))}
                          className="w-8 h-8 rounded-xl bg-[#FF6A00] text-white hover:bg-[#E65F00] active:scale-90 transition-transform shadow-[0_2px_8px_rgba(255,106,0,0.3)] flex items-center justify-center"
                          aria-label="Aumentar cantidad"
                        >
                          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Fixed bottom bar: payment + totals + confirm */}
      <div className="bg-[#0E0E12]/95 backdrop-blur-2xl border-t border-white/10 px-4 pt-3.5 pb-safe z-40 space-y-3 shrink-0 shadow-2xl">
        {invalidItems.length > 0 && (
          <div className="p-3 bg-red-500/10 rounded-xl border border-red-500/20 flex items-start gap-2">
            <span className="text-red-400 font-bold mt-0.5">!</span>
            <p className="text-xs text-red-300 leading-tight">
              Algunos productos pertenecen a comercios que están cerrados o no disponibles. Por favor, elimínalos para continuar.
            </p>
          </div>
        )}

        {/* Payment method inline */}
        <div className="flex gap-2">
          <button
            onClick={() => setPaymentMethod("cash")}
            className={`flex-1 h-11 flex items-center justify-center gap-2 rounded-xl border text-xs font-bold transition-all ${
              paymentMethod === "cash"
                ? "border-[#FF6A00] bg-[#FF6A00]/15 text-[#FF6A00] shadow-[0_0_12px_rgba(255,106,0,0.2)]"
                : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/20"
            }`}
          >
            <Banknote className="w-4 h-4 stroke-[2.2]" />
            Efectivo
          </button>
          <button
            onClick={() => setPaymentMethod("transfer")}
            className={`flex-1 h-11 flex items-center justify-center gap-2 rounded-xl border text-xs font-bold transition-all ${
              paymentMethod === "transfer"
                ? "border-[#FF6A00] bg-[#FF6A00]/15 text-[#FF6A00] shadow-[0_0_12px_rgba(255,106,0,0.2)]"
                : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/20"
            }`}
          >
            <CreditCard className="w-4 h-4 stroke-[2.2]" />
            Transferencia
          </button>
        </div>

        {/* Totals */}
        <div className="bg-white/5 p-3.5 rounded-xl border border-white/5 space-y-1.5">
          <div className="flex justify-between text-xs text-zinc-400 font-medium">
            <span>Subtotal</span>
            <span className="font-semibold text-zinc-200">${subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-xs text-zinc-400 font-medium">
            <span>Envío</span>
            <span className="font-semibold text-zinc-200">${deliveryFee.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-base font-bold text-white pt-1.5 border-t border-white/10">
            <span>Total</span>
            <span className="text-[#FF6A00] font-black text-lg">${total}</span>
          </div>
        </div>

        <button
          onClick={handleCheckout}
          disabled={loading || invalidItems.length > 0}
          className="w-full h-12 bg-gradient-to-r from-[#FF6A00] to-[#EE5A00] text-white font-bold text-sm rounded-xl hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 shadow-[0_4px_18px_rgba(255,106,0,0.35)] flex items-center justify-center"
        >
          {loading ? "Procesando..." : "Continuar con la entrega"}
        </button>
      </div>

      {/* Address modal */}
      {showAddressModal && customer && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm">
          <div
            className="absolute inset-0"
            onClick={() => setShowAddressModal(false)}
          />
          <div className="relative bg-[#18181F] border border-white/10 text-white w-full max-w-[480px] rounded-t-3xl sm:rounded-2xl p-5 pb-safe animate-slide-up max-h-[85dvh] overflow-y-auto shadow-2xl">
            <div className="w-12 h-1 bg-white/20 rounded-full mx-auto mb-4 sm:hidden" />

            <h2 className="text-base font-semibold text-white mb-4">Dirección de entrega</h2>

            <div className="space-y-2">
              <button
                onClick={() => setAddressMode("profile")}
                className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                  addressMode === "profile"
                    ? "border-[#FF6A00] bg-[#FF6A00]/10 text-white"
                    : "border-white/10 bg-white/5 text-zinc-300 hover:border-white/20"
                }`}
              >
                <MapPin className="w-5 h-5 text-[#FF6A00] mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">Mi dirección</p>
                  <p className="text-xs text-zinc-400 truncate">{customer.address || "Sin dirección guardada"}</p>
                </div>
              </button>

              <button
                onClick={() => setAddressMode("custom")}
                className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                  addressMode === "custom"
                    ? "border-[#FF6A00] bg-[#FF6A00]/10 text-white"
                    : "border-white/10 bg-white/5 text-zinc-300 hover:border-white/20"
                }`}
              >
                <Pencil className="w-5 h-5 text-zinc-400 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white">Otra dirección</p>
                  {addressMode === "custom" ? (
                    <input
                      type="text"
                      value={customAddress}
                      onChange={(e) => setCustomAddress(e.target.value)}
                      placeholder="Escribí la dirección"
                      className="w-full h-8 px-2.5 mt-1 text-xs bg-white/10 border border-white/20 text-white placeholder:text-zinc-500 rounded-lg focus:border-[#FF6A00] focus:ring-1 focus:ring-[#FF6A00] outline-none"
                      autoFocus
                    />
                  ) : (
                    <p className="text-xs text-zinc-500">Ingresá una dirección manualmente</p>
                  )}
                </div>
              </button>

              <button
                onClick={handleGetLocation}
                disabled={geoLoading}
                className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                  addressMode === "current"
                    ? "border-[#FF6A00] bg-[#FF6A00]/10 text-white"
                    : "border-white/10 bg-white/5 text-zinc-300 hover:border-white/20"
                }`}
              >
                <Navigation className="w-5 h-5 text-[#FF6A00] mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">
                    {geoLoading ? "Obteniendo..." : "Ubicación actual"}
                  </p>
                  <p className="text-xs text-zinc-400 truncate">
                    {currentAddress || "Usá tu ubicación en tiempo real"}
                  </p>
                </div>
              </button>
            </div>

            <div className="flex items-center gap-2 mt-4 p-3 bg-white/5 border border-white/5 rounded-xl text-sm text-zinc-300">
              <Phone className="w-4 h-4 text-[#FF6A00] shrink-0" />
              <span>{customer.phone}</span>
            </div>

            {paymentMethod === "transfer" && (
              <div className="mt-4 p-3.5 bg-[#FF6A00]/10 border border-[#FF6A00]/20 rounded-xl text-zinc-300">
                <h3 className="text-sm font-semibold text-white mb-2">Datos de Transferencia</h3>
                <p className="text-xs text-zinc-300 mb-3 whitespace-pre-wrap">
                  {settings.bank_transfer_info || "Consultar datos bancarios con soporte."}
                </p>
                <div>
                  <label className="text-[10px] lg:text-xs font-medium text-zinc-300 block mb-1">
                    Adjuntar comprobante *
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="w-full text-xs text-zinc-300 file:mr-4 file:py-1.5 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-[#FF6A00] file:text-white hover:file:bg-[#E65F00] cursor-pointer"
                  />
                  {paymentReceipt && <p className="text-xs text-[#FF6A00] mt-2 font-medium">✓ Comprobante listo</p>}
                </div>
              </div>
            )}

            <button
              onClick={confirmOrder}
              disabled={loading || !getDeliveryAddress().trim() || (paymentMethod === "transfer" && !paymentReceipt)}
              className="w-full h-12 mt-4 bg-gradient-to-r from-[#FF6A00] to-[#EE5A00] text-white font-bold rounded-xl shadow-[0_4px_18px_rgba(255,106,0,0.35)] hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 touch-target flex items-center justify-center"
            >
              {loading ? "Procesando..." : "Confirmar pedido"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ShoppingCartEmpty() {
  return (
    <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-600">
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  );
}