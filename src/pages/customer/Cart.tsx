/**
 * @archivo src/pages/customer/Cart.tsx
 * @modulo 02-customer-cart (Carrito y Checkout de Clientes)
 * @proposito
 *   Pantalla de carrito de compras y orden de entrega para clientes de Rapidy.
 *   Diseñada con cabecera fija Dark Velvet, listado de productos agrupados por comercio,
 *   selector de pago, resumen de costos, barra flotante de checkout y menú inferior de navegación.
 *
 * @resumen_contenido
 *   - Componente `Cart`: Agrupación de items por comercio, selector de método de pago,
 *     totales, botón flotante de confirmación, modal de dirección y barra inferior unificada.
 *
 * @dependencias_internas
 *   - `useCart` (@/hooks/useCart)
 *   - `useCustomerSession` (@/hooks/useCustomerSession)
 *   - `useCreateOrder`, `usePublicSettings`, `useCommerces` (@/hooks/useDeliveryData)
 *   - `getAddressFromCoords` (@/lib/locationUtils)
 *   - `CartAddressModal` (./components/CartAddressModal)
 *   - `CustomerBottomNav` (@/components/CustomerBottomNav)
 *
 * @dependencias_externas
 *   - `react` (`useState`)
 *   - `react-router` (`useNavigate`)
 *   - `lucide-react` (`ArrowLeft`, `Minus`, `Plus`, `Trash2`, `CreditCard`, `Banknote`, `Package`, `ShoppingBag`, `ChevronRight`)
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
  ChevronRight,
} from "lucide-react";
import { useCart } from "@/hooks/useCart";
import { useCustomerSession } from "@/hooks/useCustomerSession";
import { useCreateOrder, usePublicSettings, useCommerces } from "@/hooks/useDeliveryData";
import { getAddressFromCoords } from "@/lib/locationUtils";
import { CartAddressModal } from "./components/CartAddressModal";
import { CustomerBottomNav } from "@/components/CustomerBottomNav";

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
      <div className="mobile-container bg-[#F7F7FA] min-h-screen flex flex-col items-center justify-center px-6 text-center select-none pb-safe-nav">
        <div className="w-20 h-20 bg-orange-50 border border-orange-100 rounded-full flex items-center justify-center mb-4 shadow-sm">
          <Package className="w-10 h-10 text-[#FF6A00]" />
        </div>
        <h1 className="text-2xl font-black text-zinc-900 mb-2">¡Pedido confirmado!</h1>
        <p className="text-zinc-500 text-sm mb-6 max-w-[280px]">
          Tu pedido #{orderId} ha sido recibido y está siendo preparado por el comercio.
        </p>
        <div className="w-full space-y-3 max-w-[320px]">
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
        <CustomerBottomNav active="cart" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mobile-container bg-[#F7F7FA] min-h-screen flex flex-col items-center justify-center px-6 text-center select-none pb-safe-nav">
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
        <CustomerBottomNav active="cart" />
      </div>
    );
  }

  return (
    <div className="mobile-container bg-[#F7F7FA] min-h-screen select-none text-zinc-900 pb-44">
      {/* 1. Header Dark Velvet Fixed */}
      <header className="fixed top-0 left-0 right-0 max-w-[480px] mx-auto z-40 bg-[#0E0E12]/95 backdrop-blur-2xl border-b border-white/10 px-4 pt-safe pb-2.5 flex items-center gap-3 shadow-xl text-white">
        <button
          onClick={() => navigate("/home")}
          className="w-8 h-8 rounded-xl flex items-center justify-center text-white bg-white/10 hover:bg-white/20 border border-white/10 active:scale-90 transition-all cursor-pointer shrink-0"
          aria-label="Volver al inicio"
        >
          <ArrowLeft className="w-4 h-4 text-white" />
        </button>
        <div className="flex-1">
          <h1 className="text-sm font-bold text-white tracking-tight">Mi Carrito</h1>
          <p className="text-[10px] text-zinc-400 font-medium">
            {totalItems} {totalItems === 1 ? "artículo" : "artículos"}
          </p>
        </div>
      </header>

      {/* 2. Contenido desplazable por detrás de la cabecera fija */}
      <div className="px-4 pt-[calc(env(safe-area-inset-top,0px)+62px)] space-y-4">
        {/* Alerta de Comercios Cerrados */}
        {invalidItems.length > 0 && (
          <div className="p-3 bg-red-50 rounded-2xl border border-red-100 flex items-start gap-2">
            <span className="text-red-500 font-bold mt-0.5">!</span>
            <p className="text-xs text-red-600 leading-tight">
              Algunos productos pertenecen a comercios cerrados. Por favor, elimínalos para continuar.
            </p>
          </div>
        )}

        {/* Productos agrupados por comercio */}
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
                          className="w-7 h-7 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-700 hover:bg-zinc-200 active:scale-90 transition-transform cursor-pointer"
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
                          className="w-7 h-7 rounded-xl bg-[#FF6A00] flex items-center justify-center text-white hover:bg-[#e65f00] active:scale-90 transition-transform shadow-sm shadow-[#FF6A00]/30 cursor-pointer"
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

        {/* Método de Pago */}
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-4 space-y-2">
          <span className="text-[11px] font-black uppercase tracking-wider text-zinc-400 block mb-1">
            Método de pago
          </span>
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
        </div>

        {/* Resumen de Costos */}
        <div className="space-y-1.5 bg-white p-4 rounded-2xl border border-zinc-100 shadow-sm">
          <span className="text-[11px] font-black uppercase tracking-wider text-zinc-400 block mb-1">
            Resumen del pedido
          </span>
          <div className="flex justify-between text-xs text-zinc-500 font-medium">
            <span>Subtotal</span>
            <span className="font-bold text-zinc-800">${subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-xs text-zinc-500 font-medium">
            <span>Envío estimado</span>
            <span className="font-bold text-zinc-800">${deliveryFee.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-base font-bold text-zinc-900 pt-2 border-t border-zinc-100">
            <span>Total a pagar</span>
            <span className="text-[#FF6A00] font-black text-lg">${total}</span>
          </div>
        </div>
      </div>

      {/* 3. Botón Flotante de Confirmación (Docked encima de la barra inferior) */}
      <div className="fixed bottom-[74px] left-3 right-3 max-w-[440px] mx-auto z-40">
        <button
          onClick={handleCheckout}
          disabled={loading || invalidItems.length > 0}
          className="w-full h-12 bg-[#FF6A00] hover:bg-[#e65f00] text-white font-bold text-sm rounded-2xl shadow-[0_6px_20px_rgba(255,106,0,0.35)] active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer flex items-center justify-between px-5"
        >
          <span>{loading ? "Procesando..." : "Continuar con la entrega"}</span>
          <div className="flex items-center gap-1 font-black">
            <span>${total}</span>
            <ChevronRight className="w-4 h-4" />
          </div>
        </button>
      </div>

      {/* Modal de Dirección y Checkout */}
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
        onSelectPaymentMethod={setPaymentMethod}
        total={total}
        subtotal={subtotal}
        deliveryFee={deliveryFee}
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

      {/* 4. Barra de Navegación Inferior Flotante en Tema Oscuro */}
      <CustomerBottomNav active="cart" />
    </div>
  );
}
