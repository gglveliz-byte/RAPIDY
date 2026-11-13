/**
 * @archivo src/pages/customer/Cart.tsx
 * @modulo 02-customer-cart (Carrito y Checkout de Clientes)
 * @proposito
 *   Pantalla de carrito de compras y orden de entrega para clientes de Rapidy.
 *   Diseñada con la estética oficial: cabecera superior Dark Velvet con acentos luminosos,
 *   cuerpo de listado limpio (#F7F7FA), tarjetas blancas de comercios con controles
 *   Flame Orange (#FF6A00), desglose de totales claro y modal de checkout integrado.
 *
 * @resumen_contenido
 *   - Componente `Cart`: Gestión de productos agrupados por comercio, métodos de pago (Efectivo/Transferencia)
 *     y confirmación de orden con geolocalización o dirección personalizada.
 *
 * @dependencias_internas
 *   - `useCart` (@/hooks/useCart)
 *   - `useCustomerSession` (@/hooks/useCustomerSession)
 *   - `useCreateOrder`, `usePublicSettings`, `useCommerces` (@/hooks/useDeliveryData)
 *   - `getAddressFromCoords` (@/lib/locationUtils)
 *   - `CartAddressModal` (./components/CartAddressModal)
 *
 * @dependencias_externas
 *   - `react` (`useState`)
 *   - `react-router` (`useNavigate`)
 *   - `lucide-react` (`ArrowLeft`, `Minus`, `Plus`, `Trash2`, `CreditCard`, `Banknote`, `Package`, `ShoppingBag`)
 *
 * @tablas_bd_o_redis
 *   - PostgreSQL (Neon): `orders`, `order_items`, `customers`, `settings`, `commerces`
 */

import { useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  Minus,
  Plus,
  Trash2,
  CreditCard,
  Banknote,
  Package,
  ShoppingBag,
} from "lucide-react";
import { useCart } from "@/hooks/useCart";
import { useCustomerSession } from "@/hooks/useCustomerSession";
import { useCreateOrder, usePublicSettings, useCommerces } from "@/hooks/useDeliveryData";
import { getAddressFromCoords } from "@/lib/locationUtils";
import { CartAddressModal } from "./components/CartAddressModal";

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
    const commerce = (commerces || []).find((c: any) => c.id === item.commerceId);
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
      <div className="mobile-container bg-[#F7F7FA] min-h-screen flex flex-col items-center justify-center px-6 text-center select-none">
        <div className="w-20 h-20 bg-orange-50 border border-orange-100 rounded-full flex items-center justify-center mb-4 shadow-sm">
          <Package className="w-10 h-10 text-[#FF6A00]" />
        </div>
        <h1 className="text-2xl font-black text-zinc-900 mb-2">¡Pedido confirmado!</h1>
        <p className="text-zinc-500 text-sm mb-6 max-w-[280px]">
          Tu pedido #{orderId} ha sido recibido y está siendo preparado por el comercio.
        </p>
        <div className="w-full space-y-3">
          <button
            onClick={() => navigate(`/order/${orderId}`)}
            className="w-full h-12 bg-[#FF6A00] hover:bg-[#e65f00] text-white font-bold rounded-2xl shadow-md shadow-[#FF6A00]/30 transition-all active:scale-[0.98] cursor-pointer"
          >
            Seguir pedido
          </button>
          <button
            onClick={() => navigate("/home")}
            className="w-full h-12 bg-white border border-zinc-200 text-zinc-700 font-bold rounded-2xl hover:bg-zinc-50 transition-all active:scale-[0.98] cursor-pointer"
          >
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mobile-container bg-[#F7F7FA] min-h-screen flex flex-col items-center justify-center px-6 text-center select-none">
        <div className="w-24 h-24 rounded-full bg-orange-50 border border-orange-100 flex items-center justify-center mb-4 shadow-xs">
          <ShoppingBag className="w-10 h-10 text-[#FF6A00]" />
        </div>
        <h2 className="text-xl font-black text-zinc-900 mb-2">Tu carrito está vacío</h2>
        <p className="text-zinc-500 text-sm mb-6 max-w-[260px]">
          Explora los comercios y agrega tus platillos o productos favoritos
        </p>
        <button
          onClick={() => navigate("/home")}
          className="h-12 px-8 bg-[#FF6A00] hover:bg-[#e65f00] text-white font-bold rounded-2xl shadow-md shadow-[#FF6A00]/30 active:scale-95 transition-all cursor-pointer"
        >
          Explorar comercios
        </button>
      </div>
    );
  }

  return (
    <div className="mobile-container bg-[#F7F7FA] h-screen h-[100dvh] flex flex-col select-none text-zinc-900">
      {/* Header Dark Velvet */}
      <div className="bg-gradient-to-b from-[#0E0E12] via-[#141419] to-[#0E0E12] border-b border-white/10 px-4 pt-safe-top pb-3 flex items-center gap-3 shrink-0 shadow-lg text-white">
        <button
          onClick={() => navigate("/home")}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-white bg-white/10 hover:bg-white/20 border border-white/10 active:scale-90 transition-all cursor-pointer shrink-0"
          aria-label="Volver al inicio"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <h1 className="text-base font-bold text-white tracking-tight">Carrito ({totalItems})</h1>
      </div>

      {/* Products list — scrollable */}
      <div className="flex-1 overflow-y-auto px-4 mt-3 space-y-3.5 min-h-0 pb-4">
        {Object.entries(grouped).map(([commerceId, group]) => (
          <div
            key={commerceId}
            className="bg-white rounded-2xl border border-zinc-100 shadow-[0_4px_16px_rgba(0,0,0,0.05)] overflow-hidden"
          >
            <div className="px-4 py-2.5 bg-zinc-50/80 border-b border-zinc-100 flex items-center justify-between">
              <h3 className="text-xs font-black text-zinc-800 uppercase tracking-wider">
                {group.commerceName}
              </h3>
            </div>
            <div className="divide-y divide-zinc-50">
              {group.items.map((item) => (
                <div key={item.productId} className="p-3.5 flex gap-3">
                  <div
                    className="w-16 h-16 rounded-xl bg-zinc-100 bg-cover bg-center shrink-0 border border-zinc-100 shadow-xs"
                    style={{ backgroundImage: `url(${item.image})` }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <h4 className="text-sm font-bold text-zinc-900 truncate pr-2">
                        {item.name}{" "}
                        {item.unitType === "kg" && (
                          <span className="text-xs text-zinc-400 font-normal ml-1">
                            ({item.quantity} kg)
                          </span>
                        )}
                      </h4>
                      <button
                        onClick={() => removeItem(item.productId)}
                        className="text-zinc-400 hover:text-red-500 active:scale-90 transition-all p-1 -mr-1 cursor-pointer"
                        aria-label="Eliminar producto"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between mt-2.5">
                      <span className="text-sm font-black text-[#FF6A00]">
                        ${(parseFloat(item.price) * item.quantity).toFixed(2)}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            updateQuantity(
                              item.productId,
                              item.quantity - (item.unitType === "kg" ? 0.1 : 1)
                            )
                          }
                          className="w-8 h-8 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-700 hover:bg-zinc-200 active:scale-90 transition-transform cursor-pointer"
                          aria-label="Disminuir cantidad"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-xs font-bold min-w-[24px] text-center text-zinc-900">
                          {item.unitType === "kg"
                            ? Number(item.quantity).toFixed(2)
                            : item.quantity}
                        </span>
                        <button
                          onClick={() =>
                            updateQuantity(
                              item.productId,
                              item.quantity + (item.unitType === "kg" ? 0.1 : 1)
                            )
                          }
                          className="w-8 h-8 rounded-xl bg-[#FF6A00] flex items-center justify-center text-white hover:bg-[#e65f00] active:scale-90 transition-transform shadow-sm shadow-[#FF6A00]/30 cursor-pointer"
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
      <div className="bg-white border-t border-zinc-100 px-4 pt-3.5 pb-safe z-40 space-y-3 shrink-0 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
        {invalidItems.length > 0 && (
          <div className="p-3 bg-red-50 rounded-2xl border border-red-100 flex items-start gap-2">
            <span className="text-red-500 font-bold mt-0.5">!</span>
            <p className="text-xs text-red-600 leading-tight">
              Algunos productos pertenecen a comercios cerrados. Por favor, elimínalos para continuar.
            </p>
          </div>
        )}

        {/* Payment method inline */}
        <div className="flex gap-2">
          <button
            onClick={() => setPaymentMethod("cash")}
            className={`flex-1 h-11 flex items-center justify-center gap-2 rounded-2xl border-2 text-xs font-bold transition-all cursor-pointer ${
              paymentMethod === "cash"
                ? "border-[#FF6A00] bg-orange-50/60 text-[#FF6A00] shadow-xs"
                : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300"
            }`}
          >
            <Banknote className="w-4 h-4 stroke-[2.2]" />
            Efectivo
          </button>
          <button
            onClick={() => setPaymentMethod("transfer")}
            className={`flex-1 h-11 flex items-center justify-center gap-2 rounded-2xl border-2 text-xs font-bold transition-all cursor-pointer ${
              paymentMethod === "transfer"
                ? "border-[#FF6A00] bg-orange-50/60 text-[#FF6A00] shadow-xs"
                : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300"
            }`}
          >
            <CreditCard className="w-4 h-4 stroke-[2.2]" />
            Transferencia
          </button>
        </div>

        {/* Totals */}
        <div className="space-y-1.5 bg-zinc-50 p-3.5 rounded-2xl border border-zinc-100">
          <div className="flex justify-between text-xs text-zinc-500 font-medium">
            <span>Subtotal</span>
            <span className="font-bold text-zinc-800">${subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-xs text-zinc-500 font-medium">
            <span>Envío</span>
            <span className="font-bold text-zinc-800">${deliveryFee.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-base font-bold text-zinc-900 pt-1.5 border-t border-zinc-200/80">
            <span>Total</span>
            <span className="text-[#FF6A00] font-black text-lg">${total}</span>
          </div>
        </div>

        <button
          onClick={handleCheckout}
          disabled={loading || invalidItems.length > 0}
          className="w-full h-12 bg-[#FF6A00] hover:bg-[#e65f00] text-white font-bold text-sm rounded-2xl shadow-md shadow-[#FF6A00]/30 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
        >
          {loading ? "Procesando..." : "Continuar con la entrega"}
        </button>
      </div>

      {/* Address modal modal modularizado */}
      <CartAddressModal
        customer={customer!}
        isOpen={showAddressModal && !!customer}
        onClose={() => setShowAddressModal(false)}
        addressMode={addressMode}
        onSelectAddressMode={setAddressMode}
        customAddress={customAddress}
        onChangeCustomAddress={setCustomAddress}
        currentAddress={currentAddress}
        geoLoading={geoLoading}
        onGetLocation={handleGetLocation}
        paymentMethod={paymentMethod}
        bankTransferInfo={settings.bank_transfer_info}
        paymentReceipt={paymentReceipt}
        onFileChange={handleFileChange}
        loading={loading}
        canConfirm={
          !loading &&
          !!getDeliveryAddress().trim() &&
          !(paymentMethod === "transfer" && !paymentReceipt)
        }
        onConfirmOrder={confirmOrder}
      />
    </div>
  );
}
