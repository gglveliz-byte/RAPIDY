/**
 * @archivo src/pages/customer/Home.tsx
 * @modulo 02-customer-home (Panel Principal de Cliente)
 * @proposito
 *   Pantalla principal para clientes autenticados de Rapidy.
 *   Presenta la identidad visual oficial con el eslogan corporativo,
 *   barra de búsqueda, atajos a las 4 categorías clave (Comida, Supermercado, Farmacia, Compras),
 *   banner promocional interactivo con platillos en levitación,
 *   carrusel de restaurantes destacados y listado de comercios asociados.
 *
 * @resumen_contenido
 *   - Componente `CustomerHome`: Orquesta el encabezado, categorías, promociones y catálogo.
 *   - Componentes locales `ProductCard` y `CommerceCard`: Tarjetas de platillos y comercios.
 *   - Eventos SSE en tiempo real: Actualiza productos y estados mediante `useProductEvents`.
 *
 * @dependencias_internas
 *   - `HomeHeader` (./components/HomeHeader)
 *   - `HomePromoBanner` (./components/HomePromoBanner)
 *   - `HomeCategories` (./components/HomeCategories)
 *   - `HomeFeaturedCommerces` (./components/HomeFeaturedCommerces)
 *   - `CustomerBottomNav` (@/components/CustomerBottomNav)
 *   - `useCustomerSession` (@/hooks/useCustomerSession)
 *   - `useCart` (@/hooks/useCart)
 *   - `useCategories`, `useCommerces`, `useFeaturedProducts` (@/hooks/useDeliveryData)
 *   - `safeImage` (@/lib/imageUtils)
 *
 * @dependencias_externas
 *   - `lucide-react` (`Search`, `Clock`, `Star`, `Plus`, `ChevronRight`)
 *   - `react-router` (`useNavigate`)
 *
 * @tablas_bd_o_redis
 *   - PostgreSQL (Neon): `commerces`, `categories`, `products`
 */

import { useState, useMemo } from "react";
import { useNavigate } from "react-router";
import { Search, Clock, Star, Plus, ChevronRight } from "lucide-react";
import { useCart } from "@/hooks/useCart";
import { useCustomerSession } from "@/hooks/useCustomerSession";
import {
  useCategories,
  useCommerces,
  useFeaturedProducts,
  useCatalogProducts,
  useProductSearch,
} from "@/hooks/useDeliveryData";
import { CustomerBottomNav } from "@/components/CustomerBottomNav";
import { useProductEvents, useCommercesEvents } from "@/hooks/useOrderEvents";
import { trpc } from "@/providers/trpc";
import { safeImage } from "@/lib/imageUtils";

import { HomeHeader } from "./components/HomeHeader";
import { HomePromoBanner } from "./components/HomePromoBanner";
import { HomeCategories } from "./components/HomeCategories";
import { HomeFeaturedCommerces } from "./components/HomeFeaturedCommerces";

