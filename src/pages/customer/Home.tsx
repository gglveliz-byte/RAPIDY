import { useState, useMemo } from "react";
import { useNavigate } from "react-router";
import {
  Search,
  ShoppingCart,
  Star,
  Clock,
  UtensilsCrossed,
  Croissant,
  ShoppingBasket,
  Pill,
  IceCreamCone,
  Coffee,
  Dog,
  MoreHorizontal,
  ChevronRight,
  MapPin,
  User,
  Plus,
} from "lucide-react";
import { useCart } from "@/hooks/useCart";
import { useCustomerSession } from "@/hooks/useCustomerSession";
import { useCategories, useCommerces, useFeaturedProducts, useProductsByCommerce } from "@/hooks/useDeliveryData";
import { CustomerBottomNav } from "@/components/CustomerBottomNav";
import { useProductEvents, useCommercesEvents } from "@/hooks/useOrderEvents";
import { trpc } from "@/providers/trpc";
import { safeImage } from "@/lib/imageUtils";

const iconMap: Record<string, React.ReactNode> = {
  UtensilsCrossed: <UtensilsCrossed className="w-5 h-5" />,
  Croissant: <Croissant className="w-5 h-5" />,
  ShoppingCart: <ShoppingBasket className="w-5 h-5" />,
  Pill: <Pill className="w-5 h-5" />,
  IceCreamCone: <IceCreamCone className="w-5 h-5" />,
  Coffee: <Coffee className="w-5 h-5" />,
  Dog: <Dog className="w-5 h-5" />,
  MoreHorizontal: <MoreHorizontal className="w-5 h-5" />,
};

