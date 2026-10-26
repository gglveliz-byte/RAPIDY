import { useParams, useNavigate } from "react-router";
import { ArrowLeft, Star, Clock, Phone, MapPin, Plus, ShoppingCart } from "lucide-react";
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
  const { addItem, totalItems, items } = useCart();
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
    inputValue: "",
  });

  // Escuchar cambios de productos y órdenes en tiempo real
  const commerceUtils = trpc.useUtils();
  useCommerceEvents(Number(id), commerceUtils);

  const products = allProducts.filter((p: any) => p.isAvailable === "yes");

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
        commerceName: commerce.name,
        unitType: product.unitType,
      });
    }
  };

  const confirmPurchase = () => {
    if (!purchaseModal.product || !purchaseModal.inputValue) return;
    const pricePerKg = parseFloat(purchaseModal.product.price);
    const inputNum = parseFloat(purchaseModal.inputValue);
    if (isNaN(inputNum) || inputNum <= 0) return;

    let quantity = 1;
    if (purchaseModal.tab === "kg") {
      quantity = inputNum;
    } else {
      // By importe
      quantity = inputNum / pricePerKg;
    }

    addItem({
      productId: purchaseModal.product.id,
      commerceId: purchaseModal.product.commerceId,
      name: purchaseModal.product.name,
      price: purchaseModal.product.price,
      image: purchaseModal.product.image,
      commerceName: commerce.name,
      unitType: purchaseModal.product.unitType,
      quantity,
    });
    setPurchaseModal({ ...purchaseModal, show: false });
  };

  if (loadingCommerce) {
    return (
      <div className="mobile-container bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#2E7D32] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!commerce) {
    return (
      <div className="mobile-container bg-gray-50 min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Comercio no encontrado</p>
      </div>
    );
  }

  return (
    <div className="mobile-container bg-gray-50 min-h-screen pb-safe-nav">
      {/* Cover */}
      <div className="relative h-48 bg-gray-200">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${safeImage(commerce.coverImage, "cover")})` }} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-black/20" />
        <button
          onClick={() => navigate("/home")}
          className="absolute safe-top left-4 w-10 h-10 bg-white/95 backdrop-blur-md rounded-2xl flex items-center justify-center shadow-lg active:scale-90 transition-transform z-20"
        >
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <div className="absolute bottom-4 left-4 right-4">
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">{commerce.name}</h1>
          <div className="flex items-center gap-2.5 mt-1 text-white/90 text-xs font-medium">
            <span className="flex items-center gap-1">
              <Star className="w-3.5 h-3.5 text-[#FFC107] fill-[#FFC107]" />
              {commerce.rating}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {commerce.deliveryTime}
            </span>
            <span>•</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm ${
                commerce.isOpen === "open" ? "bg-green-500 text-white" : "bg-red-500 text-white"
              }`}
            >
              {commerce.isOpen === "open" ? "Abierto" : "Cerrado"}
            </span>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="px-4 -mt-2 relative z-10">
        <div className="bg-white rounded-2xl card-shadow p-4 border border-gray-100">
          <p className="text-sm text-gray-600 leading-snug">{commerce.description}</p>
          <div className="flex items-center gap-2 mt-2.5 text-xs text-gray-500 font-medium">
            <MapPin className="w-3.5 h-3.5 text-[#2E7D32] shrink-0" />
            <span className="truncate">{commerce.address}</span>
          </div>
          <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-500 font-medium">
            <Phone className="w-3.5 h-3.5 text-[#2E7D32] shrink-0" />
            <span>{commerce.phone}</span>
          </div>
          {commerce.openHours && (
            <div className="mt-2 text-xs text-gray-500 pt-2 border-t border-gray-100 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <span className="truncate">{formatHours(commerce.openHours)}</span>
            </div>
          )}
          {commerce.minOrder && parseFloat(commerce.minOrder) > 0 && (
            <div className="mt-1 text-xs text-gray-500 font-medium">
              <span>Pedido mínimo: </span>
              <strong className="text-gray-700">${commerce.minOrder}</strong>
            </div>
          )}
        </div>
      </div>

      {/* Products by Category */}
      <div className="px-4 mt-4">
        {loadingProducts ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-gray-200 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : (
          Object.entries(groupedProducts).map(([category, items]) => (
            <div key={category} className="mb-6">
              <h2 className="text-xs font-bold text-gray-500 mb-2.5 uppercase tracking-wider">{category}</h2>
              <div className="space-y-2.5">
                {items.map((product: any) => (
                  <div
                    key={product.id}
                    className="bg-white rounded-2xl card-shadow p-3 flex gap-3 border border-gray-50"
                  >
                    <div
                      className="w-20 h-20 rounded-xl bg-gray-100 bg-cover bg-center flex-shrink-0"
                      style={{ backgroundImage: `url(${safeImage(product.image, "product")})` }}
                    />
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div>
                        <h3 className="font-bold text-gray-800 text-sm leading-tight">{product.name}</h3>
                        {product.description && (
                          <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">{product.description}</p>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-2 pt-1 border-t border-gray-50">
                        <span className="text-sm font-bold text-[#2E7D32]">
                          ${product.price} {product.unitType === "kg" ? "/ kg" : ""}
                        </span>
                        <button
                          onClick={() => handleAddClick(product)}
                          className="w-9 h-9 bg-[#2E7D32] text-white rounded-xl flex items-center justify-center hover:bg-[#1B5E20] active:scale-90 transition-transform shadow-sm"
                        >
                          <Plus className="w-4 h-4 stroke-[2.5]" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Purchase Modal - Bottom Sheet */}
      {purchaseModal.show && purchaseModal.product && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-slide-up pb-safe">
            <div className="w-12 h-1 bg-gray-200 rounded-full mx-auto my-3 sm:hidden" />
            
            <div className="p-4 border-b border-gray-100 flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-xl bg-gray-100 bg-cover bg-center flex-shrink-0"
                style={{ backgroundImage: `url(${safeImage(purchaseModal.product.image, "product")})` }}
              />
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-gray-800 text-sm leading-tight truncate">{purchaseModal.product.name}</h3>
                <p className="text-xs text-[#2E7D32] font-semibold mt-0.5">${purchaseModal.product.price} / kg</p>
              </div>
            </div>

            <div className="p-4">
              <div className="flex p-1 bg-gray-100 rounded-xl mb-4">
                <button
                  onClick={() => setPurchaseModal({ ...purchaseModal, tab: "kg", inputValue: "1" })}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                    purchaseModal.tab === "kg" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500"
                  }`}
                >
                  Por Kilos
                </button>
                <button
                  onClick={() => setPurchaseModal({ ...purchaseModal, tab: "importe", inputValue: purchaseModal.product.price })}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                    purchaseModal.tab === "importe" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500"
                  }`}
                >
                  Por Importe
                </button>
              </div>

              {/* Quick Presets */}
              <div className="flex gap-1.5 mb-3 overflow-x-auto no-scrollbar">
                {purchaseModal.tab === "kg" ? (
                  ["0.5", "1", "1.5", "2"].map((val) => (
                    <button
                      key={val}
                      onClick={() => setPurchaseModal({ ...purchaseModal, inputValue: val })}
                      className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 bg-gray-50 text-gray-700 hover:border-[#2E7D32] active:scale-95 font-medium"
                    >
                      {val} kg
                    </button>
                  ))
                ) : (
                  ["1000", "2000", "3000", "5000"].map((val) => (
                    <button
                      key={val}
                      onClick={() => setPurchaseModal({ ...purchaseModal, inputValue: val })}
                      className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 bg-gray-50 text-gray-700 hover:border-[#2E7D32] active:scale-95 font-medium"
                    >
                      ${val}
                    </button>
                  ))
                )}
              </div>

              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {purchaseModal.tab === "kg" ? "¿Cuántos kilos querés?" : "¿Cuánto dinero querés gastar?"}
                </label>
                <div className="relative">
                  {purchaseModal.tab === "importe" && (
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                  )}
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="0.1"
                    value={purchaseModal.inputValue}
                    onChange={(e) => setPurchaseModal({ ...purchaseModal, inputValue: e.target.value })}
                    className={`w-full h-12 bg-gray-50 border border-gray-200 rounded-xl font-bold text-gray-800 text-lg focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 focus:border-[#2E7D32] ${
                      purchaseModal.tab === "importe" ? "pl-8 pr-3" : "px-3.5 pr-10"
                    }`}
                  />
                  {purchaseModal.tab === "kg" && (
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">kg</span>
                  )}
                </div>
                {purchaseModal.tab === "importe" && parseFloat(purchaseModal.inputValue) > 0 && (
                  <p className="text-xs text-gray-500 mt-2 text-center bg-gray-50 py-1.5 rounded-lg">
                    Te darán aprox. <strong className="text-gray-800">{(parseFloat(purchaseModal.inputValue) / parseFloat(purchaseModal.product.price)).toFixed(3)} kg</strong>
                  </p>
                )}
                {purchaseModal.tab === "kg" && parseFloat(purchaseModal.inputValue) > 0 && (
                  <p className="text-xs text-gray-500 mt-2 text-center bg-gray-50 py-1.5 rounded-lg">
                    Costo total aprox: <strong className="text-[#2E7D32]">${(parseFloat(purchaseModal.inputValue) * parseFloat(purchaseModal.product.price)).toFixed(2)}</strong>
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={confirmPurchase}
                  disabled={!parseFloat(purchaseModal.inputValue) || parseFloat(purchaseModal.inputValue) <= 0}
                  className="flex-1 h-12 bg-[#2E7D32] text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-[#1B5E20] disabled:opacity-50 active:scale-[0.98] transition-all shadow-md"
                >
                  <ShoppingCart className="w-4 h-4" /> Agregar al pedido
                </button>
                <button
                  onClick={() => setPurchaseModal({ ...purchaseModal, show: false })}
                  className="px-4 h-12 bg-gray-100 text-gray-600 font-medium rounded-xl hover:bg-gray-200 active:scale-95 transition-all"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Bar: Actionable checkout bar if items in cart, otherwise standard bottom nav */}
      {commerceItemsCount > 0 ? (
        <CommerceCartBar commerceId={Number(id)} />
      ) : (
        <CustomerBottomNav active="" />
      )}
    </div>
  );
}