export default function CustomerHome() {
  const navigate = useNavigate();
  const { customer } = useCustomerSession();
  const { data: categories } = useCategories();
  const { data: commerces, loading: loadingCommerces } = useCommerces();
  const { data: featuredProducts, loading: loadingFeatured } = useFeaturedProducts();
  const { data: catalogProducts } = useCatalogProducts();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const { data: searchResults } = useProductSearch(searchQuery);

  // Escuchar cambios de productos y comercios en tiempo real
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
    const normalized = searchQuery.trim().toLowerCase();
    const source = normalized.length >= 2
      ? searchResults
      : selectedCategory
      ? catalogProducts
      : featuredProducts;

    return source.filter((p: any) => {
      const matchesQuery =
        !normalized ||
        p.name?.toLowerCase().includes(normalized) ||
        (p.commerceName || "").toLowerCase().includes(normalized);
      const matchesCategory =
        !selectedCategory || p.commerceCategoryId === selectedCategory;
      return matchesQuery && matchesCategory;
    });
  }, [searchQuery, selectedCategory, searchResults, catalogProducts, featuredProducts]);

  const handleSelectCategory = (catId: number) => {
    setSelectedCategory(selectedCategory === catId ? null : catId);
    setSearchQuery("");
  };

  const handleSearchSubmit = () => {
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <div className="mobile-container bg-surface min-h-screen pb-32 select-none">
      {/* 1. Header with Logo, Slogan and Search */}
      <HomeHeader
        customerName={customer?.firstName}
        customerAddress={customer?.address}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSearchSubmit={handleSearchSubmit}
      />

      {/* Main Content Body (Se desplaza fluidamente por detrás de la cabecera fija) */}
      <div className="px-4 space-y-5 pt-[calc(env(safe-area-inset-top,0px)+132px)]">
        {/* 2. Top Categories (Comida, Supermercado, Farmacia, Compras) */}
        <HomeCategories
          categories={activeCategories}
          selectedCategory={selectedCategory}
          onSelectCategory={handleSelectCategory}
          onClearCategory={() => setSelectedCategory(null)}
        />

        {/* 3. Promo Banner with Floating Combo Dishes */}
        {!selectedCategory && !searchQuery && <HomePromoBanner />}

        {/* 4. Featured Restaurants Section */}
        {!selectedCategory && !searchQuery && (
          <HomeFeaturedCommerces
            commerces={commerces.slice(0, 5)}
            loading={loadingCommerces}
          />
        )}

        {/* 5. Popular / filtered products */}
        {(filteredProducts.length > 0 || (loadingFeatured && !searchQuery && !selectedCategory)) && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base sm:text-lg font-black text-zinc-900 tracking-tight">
                {searchQuery
                  ? `Productos (${filteredProducts.length})`
                  : selectedCategory
                  ? "Productos de la categoría"
                  : "Platillos populares"}
              </h2>
              <button
                onClick={() => navigate("/search")}
                className="text-xs font-bold text-brand flex items-center gap-0.5 cursor-pointer"
              >
                <span>Ver todo</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {loadingFeatured && !searchQuery && !selectedCategory ? (
              <div className="flex gap-3 overflow-x-auto no-scrollbar">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="min-w-[160px] h-48 bg-zinc-200 rounded-2xl animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                {filteredProducts.slice(0, 12).map((product: any) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* 6. All Commerces or Search Results */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base sm:text-lg font-black text-zinc-900 tracking-tight">
              {selectedCategory
                ? `Comercios (${filteredCommerces.length})`
                : searchQuery
                ? `Resultados para "${searchQuery}" (${filteredCommerces.length})`
                : "Todos los Comercios"}
            </h2>
          </div>

          {loadingCommerces ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 bg-zinc-200 rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : filteredCommerces.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-3xl border border-zinc-100">
              <Search className="w-10 h-10 text-zinc-300 mx-auto mb-2" />
              <p className="text-zinc-600 font-bold text-sm">No encontramos resultados</p>
              <p className="text-zinc-400 text-xs mt-1">Prueba buscando otra categoría o producto</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCommerces.map((commerce) => (
                <CommerceCard
                  key={commerce.id}
                  commerce={commerce}
                  featuredProducts={(catalogProducts || []).filter(
                    (product: any) =>
                      product.commerceId === commerce.id && product.isFeatured === "yes"
                  )}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Floating Navigation */}
      <CustomerBottomNav active="home" />
    </div>
  );
}

function ProductCard({ product }: { product: any }) {
  const navigate = useNavigate();
  const { addItem } = useCart();
  const available = product.isAvailable === "yes" && product.commerceIsOpen !== "closed";

  return (
    <div className="min-w-[165px] bg-white rounded-2xl border border-zinc-100 shadow-[0_4px_16px_rgba(0,0,0,0.05)] overflow-hidden flex flex-col justify-between group">
      <div
        className="h-28 bg-zinc-100 bg-cover bg-center cursor-pointer group-hover:scale-105 transition-transform duration-300 relative"
        style={{ backgroundImage: `url(${safeImage(product.image, "product")})` }}
        onClick={() => navigate(`/commerce/${product.commerceId}`)}
      >
        {!available && (
          <span className="absolute top-2 left-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold text-white">
            No disponible
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 truncate">
          {product.commerceName}
        </p>
        <p className="text-xs font-bold text-zinc-900 truncate mt-0.5">{product.name}</p>
        <div className="flex items-center justify-between mt-2 pt-1 border-t border-zinc-50">
          <span className="text-sm font-black text-brand">${product.price}</span>
          <button
            disabled={!available}
            onClick={() => {
              if (!available) return;
              addItem({
                productId: product.id,
                commerceId: product.commerceId,
                name: product.name,
                price: product.price,
                image: product.image,
                commerceName: product.commerceName,
                unitType: product.unitType,
              });
            }}
            className="w-9 h-9 bg-brand hover:bg-brand-strong disabled:bg-zinc-300 disabled:shadow-none text-white rounded-xl flex items-center justify-center active:scale-90 transition-all shadow-sm shadow-brand/30 cursor-pointer disabled:cursor-not-allowed"
            aria-label={available ? "Agregar al carrito" : "Producto no disponible"}
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>
      </div>
    </div>
  );
}

function CommerceCard({ commerce, featuredProducts = [] }: { commerce: any; featuredProducts?: any[] }) {
  const navigate = useNavigate();
  const { addItem } = useCart();
  const featured = featuredProducts
    .filter((product) => product.isFeatured === "yes")
    .slice(0, 3);
  const commerceOpen = commerce.isOpen === "open";

  return (
    <div className="bg-white rounded-3xl border border-zinc-100 shadow-[0_4px_20px_rgba(0,0,0,0.04)] overflow-hidden">
      <div
        className="h-32 bg-zinc-100 bg-cover bg-center cursor-pointer relative"
        style={{ backgroundImage: `url(${safeImage(commerce.coverImage, "cover")})` }}
        onClick={() => navigate(`/commerce/${commerce.id}`)}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
        <div className="flex justify-between items-start p-3 relative z-10">
          <span
            className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full shadow-xs backdrop-blur-md ${
              commerce.isOpen === "open"
                ? "bg-black/70 text-[#FF6A00] border border-[#FF6A00]/40"
                : "bg-black/70 text-zinc-400 border border-white/10"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${commerce.isOpen === "open" ? "bg-[#FF6A00] animate-pulse" : "bg-zinc-500"}`} />
            {commerce.isOpen === "open" ? "Abierto" : "Cerrado"}
          </span>
        </div>
      </div>

      <div className="p-4 cursor-pointer relative" onClick={() => navigate(`/commerce/${commerce.id}`)}>
        <div className="flex items-start gap-3">
          <img
            src={safeImage(commerce.logo, "logo")}
            alt={commerce.name}
            className="w-14 h-14 rounded-2xl object-cover -mt-10 relative z-10 border-2 border-white shadow-md bg-white shrink-0"
            onError={(e) => {
              (e.target as HTMLImageElement).src = safeImage(null, "logo");
            }}
          />
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-zinc-900 text-sm truncate">{commerce.name}</h3>
            <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500 font-medium">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-zinc-400" />
                {commerce.deliveryTime}
              </span>
              <span className="flex items-center gap-1 font-bold text-zinc-700">
                <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                {commerce.rating}
              </span>
              {commerce.minOrder && parseFloat(commerce.minOrder) > 0 && (
                <span>Min. ${commerce.minOrder}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {featured.length > 0 && (
        <div className="border-t border-zinc-100 p-3 bg-zinc-50/50">
          <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
            {featured.map((product: any) => {
              const productAvailable = commerceOpen && product.isAvailable === "yes";
              return (
              <div
                key={product.id}
                className="shrink-0 w-36 bg-white rounded-2xl p-2.5 border border-zinc-100 shadow-xs"
              >
                <div
                  className="w-full h-20 bg-zinc-100 bg-cover bg-center rounded-xl mb-1.5 cursor-pointer"
                  style={{ backgroundImage: `url(${safeImage(product.image, "product")})` }}
                  onClick={() => navigate(`/commerce/${commerce.id}`)}
                />
                <p className="text-xs font-bold text-zinc-900 truncate">{product.name}</p>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-xs font-black text-brand">${product.price}</span>
                  <button
                    disabled={!productAvailable}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!productAvailable) return;
                      addItem({
                        productId: product.id,
                        commerceId: commerce.id,
                        name: product.name,
                        price: product.price,
                        image: product.image,
                        commerceName: commerce.name,
                        unitType: product.unitType,
                      });
                    }}
                    className="w-8 h-8 bg-brand disabled:bg-zinc-300 text-white rounded-lg flex items-center justify-center active:scale-90 transition-transform shadow-xs cursor-pointer disabled:cursor-not-allowed"
                    aria-label={productAvailable ? `Agregar ${product.name}` : `${product.name} no disponible`}
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
