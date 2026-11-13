/**
 * @archivo src/pages/customer/CommerceDetail.tsx
 * @modulo 02-customer-commerces (Detalle del Comercio y Catálogo de Productos)
 * @proposito
 *   Pantalla de detalle del comercio y selección de productos para clientes.
 *   Diseñada con la estética oficial Rapidy (Dark Velvet, fondos luminosos y acentos Flame Orange #FF6A00),
 *   muestra información del comercio (horarios, pedido mínimo en USD, rating), listado categorizado
 *   de productos, selector de pesos/importes y barra flotante de checkout coordinada.
 *
 * @resumen_contenido
 *   - Componente `CommerceDetail`: Portada hero, datos de tienda, productos por categoría,
 *     modal de compra por kilos/importe y barra flotante `CommerceCartBar`.
 *
 * @dependencias_internas
 *   - `useCommerce`, `useProductsByCommerce` (@/hooks/useDeliveryData)
 *   - `useCart` (@/hooks/useCart)
 *   - `useCommerceEvents` (@/hooks/useOrderEvents)
 *   - `safeImage` (@/lib/imageUtils)
 *   - `CustomerBottomNav` (@/components/CustomerBottomNav)
 *   - `CommerceCartBar` (@/components/CommerceCartBar)
 *
 * @dependencias_externas
 *   - `react` (`useState`)
 *   - `react-router` (`useParams`, `useNavigate`)
 *   - `lucide-react` (`ArrowLeft`, `Star`, `Clock`, `Phone`, `MapPin`, `Plus`, `Minus`, `ShoppingCart`, `Store`)
 *
 * @tablas_bd_o_redis
 *   - PostgreSQL (Neon): `commerces`, `products`
 */

import { useParams, useNavigate } from "react-router";
import { ArrowLeft, Star, Clock, Phone, MapPin, Plus, Minus, ShoppingCart, Store } from "lucide-react";
import { useCommerce, useProductsByCommerce } from "@/hooks/useDeliveryData";
import { useCart } from "@/hooks/useCart";
import { useCommerceEvents } from "@/hooks/useOrderEvents";
import { trpc } from "@/providers/trpc";
import { safeImage } from "@/lib/imageUtils";
import { CustomerBottomNav } from "@/components/CustomerBottomNav";
import { useState } from "react";
import { CommerceCartBar } from "@/components/CommerceCartBar";

function formatHours(raw: string | null | undefined): string {
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      const dayMap: Record<string, string> = {
        "mon-thu": "Lun-Jue",
        "fri-sat": "Vie-Sáb",
        "sun": "Dom",
        "all": "Todos los días",
      };
      return Object.entries(parsed)
        .map(([k, v]) => `${dayMap[k] || k}: ${v}`)
        .join(" | ");
    }
  } catch {}
  return raw;
}