export default function CustomerHome() {
  const navigate = useNavigate();
  const { customer } = useCustomerSession();
  const { totalItems } = useCart();
  const { data: categories } = useCategories();
  const { data: commerces, loading: loadingCommerces } = useCommerces();
  const { data: featuredProducts, loading: loadingFeatured } = useFeaturedProducts();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);

  // Escuchar cambios de productos en tiempo real
  const productUtils = trpc.useUtils();
  useProductEvents(productUtils);
  useCommercesEvents(productUtils);

  const activeCategories = useMemo(() => {
    const ids = new Set(commerces.map((c) => c.categoryId));
    return categories.filter((c) => ids.has(c.id));
  }, [categories, commerces]);

  const filteredCommerces = useMemo(() => {
    let result = commerces;
    if (searchQuery) {
      result = result.filter((c) =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    if (selectedCategory) {
      result = result.filter((c) => c.categoryId === selectedCategory);
    }
    return result;
  }, [commerces, searchQuery, selectedCategory]);

  const filteredProducts = useMemo(() => {
    if (!searchQuery) return featuredProducts;
    return featuredProducts.filter((p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.commerceName || "").toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [featuredProducts, searchQuery]);

  const handleCategoryClick = (catId: number) => {
    setSelectedCategory(selectedCategory === catId ? null : catId);
    setSearchQuery("");
  };

  const handleSearchSubmit = () => {
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <div className="mobile-container bg-gray-50 min-h-screen pb-safe-nav">
      {/* Header */}
      <div className="bg-[#2E7D32] px-4 pt-safe pb-5 shadow-sm">
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2.5">
            <img src="/logotipo.jpeg" alt="YA LLEGA" className="w-9 h-9 rounded-full object-cover border-2 border-white/20 shadow-sm" />
            <div>
              <p className="text-white/75 text-xs font-medium">Hola,</p>
              <p className="text-white font-bold text-sm tracking-tight">{customer?.firstName || "Invitado"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => navigate("/profile")} 
              className="w-9 h-9 rounded-full bg-white/15 text-white flex items-center justify-center hover:bg-white/25 active:scale-90 transition-all"
            >
              <MapPin className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="bg-white rounded-2xl h-11 flex items-center px-4 gap-2.5 shadow-sm">
          <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearchSubmit()}
            placeholder="¿Qué deseas pedir hoy?"
            className="flex-1 text-sm text-gray-800 bg-transparent outline-none placeholder:text-gray-400"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="text-gray-400 hover:text-gray-600">
              <span className="text-lg leading-none">×</span>
            </button>
          )}
        </div>
      </div>

      {/* Categories - Grid 4x2 */}
      <div className="px-4 mt-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-800">Categorías</h2>
          {selectedCategory && (
            <button
              onClick={() => setSelectedCategory(null)}
              className="text-[#2E7D32] text-xs font-medium flex items-center gap-0.5"
            >
              Ver todas
            </button>
          )}
        </div>
        <div className="grid grid-cols-4 gap-1.5 sm:gap-3">
          {activeCategories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => handleCategoryClick(cat.id)}
              className={`flex flex-col items-center gap-1.5 py-1.5 sm:py-2 rounded-xl transition-all ${
                selectedCategory === cat.id
                  ? "bg-[#2E7D32]/10 scale-95"
                  : "active:scale-95"
              }`}
            >
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center text-white ${
                  selectedCategory === cat.id ? "ring-2 ring-[#2E7D32] ring-offset-1" : ""
                }`}
                style={{ backgroundColor: cat.color || "#2E7D32" }}
              >
                {iconMap[cat.icon] || <MoreHorizontal className="w-5 h-5" />}
              </div>
              <span className="text-[10px] sm:text-[11px] text-gray-600 text-center leading-tight truncate w-full px-0.5">
                {cat.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Popular Products */}
      {!selectedCategory && !searchQuery && (
        <div className="px-4 mt-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-800">Productos populares</h2>
            <button onClick={() => navigate("/search")} className="text-[#2E7D32] text-xs font-medium flex items-center gap-0.5">
              Ver todo <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          {loadingFeatured ? (
            <div className="flex gap-3 overflow-x-auto no-scrollbar">
              {[1, 2, 3].map((i) => (
                <div key={i} className="min-w-[160px] h-48 bg-gray-200 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
              {filteredProducts.slice(0, 8).map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Search Results */}
      {(searchQuery || selectedCategory) && filteredProducts.length > 0 && !selectedCategory && (
        <div className="px-4 mt-5">
          <h2 className="text-sm font-medium text-gray-500 mb-2">
            Productos ({filteredProducts.length})
          </h2>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {filteredProducts.slice(0, 6).map((product) => (
              <ProductCardGrid key={product.id} product={product} />
            ))}
          </div>
        </div>
      )}

      {/* Commerces List */}
      <div className="px-4 mt-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-800">
            {selectedCategory
              ? `Comercios (${filteredCommerces.length})`
              : searchQuery
                ? `Resultados (${filteredCommerces.length})`
                : "Comercios"
            }
          </h2>
        </div>
        {loadingCommerces ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-gray-200 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filteredCommerces.length === 0 ? (
          <div className="text-center py-8">
            <Search className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">No se encontraron comercios</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredCommerces.map((commerce) => (
              <CommerceCard key={commerce.id} commerce={commerce} />
            ))}
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <CustomerBottomNav active="home" />
    </div>
  );
}

function ProductCard({ product }: { product: any }) {
  const navigate = useNavigate();
  const { addItem } = useCart();

  return (
    <div className="min-w-[160px] bg-white rounded-xl card-shadow overflow-hidden">
      <div
        className="h-24 bg-gray-100 bg-cover bg-center cursor-pointer"
        style={{ backgroundImage: `url(${safeImage(product.image, "product")})` }}
        onClick={() => navigate(`/commerce/${product.commerceId}`)}
      />
      <div className="p-2.5">
        <p className="text-xs text-gray-500 truncate">{product.commerceName}</p>
        <p className="text-sm font-medium text-gray-800 truncate mt-0.5">{product.name}</p>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-sm font-bold text-[#2E7D32]">${product.price}</span>
          <button
            onClick={() =>
              addItem({
                productId: product.id,
                commerceId: product.commerceId,
                name: product.name,
                price: product.price,
                image: product.image,
                commerceName: product.commerceName,
              })
            }
            className="w-8 h-8 bg-[#2E7D32] text-white rounded-xl flex items-center justify-center hover:bg-[#1B5E20] active:scale-90 transition-all shadow-sm"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductCardGrid({ product }: { product: any }) {
  const navigate = useNavigate();
  const { addItem } = useCart();

  return (
    <div className="bg-white rounded-2xl card-shadow overflow-hidden cursor-pointer active:scale-[0.98] transition-transform" onClick={() => navigate(`/commerce/${product.commerceId}`)}>
      <div
        className="h-28 bg-gray-100 bg-cover bg-center"
        style={{ backgroundImage: `url(${safeImage(product.image, "product")})` }}
      />
      <div className="p-2.5">
        <p className="text-xs text-gray-500 truncate">{product.commerceName}</p>
        <p className="text-sm font-semibold text-gray-800 truncate mt-0.5">{product.name}</p>
        <div className="flex items-center justify-between mt-2">
          <span className="text-sm font-bold text-[#2E7D32]">${product.price}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              addItem({
                productId: product.id,
                commerceId: product.commerceId,
                name: product.name,
                price: product.price,
                image: product.image,
                commerceName: product.commerceName,
              });
            }}
            className="w-8 h-8 bg-[#2E7D32] text-white rounded-xl flex items-center justify-center hover:bg-[#1B5E20] active:scale-90 transition-all shadow-sm"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>
      </div>
    </div>
  );
}

function CommerceCard({ commerce }: { commerce: any }) {
  const navigate = useNavigate();
  const { addItem } = useCart();
  const { data: products } = useProductsByCommerce(commerce.id);
  const featuredProducts = (products || []).filter((p: any) => p.isFeatured === "yes").slice(0, 3);

  return (
    <div className="bg-white rounded-2xl card-shadow overflow-hidden">
      <div
        className="h-32 bg-gray-100 bg-cover bg-center cursor-pointer active:scale-[0.99] transition-transform relative"
        style={{ backgroundImage: `url(${safeImage(commerce.coverImage, "cover")})` }}
        onClick={() => navigate(`/commerce/${commerce.id}`)}
      >
        <div className="flex justify-between items-start p-2.5">
          <span
            className={`text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm backdrop-blur-md ${
              commerce.isOpen === "open" ? "bg-green-600/90 text-white" : "bg-red-600/90 text-white"
            }`}
          >
            {commerce.isOpen === "open" ? "Abierto" : "Cerrado"}
          </span>
        </div>
      </div>
      <div className="p-3.5 cursor-pointer" onClick={() => navigate(`/commerce/${commerce.id}`)}>
        <div className="flex items-start gap-3">
          <img src={safeImage(commerce.logo, "logo")} alt="" className="w-11 h-11 rounded-xl object-cover -mt-8 border-2 border-white shadow-md bg-white" onError={(e) => { (e.target as HTMLImageElement).src = safeImage(null, "logo") }} />
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-gray-800 text-sm truncate">{commerce.name}</h3>
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 font-medium">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-gray-400" />
                {commerce.deliveryTime}
              </span>
              <span className="flex items-center gap-1">
                <Star className="w-3.5 h-3.5 text-[#FFC107] fill-[#FFC107]" />
                {commerce.rating}
              </span>
              {commerce.minOrder && parseFloat(commerce.minOrder) > 0 && (
                <span>Min. ${commerce.minOrder}</span>
              )}
            </div>
          </div>
        </div>
      </div>
      {featuredProducts.length > 0 && (
        <div className="border-t border-gray-100 p-3 bg-gray-50/50">
          <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
            {featuredProducts.map((product: any) => (
              <div key={product.id} className="flex-shrink-0 w-36 bg-white rounded-xl p-2.5 border border-gray-100 shadow-sm">
                <div
                  className="w-full h-18 bg-gray-100 bg-cover bg-center rounded-lg mb-1.5 cursor-pointer"
                  style={{ backgroundImage: `url(${safeImage(product.image, "product")})` }}
                  onClick={() => navigate(`/commerce/${commerce.id}`)}
                />
                <p className="text-xs font-semibold text-gray-800 truncate">{product.name}</p>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-xs font-bold text-[#2E7D32]">${product.price}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      addItem({
                        productId: product.id,
                        commerceId: commerce.id,
                        name: product.name,
                        price: product.price,
                        image: product.image,
                        commerceName: commerce.name,
                      });
                    }}
                    className="w-7 h-7 bg-[#2E7D32] text-white rounded-lg flex items-center justify-center hover:bg-[#1B5E20] active:scale-90 transition-transform shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
