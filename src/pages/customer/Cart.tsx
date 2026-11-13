/**
 * @archivo src/pages/customer/Cart.tsx
 * @modulo 02-customer-cart (Carrito y Checkout de Clientes)
 * @proposito
 *   Pantalla de carrito de compras y orden de entrega para clientes de Rapidy.
 *   Diseñada con cabecera fija Dark Velvet, listado de productos agrupados por comercio,
 *   selector de pago, resumen de costos, barra flotante de checkout y menú inferior de navegación.
 *   Totalmente adaptada a Modo Oscuro nativo (#0E0E12) y Modo Claro.
 *
 * @resumen_contenido
 *   - Componente `Cart`: Agrupación de items por comercio, selector de método de pago,
 *     totales, botón flotante de confirmación, modal de dirección y barra inferior unificada.
 *
 * @dependencias_internas
 *   - `useCart` (@/hooks/useCart), `useCustomerSession` (@/hooks/useCustomerSession)
 *   - `useCreateOrder`, `usePublicSettings`, `useCommerces`, `useOrderQuote` (@/hooks/useDeliveryData)
 *   - `getAddressFromCoords` (@/lib/locationUtils)
 *   - `CartAddressModal` (./components/CartAddressModal)
 *   - `CustomerBottomNav` (@/components/CustomerBottomNav)
 *   - `ThemeToggle` (@/components/ThemeToggle)
 *
 * @dependencias_externas
 *   - `react` (`useEffect`, `useRef`, `useState`)
 *   - `react-router` (`useNavigate`)
 *   - `lucide-react` (`ArrowLeft`, `Minus`, `Plus`, `Trash2`, `CreditCard`, `Banknote`, `Package`, `ShoppingBag`, `ChevronRight`)
 *
 * @tablas_bd_o_redis
 *   - PostgreSQL (Neon): `orders`, `order_items`, `customers`, `settings`, `commerces`
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Minus, Plus, Trash2, CreditCard, Banknote, Package, ShoppingBag, ChevronRight } from "lucide-react";
import { useCart } from "@/hooks/useCart";
import { useCustomerSession } from "@/hooks/useCustomerSession";
import { useCreateOrder, usePublicSettings, useCommerces, useOrderQuote } from "@/hooks/useDeliveryData";
import { getAddressFromCoords } from "@/lib/locationUtils";
import { CartAddressModal } from "./components/CartAddressModal";
import { CustomerBottomNav } from "@/components/CustomerBottomNav";
import { ThemeToggle } from "@/components/ThemeToggle";

function createIdempotencyKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `ord_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export default function Cart() {
  const navigate = useNavigate();
  const { items, subtotal, totalItems, updateQuantity, removeItem, clearCart, getItemsByCommerce } = useCart();
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
  const [checkoutError, setCheckoutError] = useState("");
  const idempotencyKeyRef = useRef<string | null>(null);

  const settings = usePublicSettings();
  const { data: commerces, loading: loadingCommerces } = useCommerces();
  const quote = useOrderQuote(items.map((item) => ({ productId: item.productId, quantity: item.quantity })));
  const quoteLineMap = new Map(
    (quote.data?.lines ?? []).map((line: any) => [line.productId, line]),
  );

  const deliveryFee = quote.data?.deliveryFee ?? parseFloat(settings.delivery_fee || "2.50");
  const displaySubtotal = quote.data?.subtotal ?? subtotal;
  const total = quote.data?.total ?? subtotal + deliveryFee;
  const quoteIssues: string[] = quote.data?.issues ?? [];
  const quoteError = quote.error?.message ?? "";
  const quoteChanged = items.some((item) => {
    const line: any = quoteLineMap.get(item.productId);
    if (!line) return false;
    return (
      line.unitType !== item.unitType ||
      Number(line.unitPrice) !== Number(item.price)
    );
  });
  const itemSignature = items.map((item) => `${item.productId}:${item.quantity}`).join("|");
  const lastSignatureRef = useRef(itemSignature);

  useEffect(() => {
    if (lastSignatureRef.current === itemSignature) return;
    lastSignatureRef.current = itemSignature;
    idempotencyKeyRef.current = null;
  }, [itemSignature]);

  const grouped = getItemsByCommerce();

  const invalidItems = items.filter((item) => {
    const commerce = (commerces || []).find((c: any) => c.id === item.commerceId);
    return !loadingCommerces && (!commerce || commerce.isOpen !== "open");
  });
  const hasBlockingIssues = invalidItems.length > 0 || quoteIssues.length > 0;

  const getDeliveryAddress = () => {
    if (addressMode === "custom") return customAddress;
    if (addressMode === "current") return currentAddress;
    return customer?.address || "";
  };

  const handleGetLocation = async () => {
    if (!navigator.geolocation) {
      setCheckoutError("Tu navegador no soporta geolocalización.");
      return;
    }
    setGeoLoading(true);
    setCheckoutError("");
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
      );
      const addr = await getAddressFromCoords(pos.coords.latitude, pos.coords.longitude);
      setCurrentAddress(addr);
      setAddressMode("current");
    } catch {
      setCheckoutError("No pudimos obtener tu ubicación. Escribe la dirección manualmente.");
    } finally {
      setGeoLoading(false);
    }
  };

  const handleCheckout = () => {
    if (!isAuthenticated || !customer) {
      navigate("/register");
      return;
    }
    setCheckoutError("");
    setShowAddressModal(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCheckoutError("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setCheckoutError("El comprobante debe ser una imagen JPG, PNG o WEBP.");
      e.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setCheckoutError("El comprobante no puede superar los 5 MB.");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setPaymentReceipt(ev.target?.result as string);
    reader.onerror = () => setCheckoutError("No pudimos leer la imagen. Inténtalo de nuevo.");
    reader.readAsDataURL(file);
  };

  const confirmOrder = async () => {
    if (!customer) return;
    if (items.length === 0) return;
    if (hasBlockingIssues) {
      setCheckoutError(quoteIssues[0] || "Revisa los productos del carrito antes de continuar.");
      return;
    }

    const deliveryAddress = getDeliveryAddress();
    if (!deliveryAddress.trim()) {
      setCheckoutError("Ingresa o confirma tu dirección de entrega.");
      return;
    }

    if (paymentMethod === "transfer" && !paymentReceipt) {
      setCheckoutError("Adjunta el comprobante de la transferencia.");
      return;
    }

    setCheckoutError("");
    setLoading(true);
    const idempotencyKey = idempotencyKeyRef.current ?? (idempotencyKeyRef.current = createIdempotencyKey());
    try {
      const result: any = await createOrderMutation.mutateAsync({
        items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        deliveryAddress: deliveryAddress.trim(),
        customerPhone: customer.phone,
        paymentMethod,
        paymentReceipt: paymentMethod === "transfer" ? (paymentReceipt || undefined) : undefined,
        idempotencyKey,
      });
      if (result.success) {
        setShowAddressModal(false);
        setOrderId(result.order.id);
        setOrderPlaced(true);
        clearCart();
        idempotencyKeyRef.current = null;
      } else {
        setCheckoutError("No pudimos crear el pedido. Inténtalo de nuevo.");
      }
    } catch (err: any) {
      setCheckoutError(err?.message || "No pudimos crear el pedido. Revisa tu conexión.");
    } finally {
      setLoading(false);
    }
  };

  if (orderPlaced && orderId) {
    return (
      <div className="mobile-container bg-surface dark:bg-[#0E0E12] min-h-screen flex flex-col items-center justify-center px-6 text-center select-none pb-safe-nav">
        <div className="w-20 h-20 bg-orange-50 dark:bg-brand/10 border border-orange-100 dark:border-brand/20 rounded-full flex items-center justify-center mb-4 shadow-sm">
          <Package className="w-10 h-10 text-brand" />
        </div>
        <h1 className="text-2xl font-black text-zinc-900 dark:text-white mb-2">¡Pedido confirmado!</h1>
        <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-6 max-w-[280px]">
          Tu pedido #{orderId} ha sido recibido y está siendo preparado por el comercio.
        </p>
        <div className="w-full space-y-3 max-w-[320px]">
          <button
            onClick={() => navigate(`/order/${orderId}`)}
            className="w-full h-12 bg-brand hover:bg-brand-strong text-white font-bold rounded-2xl shadow-md shadow-brand/30 transition-all active:scale-[0.98] cursor-pointer"
          >
            Seguir pedido
          </button>
          <button
            onClick={() => navigate("/home")}
            className="w-full h-12 bg-white dark:bg-[#1A1A1E] border border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300 font-bold rounded-2xl hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all active:scale-[0.98] cursor-pointer"
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
      <div className="mobile-container bg-surface dark:bg-[#0E0E12] min-h-screen flex flex-col items-center justify-center px-6 text-center select-none pb-safe-nav">
        <div className="w-24 h-24 rounded-full bg-orange-50 dark:bg-brand/10 border border-orange-100 dark:border-brand/20 flex items-center justify-center mb-4 shadow-xs">
          <ShoppingBag className="w-10 h-10 text-brand" />
        </div>
        <h2 className="text-xl font-black text-zinc-900 dark:text-white mb-2">Tu carrito está vacío</h2>
        <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-6 max-w-[260px]">
          Explora los comercios y agrega tus platillos o productos favoritos
        </p>
        <button
          onClick={() => navigate("/home")}
          className="h-12 px-8 bg-brand hover:bg-brand-strong text-white font-bold rounded-2xl shadow-md shadow-brand/30 active:scale-95 transition-all cursor-pointer"
        >
          Explorar comercios
        </button>
        <CustomerBottomNav active="cart" />
      </div>
    );
  }

  return (
    <div className="mobile-container bg-surface dark:bg-[#0E0E12] min-h-screen select-none text-zinc-900 dark:text-white pb-[calc(11rem+env(safe-area-inset-bottom,0px))]">
      {/* 1. Header Dark Velvet Fixed */}
      <header className="fixed top-0 left-0 right-0 max-w-[480px] mx-auto z-40 bg-ink/95 dark:bg-ink/95 backdrop-blur-2xl border-b border-white/10 dark:border-white/10 px-4 pt-safe pb-2.5 flex items-center gap-3 shadow-xl text-white">
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
        <ThemeToggle size="sm" />
      </header>

      {/* 2. Contenido desplazable por detrás de la cabecera fija */}
      <div className="px-4 pt-[calc(env(safe-area-inset-top,0px)+62px)] space-y-4">
        {/* Alerta de Comercios Cerrados */}
        {invalidItems.length > 0 && (
          <div className="p-3 bg-red-50 dark:bg-red-950/40 rounded-2xl border border-red-100 dark:border-red-900/50 flex items-start gap-2">
            <span className="text-red-500 font-bold mt-0.5">!</span>
            <p className="text-xs text-red-600 dark:text-red-400 leading-tight">
              Algunos productos pertenecen a comercios cerrados. Por favor, elimínalos para continuar.
            </p>
          </div>
        )}

        {quoteIssues.length > 0 && (
          <div role="alert" className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-2xl border border-amber-200 dark:border-amber-900/50 flex items-start gap-2">
            <span className="text-amber-600 dark:text-amber-400 font-bold mt-0.5">!</span>
            <div className="text-xs text-amber-800 dark:text-amber-300 leading-tight space-y-0.5">
              {quoteIssues.slice(0, 3).map((issue) => (
                <p key={issue}>{issue}</p>
              ))}
            </div>
          </div>
        )}

        {quoteChanged && (
          <div role="alert" className="p-3 bg-sky-50 dark:bg-sky-950/40 rounded-2xl border border-sky-200 dark:border-sky-900/50 text-xs text-sky-800 dark:text-sky-300">
            El precio o la unidad de un producto cambiaron. Revisa el total actualizado antes de pagar.
          </div>
        )}

        {quoteError && (
          <div role="alert" className="p-3 bg-rose-50 dark:bg-rose-950/40 rounded-2xl border border-rose-200 dark:border-rose-900/50 text-xs text-rose-700 dark:text-rose-300">
            No pudimos validar el precio final: {quoteError}. Revisa tu conexión antes de ordenar.
          </div>
        )}

        {/* Productos agrupados por comercio */}
        {Object.entries(grouped).map(([commerceId, group]) => (
          <div
            key={commerceId}
            className="bg-white dark:bg-[#1A1A1E] rounded-2xl border border-zinc-100 dark:border-white/10 shadow-[0_4px_16px_rgba(0,0,0,0.05)] overflow-hidden"
          >
            <div className="px-4 py-2.5 bg-zinc-50/80 dark:bg-zinc-800/80 border-b border-zinc-100 dark:border-white/10 flex items-center justify-between">
              <h3 className="text-xs font-black text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
                {group.commerceName}
              </h3>
            </div>
            <div className="divide-y divide-zinc-50 dark:divide-white/5">
              {group.items.map((item) => {
                const line: any = quoteLineMap.get(item.productId);
                const displayUnitType = line?.unitType ?? item.unitType;
                const displayPrice = line ? Number(line.unitPrice) : Number(item.price);
                const lineTotal = line ? Number(line.total) : displayPrice * item.quantity;
                const displayName = line?.name ?? item.name;
                return (
                  <div key={item.productId} className="p-3.5 flex gap-3">
                    <div
                      className="w-16 h-16 rounded-xl bg-zinc-100 dark:bg-zinc-800 bg-cover bg-center shrink-0 border border-zinc-100 dark:border-white/10 shadow-xs"
                      style={{ backgroundImage: `url(${line?.image ?? item.image})` }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <h4 className="text-sm font-bold text-zinc-900 dark:text-white truncate pr-2">
                          {displayName}{" "}
                          {displayUnitType === "kg" && (
                            <span className="text-xs text-zinc-400 dark:text-zinc-500 font-normal ml-1">
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
                        <span className="text-sm font-black text-brand">
                          ${lineTotal.toFixed(2)}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateQuantity(item.productId, item.quantity - (displayUnitType === "kg" ? 0.1 : 1))}
                            className="w-7 h-7 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 active:scale-90 transition-transform cursor-pointer"
                            aria-label="Disminuir cantidad"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-xs font-bold min-w-[24px] text-center text-zinc-900 dark:text-white">
                            {displayUnitType === "kg" ? Number(item.quantity).toFixed(2) : item.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(item.productId, item.quantity + (displayUnitType === "kg" ? 0.1 : 1))}
                            className="w-7 h-7 rounded-xl bg-brand flex items-center justify-center text-white hover:bg-brand-strong active:scale-90 transition-transform shadow-sm shadow-brand/30 cursor-pointer"
                            aria-label="Aumentar cantidad"
                          >
                            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Método de Pago */}
        <div className="bg-white dark:bg-[#1A1A1E] rounded-2xl border border-zinc-100 dark:border-white/10 shadow-sm p-4 space-y-2">
          <span className="text-[11px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500 block mb-1">
            Método de pago
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPaymentMethod("cash")}
              className={`flex-1 h-11 flex items-center justify-center gap-2 rounded-2xl border-2 text-xs font-bold transition-all cursor-pointer ${
                paymentMethod === "cash"
                  ? "border-brand bg-orange-50/60 dark:bg-brand/10 text-brand shadow-xs"
                  : "border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-600"
              }`}
            >
              <Banknote className="w-4 h-4 stroke-[2.2]" />
              Efectivo
            </button>
            <button
              onClick={() => setPaymentMethod("transfer")}
              className={`flex-1 h-11 flex items-center justify-center gap-2 rounded-2xl border-2 text-xs font-bold transition-all cursor-pointer ${
                paymentMethod === "transfer"
                  ? "border-brand bg-orange-50/60 dark:bg-brand/10 text-brand shadow-xs"
                  : "border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-600"
              }`}
            >
              <CreditCard className="w-4 h-4 stroke-[2.2]" />
              Transferencia
            </button>
          </div>
        </div>

        {/* Resumen de Costos */}
        <div className="space-y-1.5 bg-white dark:bg-[#1A1A1E] p-4 rounded-2xl border border-zinc-100 dark:border-white/10 shadow-sm">
          <span className="text-[11px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500 block mb-1">
            Resumen del pedido
          </span>
          <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400 font-medium">
            <span>Subtotal</span>
            <span className="font-bold text-zinc-800 dark:text-zinc-200">${displaySubtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400 font-medium">
            <span>Envío estimado</span>
            <span className="font-bold text-zinc-800 dark:text-zinc-200">${deliveryFee.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-base font-bold text-zinc-900 dark:text-white pt-2 border-t border-zinc-100 dark:border-white/10">
            <span>Total a pagar</span>
            <span className="text-brand font-black text-lg">${total}</span>
          </div>
        </div>
      </div>

      {/* 3. Botón Flotante de Confirmación (Docked encima de la barra inferior) */}
      <div className="fixed bottom-[calc(74px+env(safe-area-inset-bottom,0px))] left-3 right-3 max-w-[440px] mx-auto z-40">
        <button
          onClick={handleCheckout}
          disabled={loading || hasBlockingIssues || quote.loading}
          className="w-full min-h-[52px] h-14 bg-brand hover:bg-brand-strong text-white font-bold text-sm rounded-2xl shadow-[0_6px_20px_rgba(255,106,0,0.35)] active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer flex items-center justify-between px-5"
        >
          <span>
            {loading
              ? "Procesando..."
              : quote.loading
              ? "Validando precios..."
              : hasBlockingIssues
              ? "Revisa el carrito"
              : "Continuar con la entrega"}
          </span>
          <div className="flex items-center gap-1 font-black">
            <span>${total.toFixed(2)}</span>
            <ChevronRight className="w-4 h-4" />
          </div>
        </button>
      </div>

      {/* Modal de Dirección y Checkout */}
      <CartAddressModal
        customer={customer!}
        isOpen={showAddressModal && !!customer}
        onClose={() => { if (loading) return; setShowAddressModal(false); setCheckoutError(""); }}
        addressMode={addressMode}
        onSelectAddressMode={setAddressMode}
        customAddress={customAddress}
        onChangeCustomAddress={setCustomAddress}
        currentAddress={currentAddress}
        geoLoading={geoLoading}
        onGetLocation={handleGetLocation}
        paymentMethod={paymentMethod}
        onSelectPaymentMethod={setPaymentMethod}
        total={total.toFixed(2)}
        subtotal={displaySubtotal}
        deliveryFee={deliveryFee}
        bankTransferInfo={settings.bank_transfer_info}
        paymentReceipt={paymentReceipt}
        onFileChange={handleFileChange}
        loading={loading}
        error={checkoutError}
        canConfirm={!loading && !hasBlockingIssues && !quote.loading && !!getDeliveryAddress().trim() && !(paymentMethod === "transfer" && !paymentReceipt)}
        onConfirmOrder={confirmOrder}
      />

      {/* 4. Barra de Navegación Inferior Flotante en Tema Oscuro (oculta durante checkout para máxima limpieza) */}
      {!showAddressModal && <CustomerBottomNav active="cart" />}
    </div>
  );
}