export default function CommerceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: commerce, loading: loadingCommerce } = useCommerce(Number(id));
  const { data: allProducts, loading: loadingProducts } = useProductsByCommerce(Number(id));
  const { addItem, updateQuantity, items } = useCart();

  const commerceItemsCount = items.filter(
    (item) => item.commerceId === Number(id)
  ).length;

  const [purchaseModal, setPurchaseModal] = useState<{
    show: boolean;
    product: any;
    tab: "kg" | "importe";
    inputValue: string;
  }>({
    show: false,
    product: null,
    tab: "kg",
    inputValue: "1",
  });

  // Escuchar eventos en tiempo real
  const commerceUtils = trpc.useUtils();
  useCommerceEvents(Number(id), commerceUtils);

  const products = (allProducts || []).filter((p: any) => p.isAvailable === "yes");

  const groupedProducts = products.reduce((acc: Record<string, any[]>, p: any) => {
    const cat = p.category || "General";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {});

  const handleAddClick = (product: any) => {
    if (product.unitType === "kg") {
      setPurchaseModal({
        show: true,
        product,
        tab: "kg",
        inputValue: "1",
      });
    } else {
      addItem({
        productId: product.id,
        commerceId: product.commerceId,
        name: product.name,
        price: product.price,
        image: product.image,
        commerceName: commerce?.name || "Comercio",
        unitType: product.unitType,
      });
    }
  };

  const confirmPurchase = () => {
    if (!purchaseModal.product || !purchaseModal.inputValue) return;
    const pricePerKg = parseFloat(purchaseModal.product.price);
    const inputNum = parseFloat(purchaseModal.inputValue);
    if (isNaN(inputNum) || inputNum <= 0) return;

    const quantity = purchaseModal.tab === "kg" ? inputNum : inputNum / pricePerKg;

    addItem({
      productId: purchaseModal.product.id,
      commerceId: purchaseModal.product.commerceId,
      name: purchaseModal.product.name,
      price: purchaseModal.product.price,
      image: purchaseModal.product.image,
      commerceName: commerce?.name || "Comercio",
      unitType: purchaseModal.product.unitType,
      quantity,
    });
    setPurchaseModal({ ...purchaseModal, show: false });
  };

  if (loadingCommerce) {
    return (
      <div className="mobile-container bg-[#F7F7FA] min-h-screen flex items-center justify-center">
        <div className="w-9 h-9 border-3 border-[#FF6A00] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!commerce) {
    return (
      <div className="mobile-container bg-[#F7F7FA] min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-3xl bg-zinc-100 flex items-center justify-center text-zinc-400 mb-3">
          <Store className="w-8 h-8 stroke-[1.5]" />
        </div>
        <p className="text-base font-bold text-zinc-800">Comercio no encontrado</p>
        <button
          onClick={() => navigate("/home")}
          className="mt-4 px-6 py-2.5 bg-[#FF6A00] text-white font-bold text-xs rounded-xl shadow-md cursor-pointer"
        >
          Volver al catálogo
        </button>
      </div>
    );
  }

  return (
    <div className="mobile-container bg-[#F7F7FA] min-h-screen pb-32 text-zinc-900 select-none">
      {/* Portada Hero con degradado y botón de retroceso */}
      <div className="relative h-52 bg-zinc-900">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${safeImage(commerce.coverImage, "cover")})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/30" />
        
        {/* Botón Volver con cristal Dark Velvet */}
        <button
          onClick={() => navigate("/home")}
          className="absolute top-4 left-4 w-10 h-10 bg-black/50 backdrop-blur-md border border-white/20 rounded-2xl flex items-center justify-center text-white shadow-lg active:scale-90 transition-all z-20 cursor-pointer"
          aria-label="Volver"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>

        {/* Título y Datos Clave en Portada */}
        <div className="absolute bottom-4 left-4 right-4">
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight leading-tight">
            {commerce.name}
          </h1>
          <div className="flex items-center gap-2 mt-1.5 text-white/90 text-xs font-semibold">
            <span className="flex items-center gap-1 bg-black/40 px-2 py-0.5 rounded-lg border border-white/10 backdrop-blur-xs">
              <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
              <span>{commerce.rating}</span>
            </span>
            <span>•</span>
            <span className="flex items-center gap-1 bg-black/40 px-2 py-0.5 rounded-lg border border-white/10 backdrop-blur-xs">
              <Clock className="w-3.5 h-3.5 text-zinc-300" />
              <span>{commerce.deliveryTime}</span>
            </span>
            <span>•</span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                commerce.isOpen === "open"
                  ? "bg-emerald-500 text-white shadow-xs"
                  : "bg-rose-500 text-white shadow-xs"
              }`}
            >
              {commerce.isOpen === "open" ? "Abierto" : "Cerrado"}
            </span>
          </div>
        </div>
      </div>

      {/* Ficha de Información del Comercio */}
      <div className="px-4 -mt-3 relative z-10">
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_4px_20px_rgba(0,0,0,0.06)] p-4">
          <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed font-medium">
            {commerce.description}
          </p>

          <div className="flex items-center gap-2 mt-3 text-xs text-zinc-600 font-medium">
            <MapPin className="w-3.5 h-3.5 text-[#FF6A00] shrink-0" />
            <span className="truncate">{commerce.address}</span>
          </div>

          <div className="flex items-center gap-2 mt-1.5 text-xs text-zinc-600 font-medium">
            <Phone className="w-3.5 h-3.5 text-[#FF6A00] shrink-0" />
            <span>{commerce.phone}</span>
          </div>

          {commerce.openHours && (
            <div className="mt-2.5 text-xs text-zinc-500 pt-2 border-t border-zinc-100 flex items-center gap-1.5 font-medium">
              <Clock className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <span className="truncate">{formatHours(commerce.openHours)}</span>
            </div>
          )}

          {commerce.minOrder && parseFloat(commerce.minOrder) > 0 && (
            <div className="mt-1.5 text-xs text-zinc-500 font-medium">
              <span>Pedido mínimo: </span>
              <strong className="text-zinc-900 font-bold">${commerce.minOrder} USD</strong>
            </div>
          )}
        </div>
      </div>

      {/* Catálogo de Productos por Categoría */}
      <div className="px-4 mt-5 space-y-5">
        {loadingProducts ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-white rounded-2xl border border-zinc-100 animate-pulse" />
            ))}
          </div>
        ) : (
          Object.entries(groupedProducts).map(([category, catItems]) => (
            <div key={category}>
              <h2 className="text-[11px] font-black uppercase tracking-wider text-zinc-400 mb-2.5 px-1">
                {category}
              </h2>
              <div className="space-y-2.5">
                {catItems.map((product: any) => {
                  const cartItem = items.find((it) => it.productId === product.id);
                  const inCartQty = cartItem ? cartItem.quantity : 0;

                  return (
                    <div
                      key={product.id}
                      className="bg-white rounded-2xl border border-zinc-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] p-3.5 flex gap-3.5 hover:border-zinc-200 transition-all group"
                    >
                      <div
                        className="w-20 h-20 rounded-xl bg-zinc-100 bg-cover bg-center shrink-0 border border-zinc-100"
                        style={{ backgroundImage: `url(${safeImage(product.image, "product")})` }}
                      />
                      <div className="flex-1 min-w-0 flex flex-col justify-between">
                        <div>
                          <h3 className="font-bold text-zinc-900 text-sm leading-snug group-hover:text-[#FF6A00] transition-colors">
                            {product.name}
                          </h3>
                          {product.description && (
                            <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2 leading-relaxed">
                              {product.description}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center justify-between mt-2.5 pt-1.5 border-t border-zinc-50">
                          <span className="text-sm sm:text-base font-black text-[#FF6A00]">
                            ${product.price} {product.unitType === "kg" ? "/ kg" : ""}
                          </span>

                          {inCartQty > 0 && product.unitType !== "kg" ? (
                            <div className="flex items-center gap-2 bg-orange-50/70 border border-orange-100 px-1 py-0.5 rounded-xl">
                              <button
                                onClick={() => updateQuantity(product.id, inCartQty - 1)}
                                className="w-7 h-7 rounded-lg bg-white flex items-center justify-center text-zinc-700 hover:text-red-600 active:scale-90 transition-transform shadow-xs cursor-pointer"
                                aria-label="Disminuir"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <span className="text-xs font-black text-[#FF6A00] min-w-[18px] text-center">
                                {inCartQty}
                              </span>
                              <button
                                onClick={() => updateQuantity(product.id, inCartQty + 1)}
                                className="w-7 h-7 rounded-lg bg-[#FF6A00] flex items-center justify-center text-white active:scale-90 transition-transform shadow-xs cursor-pointer"
                                aria-label="Aumentar"
                              >
                                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleAddClick(product)}
                              className="w-9 h-9 bg-[#FF6A00] hover:bg-[#e65f00] text-white rounded-xl flex items-center justify-center shadow-md shadow-[#FF6A00]/25 active:scale-90 transition-all cursor-pointer"
                              aria-label="Agregar al carrito"
                            >
                              <Plus className="w-4 h-4 stroke-[2.5]" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal para Productos por Kilo / Importe */}
      {purchaseModal.show && purchaseModal.product && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-end sm:items-center justify-center z-[120] p-0 sm:p-4 select-none animate-in fade-in duration-150">
          <div className="bg-[#F7F7FA] rounded-t-3xl sm:rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in slide-in-from-bottom-6 duration-200 border border-zinc-200">
            <div className="w-12 h-1 bg-zinc-300 rounded-full mx-auto my-3 sm:hidden" />
            
            <div className="p-4 bg-white border-b border-zinc-100 flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-xl bg-zinc-100 bg-cover bg-center shrink-0 border border-zinc-100"
                style={{ backgroundImage: `url(${safeImage(purchaseModal.product.image, "product")})` }}
              />
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-zinc-900 text-sm leading-tight truncate">
                  {purchaseModal.product.name}
                </h3>
                <p className="text-xs text-[#FF6A00] font-black mt-0.5">
                  ${purchaseModal.product.price} / kg
                </p>
              </div>
            </div>

            <div className="p-4 space-y-4">
              <div className="flex p-1 bg-zinc-200/60 rounded-xl">
                <button
                  onClick={() => setPurchaseModal({ ...purchaseModal, tab: "kg", inputValue: "1" })}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    purchaseModal.tab === "kg" ? "bg-white text-zinc-900 shadow-xs" : "text-zinc-600"
                  }`}
                >
                  Por Kilos
                </button>
                <button
                  onClick={() => setPurchaseModal({ ...purchaseModal, tab: "importe", inputValue: purchaseModal.product.price })}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    purchaseModal.tab === "importe" ? "bg-white text-zinc-900 shadow-xs" : "text-zinc-600"
                  }`}
                >
                  Por Importe ($ USD)
                </button>
              </div>

              {/* Ajustes rápidos */}
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                {purchaseModal.tab === "kg"
                  ? ["0.5", "1", "1.5", "2"].map((val) => (
                      <button
                        key={val}
                        onClick={() => setPurchaseModal({ ...purchaseModal, inputValue: val })}
                        className="px-3 py-1.5 text-xs rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:border-[#FF6A00] active:scale-95 font-bold cursor-pointer"
                      >
                        {val} kg
                      </button>
                    ))
                  : ["2", "5", "10", "15"].map((val) => (
                      <button
                        key={val}
                        onClick={() => setPurchaseModal({ ...purchaseModal, inputValue: val })}
                        className="px-3 py-1.5 text-xs rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:border-[#FF6A00] active:scale-95 font-bold cursor-pointer"
                      >
                        ${val} USD
                      </button>
                    ))}
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1.5">
                  {purchaseModal.tab === "kg" ? "¿Cuántos kilos deseas?" : "¿Cuánto dinero deseas pedir?"}
                </label>
                <div className="relative">
                  {purchaseModal.tab === "importe" && (
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 font-black">$</span>
                  )}
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="0.1"
                    value={purchaseModal.inputValue}
                    onChange={(e) => setPurchaseModal({ ...purchaseModal, inputValue: e.target.value })}
                    className={`w-full h-11 bg-white border border-zinc-200 rounded-xl font-black text-zinc-900 text-lg focus:outline-none focus:border-[#FF6A00] focus:ring-1 focus:ring-[#FF6A00] ${
                      purchaseModal.tab === "importe" ? "pl-8 pr-3" : "px-3.5 pr-10"
                    }`}
                  />
                  {purchaseModal.tab === "kg" && (
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 font-bold text-sm">kg</span>
                  )}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={confirmPurchase}
                  disabled={!parseFloat(purchaseModal.inputValue) || parseFloat(purchaseModal.inputValue) <= 0}
                  className="flex-1 h-12 bg-[#FF6A00] hover:bg-[#e65f00] text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-all shadow-md shadow-[#FF6A00]/25 cursor-pointer"
                >
                  <ShoppingCart className="w-4 h-4" /> Agregar al pedido
                </button>
                <button
                  onClick={() => setPurchaseModal({ ...purchaseModal, show: false })}
                  className="px-4 h-12 bg-zinc-200/70 hover:bg-zinc-200 text-zinc-700 font-bold rounded-xl active:scale-95 transition-all cursor-pointer text-xs"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Barra Inferior: Si hay artículos en carrito de este comercio se muestra la barra flotante de checkout */}
      {commerceItemsCount > 0 ? (
        <CommerceCartBar commerceId={Number(id)} />
      ) : (
        <CustomerBottomNav active="" />
      )}
    </div>
  );
}
