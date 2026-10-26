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

  const invalidItems = items.filter(item => {
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
    } catch {} finally {
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
      <div className="mobile-container bg-gray-50 min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-4">
          <Package className="w-10 h-10 text-[#2E7D32]" />
        </div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Pedido confirmado!</h1>
        <p className="text-gray-500 text-sm mb-6">
          Tu pedido #{orderId} ha sido recibido y esta siendo preparado.
        </p>
        <div className="w-full space-y-3">
          <button
            onClick={() => navigate(`/order/${orderId}`)}
            className="w-full h-12 bg-[#2E7D32] text-white font-medium rounded-xl hover:bg-[#1B5E20] transition-all"
          >
            Seguir pedido
          </button>
          <button
            onClick={() => navigate("/home")}
            className="w-full h-12 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-all"
          >
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mobile-container bg-gray-50 min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <ShoppingCartEmpty />
        <h2 className="text-lg font-semibold text-gray-800 mt-4 mb-2">Tu carrito esta vacio</h2>
        <p className="text-gray-500 text-sm mb-6">Agrega productos de tus comercios favoritos</p>
        <button
          onClick={() => navigate("/home")}
          className="h-12 px-8 bg-[#2E7D32] text-white font-medium rounded-xl hover:bg-[#1B5E20] transition-all"
        >
          Explorar comercios
        </button>
      </div>
    );
  }

  return (
    <div className="mobile-container bg-gray-50 h-screen h-[100dvh] flex flex-col">
      {/* Header */}
      <div className="bg-white/95 backdrop-blur-md px-4 pt-safe-top pb-3 flex items-center gap-3 border-b border-gray-100 shrink-0 shadow-xs">
        <button 
          onClick={() => navigate("/home")} 
          className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-600 hover:bg-gray-100 active:scale-90 transition-transform"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-base font-bold text-gray-800">Carrito ({totalItems})</h1>
      </div>

      {/* Products list — scrollable */}
      <div className="flex-1 overflow-y-auto px-4 mt-3 space-y-3.5 min-h-0 pb-4">
        {Object.entries(grouped).map(([commerceId, group]) => (
          <div key={commerceId} className="bg-white rounded-2xl card-shadow overflow-hidden border border-gray-100/80">
            <div className="px-4 py-2.5 bg-gray-50/80 border-b border-gray-100">
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">{group.commerceName}</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {group.items.map((item) => (
                <div key={item.productId} className="p-3.5 flex gap-3">
                  <div
                    className="w-16 h-16 rounded-xl bg-gray-100 bg-cover bg-center flex-shrink-0"
                    style={{ backgroundImage: `url(${item.image})` }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <h4 className="text-sm font-bold text-gray-800 truncate pr-2">
                        {item.name} {item.unitType === "kg" && <span className="text-xs text-gray-500 font-normal ml-1">({item.quantity} kg)</span>}
                      </h4>
                      <button
                        onClick={() => removeItem(item.productId)}
                        className="text-gray-400 hover:text-red-500 active:scale-90 transition-all p-1 -mr-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between mt-2.5">
                      <span className="text-sm font-bold text-[#2E7D32]">
                        ${(parseFloat(item.price) * item.quantity).toFixed(2)}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateQuantity(item.productId, item.quantity - (item.unitType === "kg" ? 0.1 : 1))}
                          className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-gray-700 hover:bg-gray-200 active:scale-90 transition-transform"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-xs font-bold min-w-[24px] text-center">
                          {item.unitType === "kg" ? Number(item.quantity).toFixed(2) : item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(item.productId, item.quantity + (item.unitType === "kg" ? 0.1 : 1))}
                          className="w-8 h-8 rounded-xl bg-[#2E7D32] flex items-center justify-center text-white hover:bg-[#1B5E20] active:scale-90 transition-transform shadow-xs"
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
      <div className="bg-white border-t border-gray-100 px-4 pt-3.5 pb-safe z-40 space-y-3 shrink-0 shadow-lg">
        {invalidItems.length > 0 && (
          <div className="p-3 bg-red-50 rounded-xl border border-red-100 flex items-start gap-2">
            <span className="text-red-500 font-bold mt-0.5">!</span>
            <p className="text-xs text-red-600 leading-tight">Algunos productos pertenecen a comercios que están cerrados o no disponibles. Por favor, elimínalos para continuar.</p>
          </div>
        )}
        {/* Payment method inline */}
        <div className="flex gap-2">
          <button
            onClick={() => setPaymentMethod("cash")}
            className={`flex-1 h-11 flex items-center justify-center gap-2 rounded-xl border-2 text-xs font-bold transition-all ${
              paymentMethod === "cash"
                ? "border-[#2E7D32] bg-green-50 text-[#2E7D32]"
                : "border-gray-200 text-gray-500 hover:border-gray-300"
            }`}
          >
            <Banknote className="w-4 h-4 stroke-[2.2]" />
            Efectivo
          </button>
          <button
            onClick={() => setPaymentMethod("transfer")}
            className={`flex-1 h-11 flex items-center justify-center gap-2 rounded-xl border-2 text-xs font-bold transition-all ${
              paymentMethod === "transfer"
                ? "border-[#2E7D32] bg-green-50 text-[#2E7D32]"
                : "border-gray-200 text-gray-500 hover:border-gray-300"
            }`}
          >
            <CreditCard className="w-4 h-4 stroke-[2.2]" />
            Transferencia
          </button>
        </div>

        {/* Totals */}
        <div className="space-y-1 bg-gray-50/70 p-3 rounded-xl border border-gray-100">
          <div className="flex justify-between text-xs text-gray-600 font-medium">
            <span>Subtotal</span>
            <span className="font-semibold text-gray-800">${subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-xs text-gray-600 font-medium">
            <span>Envío</span>
            <span className="font-semibold text-gray-800">${deliveryFee.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-base font-bold text-gray-800 pt-1.5 border-t border-gray-200/80">
            <span>Total</span>
            <span className="text-[#2E7D32]">${total}</span>
          </div>
        </div>

        <button
          onClick={handleCheckout}
          disabled={loading || invalidItems.length > 0}
          className="w-full h-12 bg-[#2E7D32] text-white font-bold text-sm rounded-xl hover:bg-[#1B5E20] active:scale-[0.98] transition-all disabled:opacity-50 shadow-md"
        >
          {loading ? "Procesando..." : "Continuar con la entrega"}
        </button>
      </div>

      {/* Address modal */}
      {showAddressModal && customer && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs">
          <div
            className="absolute inset-0"
            onClick={() => setShowAddressModal(false)}
          />
          <div className="relative bg-white w-full max-w-[480px] rounded-t-3xl sm:rounded-2xl p-5 pb-safe animate-slide-up max-h-[85dvh] overflow-y-auto shadow-2xl">
            <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-4 sm:hidden" />

            <h2 className="text-base font-semibold text-gray-800 mb-4">Dirección de entrega</h2>

            <div className="space-y-2">
              <button
                onClick={() => setAddressMode("profile")}
                className={`w-full flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                  addressMode === "profile"
                    ? "border-[#2E7D32] bg-green-50"
                    : "border-gray-100 bg-gray-50"
                }`}
              >
                <MapPin className="w-5 h-5 text-[#2E7D32] mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800">Mi dirección</p>
                  <p className="text-xs text-gray-500 truncate">{customer.address || "Sin dirección guardada"}</p>
                </div>
              </button>

              <button
                onClick={() => setAddressMode("custom")}
                className={`w-full flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                  addressMode === "custom"
                    ? "border-[#2E7D32] bg-green-50"
                    : "border-gray-100 bg-gray-50"
                }`}
              >
                <Pencil className="w-5 h-5 text-gray-500 mt-0.5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800">Otra dirección</p>
                  {addressMode === "custom" ? (
                    <input
                      type="text"
                      value={customAddress}
                      onChange={(e) => setCustomAddress(e.target.value)}
                      placeholder="Escribí la dirección"
                      className="w-full h-8 px-2.5 mt-1 text-xs border border-gray-200 rounded-lg focus:border-[#2E7D32] focus:ring-1 focus:ring-[#2E7D32] outline-none"
                      autoFocus
                    />
                  ) : (
                    <p className="text-xs text-gray-400">Ingresá una dirección manualmente</p>
                  )}
                </div>
              </button>

              <button
                onClick={handleGetLocation}
                disabled={geoLoading}
                className={`w-full flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                  addressMode === "current"
                    ? "border-[#2E7D32] bg-green-50"
                    : "border-gray-100 bg-gray-50"
                }`}
              >
                <Navigation className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800">
                    {geoLoading ? "Obteniendo..." : "Ubicación actual"}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {currentAddress || "Usá tu ubicación en tiempo real"}
                  </p>
                </div>
              </button>
            </div>

            <div className="flex items-center gap-2 mt-4 p-3 bg-gray-50 rounded-xl text-sm text-gray-600">
              <Phone className="w-4 h-4 text-[#2E7D32] flex-shrink-0" />
              <span>{customer.phone}</span>
            </div>

            {paymentMethod === "transfer" && (
              <div className="mt-4 p-3 bg-green-50 rounded-xl border border-green-200">
                <h3 className="text-sm font-semibold text-gray-800 mb-2">Datos de Transferencia</h3>
                <p className="text-xs text-gray-600 mb-3 whitespace-pre-wrap">
                  {settings.bank_transfer_info || "Consultar datos bancarios con soporte."}
                </p>
                <div>
                  <label className="text-[10px] lg:text-xs font-medium text-gray-700 block mb-1">
                    Adjuntar comprobante *
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="w-full text-xs file:mr-4 file:py-1.5 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-green-100 file:text-[#2E7D32] hover:file:bg-green-200"
                  />
                  {paymentReceipt && <p className="text-xs text-[#2E7D32] mt-2 font-medium">✓ Comprobante listo</p>}
                </div>
              </div>
            )}

            <button
              onClick={confirmOrder}
              disabled={loading || !getDeliveryAddress().trim() || (paymentMethod === "transfer" && !paymentReceipt)}
              className="w-full h-12 mt-4 bg-[#2E7D32] text-white font-medium rounded-xl hover:bg-[#1B5E20] transition-all disabled:opacity-50 touch-target"
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
    <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  );
}
