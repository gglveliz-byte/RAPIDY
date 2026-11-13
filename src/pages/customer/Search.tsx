/**
 * @archivo src/pages/customer/Search.tsx
 * @modulo 02-customer-search (Búsqueda y Exploración de Catálogo)
 * @proposito
 *   Búsqueda server-side de productos y comercios con filtros por categoría,
 *   URL sincronizada, selector de tema conmutador (Modo Oscuro / Claro) y
 *   diseño responsive Dark Velvet / Flame Orange.
 *
 * @resumen_contenido
 *   - Componente `CustomerSearch`: Pantalla principal de búsqueda adaptativa.
 *   - Cabecera fija con botón de retorno, conmutador de tema `ThemeToggle`, input y selector de categorías.
 *   - Tarjetas `ProductSearchCard` y `CommerceSearchCard` estilizadas para Dark Velvet y Light Mode.
 *
 * @dependencias_internas
 *   - `useCategories`, `useCommerces`, `useFeaturedProducts`, `useCatalogProducts`, `useProductSearch` (@/hooks/useDeliveryData)
 *   - `useCart` (@/hooks/useCart)
 *   - `CustomerBottomNav` (@/components/CustomerBottomNav)
 *   - `ThemeToggle` (@/components/ThemeToggle)
 *   - `safeImage` (@/lib/imageUtils)
 *
 * @dependencias_externas
 *   - `lucide-react` (`Search`, `X`, `ArrowLeft`, `Star`, `Clock`, `Plus`, `Loader2`, `AlertCircle`)
 *   - `react-router` (`useNavigate`, `useSearchParams`)
 *   - `react` (`useDeferredValue`)
 */

import { useDeferredValue } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Search, X, ArrowLeft, Star, Clock, Plus, Loader2, AlertCircle } from "lucide-react";
import {
  useCategories,
  useCommerces,
  useFeaturedProducts,
  useCatalogProducts,
  useProductSearch,
} from "@/hooks/useDeliveryData";
import { useCart } from "@/hooks/useCart";
import { CustomerBottomNav } from "@/components/CustomerBottomNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { safeImage } from "@/lib/imageUtils";

export default function CustomerSearch() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const categoryParam = searchParams.get("category");
  const selectedCategory = categoryParam ? Number(categoryParam) : null;
  const deferredQuery = useDeferredValue(query);

  const { data: categories, loading: categoriesLoading } = useCategories();
  const { data: commerces, loading: commercesLoading } = useCommerces();
  const { data: featuredProducts, loading: featuredLoading } = useFeaturedProducts();
  const { data: catalogProducts, loading: catalogLoading, error: catalogError } = useCatalogProducts();
  const { data: searchResults, loading: searchLoading, error: searchError } = useProductSearch(deferredQuery);

  const updateParams = (patch: { q?: string | null; category?: number | null }) => {
    const next = new URLSearchParams(searchParams);
    if (patch.q !== undefined) {
      const nextQuery = (patch.q ?? "").trim();
      if (!nextQuery) next.delete("q");
      else next.set("q", nextQuery);
    }
    if (patch.category !== undefined) {
      if (patch.category === null) next.delete("category");
      else next.set("category", String(patch.category));
    }
    setSearchParams(next, { replace: true });
  };

  const searching = deferredQuery.trim().length >= 2;
  const categoryNumber = Number.isFinite(selectedCategory) ? selectedCategory : null;

  const baseProducts = searching ? searchResults : catalogProducts;
  const normalizedQuery = query.trim().toLowerCase();
  const filteredProducts = baseProducts.filter((product: any) => {
    const matchesQuery =
      !normalizedQuery ||
      product.name?.toLowerCase().includes(normalizedQuery) ||
      product.commerceName?.toLowerCase().includes(normalizedQuery);
    const matchesCategory =
      !categoryNumber || product.commerceCategoryId === categoryNumber;
    return matchesQuery && matchesCategory;
  });

  const filteredCommerces = (commerces || []).filter((commerce: any) => {
    const matchesQuery =
      !normalizedQuery || commerce.name?.toLowerCase().includes(normalizedQuery);
    const matchesCategory =
      !categoryNumber || commerce.categoryId === categoryNumber;
    return matchesQuery && matchesCategory;
  });

  const loadingProducts = searching ? searchLoading : catalogLoading;
  const isLoading = categoriesLoading || commercesLoading || (searching ? searchLoading : featuredLoading || catalogLoading);
  const initialProducts = (featuredProducts.length > 0 ? featuredProducts : catalogProducts).slice(0, 8);
  const showInitial = !query.trim() && !categoryNumber;
  const error = searchError || catalogError;

  return (
    <div className="mobile-container bg-surface dark:bg-[#0E0E12] min-h-screen text-zinc-900 dark:text-zinc-100 pb-32 select-none">
      <header className="fixed top-0 left-0 right-0 max-w-[480px] mx-auto z-40 bg-white/95 dark:bg-[#0E0E12]/95 backdrop-blur-2xl border-b border-zinc-200/80 dark:border-white/10 shadow-xl px-4 pt-safe pb-3 transition-all duration-300">
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => navigate("/home")}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-zinc-700 dark:text-white bg-zinc-100 dark:bg-white/10 hover:bg-zinc-200 dark:hover:bg-white/20 border border-zinc-200 dark:border-white/10 active:scale-90 transition-all shrink-0 cursor-pointer"
            aria-label="Volver al inicio"
          >
            <ArrowLeft className="w-5 h-5 text-zinc-700 dark:text-white" />
          </button>
          <ThemeToggle size="sm" className="shrink-0" />
          <div className="flex-1 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 dark:text-zinc-500 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => updateParams({ q: e.target.value })}
              placeholder="Buscar productos o comercios..."
              autoFocus
              aria-label="Buscar productos o comercios"
              className="w-full h-10 sm:h-11 pl-9 pr-9 bg-zinc-100 dark:bg-zinc-900/90 text-zinc-900 dark:text-white border border-transparent dark:border-white/10 rounded-full text-xs sm:text-sm font-medium focus:ring-2 focus:ring-brand outline-none shadow-xs sm:shadow-[0_4px_16px_rgba(0,0,0,0.15)] transition-all placeholder:text-zinc-400 dark:placeholder-zinc-500"
            />
            {query && (
              <button
                type="button"
                onClick={() => updateParams({ q: null })}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white text-xs font-bold cursor-pointer transition-colors"
                aria-label="Limpiar búsqueda"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar py-0.5">
          <button
            onClick={() => updateParams({ category: null })}
            className={`px-3.5 py-2 rounded-full text-xs whitespace-nowrap transition-all cursor-pointer font-bold ${
              !categoryNumber
                ? "bg-brand text-white shadow-md shadow-brand/30 scale-105"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-white/5"
            }`}
          >
            Todos
          </button>
          {(categories || []).map((cat) => (
            <button
              key={cat.id}
              onClick={() =>
                updateParams({ category: categoryNumber === cat.id ? null : cat.id })
              }
              className={`px-3.5 py-2 rounded-full text-xs whitespace-nowrap transition-all cursor-pointer font-bold ${
                categoryNumber === cat.id
                  ? "bg-brand text-white shadow-md shadow-brand/30 scale-105"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-white/5"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </header>

      <div className="px-4 pt-[calc(env(safe-area-inset-top,0px)+128px)]">
        <div aria-live="polite" className="sr-only">
          {filteredProducts.length} productos y {filteredCommerces.length} comercios encontrados
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="w-8 h-8 text-brand animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-16 bg-white dark:bg-[#1A1A1E] rounded-3xl border border-zinc-100 dark:border-white/10 px-6">
            <AlertCircle className="w-9 h-9 text-rose-400 mx-auto mb-2" />
            <h3 className="text-base font-bold text-zinc-800 dark:text-zinc-100 mb-1">No pudimos buscar</h3>
            <p className="text-zinc-500 dark:text-zinc-400 text-xs mb-4">{error.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="h-10 px-5 rounded-xl bg-brand text-white text-xs font-bold"
            >
              Reintentar
            </button>
          </div>
        ) : showInitial ? (
          <>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base sm:text-lg font-black text-zinc-900 dark:text-white tracking-tight">
                Productos populares
              </h2>
              <span className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500">
                {initialProducts.length} sugerencias
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {initialProducts.map((product: any) => (
                <ProductSearchCard key={product.id} product={product} />
              ))}
            </div>
          </>
        ) : (
          <>
            {loadingProducts && (
              <div className="flex justify-center py-6">
                <Loader2 className="w-6 h-6 text-brand animate-spin" />
              </div>
            )}

            {filteredProducts.length > 0 && (
              <>
                <h2 className="text-sm font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-3">
                  Productos ({filteredProducts.length})
                </h2>
                <div className="grid grid-cols-2 gap-3 mb-6">
                  {filteredProducts.map((product: any) => (
                    <ProductSearchCard key={product.id} product={product} />
                  ))}
                </div>
              </>
            )}

            {filteredCommerces.length > 0 && (
              <>
                <h2 className="text-sm font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-3">
                  Comercios ({filteredCommerces.length})
                </h2>
                <div className="space-y-3 mb-6">
                  {filteredCommerces.map((commerce: any) => (
                    <CommerceSearchCard key={commerce.id} commerce={commerce} />
                  ))}
                </div>
              </>
            )}

            {!loadingProducts && filteredProducts.length === 0 && filteredCommerces.length === 0 && (
              <div className="text-center py-20">
                <div className="w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mx-auto mb-3">
                  <Search className="w-7 h-7 text-zinc-400 dark:text-zinc-500" />
                </div>
                <h3 className="text-base font-bold text-zinc-800 dark:text-zinc-100 mb-1">Sin resultados</h3>
                <p className="text-zinc-500 dark:text-zinc-400 text-xs max-w-[240px] mx-auto">
                  No encontramos productos ni comercios que coincidan con tu búsqueda.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      <CustomerBottomNav active="search" />
    </div>
  );
}

function ProductSearchCard({ product }: { product: any }) {
  const navigate = useNavigate();
  const { addItem } = useCart();
  const available = product.isAvailable === "yes" && product.commerceIsOpen === "open";

  return (
    <div
      className="bg-white dark:bg-[#1A1A1E] rounded-2xl border border-zinc-100 dark:border-white/10 shadow-[0_4px_16px_rgba(0,0,0,0.05)] dark:shadow-xs overflow-hidden flex flex-col justify-between group hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] dark:hover:border-white/20 transition-all cursor-pointer"
      onClick={() => navigate(`/commerce/${product.commerceId}`)}
      role="button"
      tabIndex={0}
      aria-label={`${product.name} de ${product.commerceName}`}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          navigate(`/commerce/${product.commerceId}`);
        }
      }}
    >
      <div
        className="h-28 bg-zinc-100 dark:bg-zinc-800 bg-cover bg-center group-hover:scale-105 transition-transform duration-300 relative"
        style={{ backgroundImage: `url(${safeImage(product.image, "product")})` }}
      >
        {!available && (
          <span className="absolute top-2 left-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold text-white">
            No disponible
          </span>
        )}
      </div>
      <div className="p-3 flex flex-col justify-between flex-1">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 truncate">
            {product.commerceName}
          </p>
          <p className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white truncate mt-0.5">
            {product.name}
          </p>
        </div>
        <div className="flex items-center justify-between mt-2 pt-1 border-t border-zinc-50 dark:border-white/5">
          <span className="text-sm sm:text-base font-black text-brand">${product.price}</span>
          <button
            type="button"
            disabled={!available}
            onClick={(e) => {
              e.stopPropagation();
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
            className="w-9 h-9 sm:w-10 sm:h-10 bg-brand hover:bg-brand-strong disabled:bg-zinc-300 dark:disabled:bg-zinc-700 disabled:shadow-none text-white rounded-xl shadow-sm shadow-brand/30 active:scale-90 transition-all flex items-center justify-center shrink-0 cursor-pointer disabled:cursor-not-allowed"
            aria-label={
              available
                ? `Añadir ${product.name} al carrito`
                : `${product.name} no disponible`
            }
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>
      </div>
    </div>
  );
}

function CommerceSearchCard({ commerce }: { commerce: any }) {
  const navigate = useNavigate();

  return (
    <div
      className="bg-white dark:bg-[#1A1A1E] rounded-2xl border border-zinc-100 dark:border-white/10 shadow-[0_4px_16px_rgba(0,0,0,0.05)] dark:shadow-xs p-3.5 flex gap-3.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] dark:hover:border-white/20 transition-all cursor-pointer items-center"
      onClick={() => navigate(`/commerce/${commerce.id}`)}
      role="button"
      tabIndex={0}
      aria-label={`Abrir ${commerce.name}`}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          navigate(`/commerce/${commerce.id}`);
        }
      }}
    >
      <img
        src={safeImage(commerce.logo, "logo")}
        alt={commerce.name || "Comercio"}
        className="w-16 h-16 rounded-2xl object-cover bg-zinc-100 dark:bg-zinc-800 shrink-0 border border-zinc-100 dark:border-white/10 shadow-xs"
        onError={(e) => {
          (e.target as HTMLImageElement).src = safeImage(null, "logo");
        }}
      />
      <div className="flex-1 min-w-0">
        <h3 className="text-zinc-900 dark:text-white font-bold text-sm truncate">{commerce.name}</h3>
        <div className="flex items-center gap-2.5 mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="flex items-center gap-1 font-medium">
            <Clock className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
            {commerce.deliveryTime || "20-35 min"}
          </span>
          <span className="flex items-center gap-1 font-bold text-zinc-700 dark:text-zinc-300">
            <Star className="w-3.5 h-3.5 text-[#FFC107] fill-[#FFC107]" />
            {commerce.rating}
          </span>
        </div>
        <span
          className={`inline-flex items-center gap-1 mt-1.5 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
            commerce.isOpen === "open"
              ? "bg-[#FF6A00]/10 text-[#FF6A00] border border-[#FF6A00]/30"
              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-white/10"
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${commerce.isOpen === "open" ? "bg-[#FF6A00] animate-pulse" : "bg-zinc-400"}`} />
          {commerce.isOpen === "open" ? "Abierto" : "Cerrado"}
        </span>
      </div>
    </div>
  );
}
