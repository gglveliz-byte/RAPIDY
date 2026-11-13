/**
 * @archivo src/pages/customer/Search.tsx
 * @modulo 02-customer-search (Búsqueda y Exploración de Catálogo)
 * @proposito
 *   Pantalla de búsqueda de productos y comercios para clientes de Rapidy.
 *   Diseñada con la estética oficial: cabecera superior Dark Velvet con píldora blanca,
 *   cuerpo de catálogo luminoso (#F7F7FA), tarjetas blancas de alta gama con acento
 *   Flame Orange (#FF6A00) y barra inferior flotante perfectamente integrada.
 *
 * @resumen_contenido
 *   - Componente `CustomerSearch`: Encabezado Dark Velvet con input de búsqueda y píldoras.
 *   - Componente `ProductSearchCard`: Tarjeta blanca limpia con precio #FF6A00 y botón +.
 *   - Componente `CommerceSearchCard`: Tarjeta de comercio blanca con badges de estado y rating.
 *   - Integración con navegación flotante `CustomerBottomNav`.
 *
 * @dependencias_internas
 *   - `CustomerBottomNav` (@/components/CustomerBottomNav)
 *   - `useCategories`, `useCommerces`, `useFeaturedProducts` (@/hooks/useDeliveryData)
 *   - `useCart` (@/hooks/useCart)
 *   - `safeImage` (@/lib/imageUtils)
 *
 * @dependencias_externas
 *   - `react` (`useState`, `useEffect`)
 *   - `react-router` (`useNavigate`, `useSearchParams`)
 *   - `lucide-react` (`Search`, `X`, `ArrowLeft`, `Star`, `Clock`, `Plus`, `Loader2`)
 *
 * @tablas_bd_o_redis
 *   - PostgreSQL (Neon): `categories`, `commerces`, `products`
 */

import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Search, X, ArrowLeft, Star, Clock, Plus, Loader2 } from "lucide-react";
import { useCategories, useCommerces, useFeaturedProducts } from "@/hooks/useDeliveryData";
import { useCart } from "@/hooks/useCart";
import { CustomerBottomNav } from "@/components/CustomerBottomNav";
import { safeImage } from "@/lib/imageUtils";

export default function CustomerSearch() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const categoryId = searchParams.get("category");
  const queryParam = searchParams.get("q");

  const { data: categories, loading: categoriesLoading } = useCategories();
  const { data: commerces, loading: commercesLoading } = useCommerces();
  const { data: featuredProducts, loading: productsLoading } = useFeaturedProducts();

  const [query, setQuery] = useState(queryParam || "");
  const [selectedCategory, setSelectedCategory] = useState<number | null>(
    categoryId ? parseInt(categoryId, 10) : null
  );

  useEffect(() => {
    if (categoryId) setSelectedCategory(parseInt(categoryId, 10));
  }, [categoryId]);

  useEffect(() => {
    if (queryParam) setQuery(queryParam);
  }, [queryParam]);

  const filteredCommerces = (commerces || []).filter((c) => {
    const matchesQuery =
      !query || c.name.toLowerCase().includes(query.toLowerCase());
    const matchesCategory =
      !selectedCategory || c.categoryId === selectedCategory;
    return matchesQuery && matchesCategory;
  });

  const filteredProducts = (featuredProducts || []).filter((p) => {
    const matchesQuery =
      !query || p.name.toLowerCase().includes(query.toLowerCase());
    return matchesQuery;
  });

  const isLoading = categoriesLoading || commercesLoading || productsLoading;

  return (
    <div className="mobile-container bg-[#F7F7FA] min-h-screen text-zinc-900 pb-32 select-none">
      {/* Cabecera Dark Velvet Sticky */}
      <div className="bg-gradient-to-b from-[#0E0E12] via-[#141419] to-[#0E0E12] border-b border-white/10 shadow-xl px-4 pt-safe pb-3 sticky top-0 z-30">
        {/* Fila del Buscador */}
        <div className="flex items-center gap-2.5 pt-1">
          <button
            onClick={() => navigate("/home")}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white bg-white/10 hover:bg-white/20 border border-white/10 active:scale-90 transition-all shrink-0 cursor-pointer"
            aria-label="Volver al inicio"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div className="flex-1 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar en Rapidy..."
              autoFocus
              className="w-full h-10 pl-9 pr-9 bg-white text-zinc-900 rounded-full text-xs sm:text-sm font-medium focus:ring-2 focus:ring-[#FF6A00] outline-none shadow-[0_4px_16px_rgba(0,0,0,0.15)] transition-all placeholder:text-zinc-400"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-zinc-100 text-zinc-500 hover:text-zinc-800 text-xs font-bold cursor-pointer transition-colors"
                aria-label="Limpiar búsqueda"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Píldoras de Categoría Horizontales */}
        <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar py-0.5">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-3.5 py-1.5 rounded-full text-xs whitespace-nowrap transition-all cursor-pointer font-bold ${
              !selectedCategory
                ? "bg-[#FF6A00] text-white shadow-md shadow-[#FF6A00]/30 scale-105"
                : "bg-white/10 text-zinc-300 hover:text-white hover:bg-white/20 border border-white/10"
            }`}
          >
            Todos
          </button>
          {(categories || []).map((cat) => (
            <button
              key={cat.id}
              onClick={() =>
                setSelectedCategory(
                  selectedCategory === cat.id ? null : cat.id
                )
              }
              className={`px-3.5 py-1.5 rounded-full text-xs whitespace-nowrap transition-all cursor-pointer font-bold ${
                selectedCategory === cat.id
                  ? "bg-[#FF6A00] text-white shadow-md shadow-[#FF6A00]/30 scale-105"
                  : "bg-white/10 text-zinc-300 hover:text-white hover:bg-white/20 border border-white/10"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Resultados de búsqueda */}
      <div className="px-4 mt-5">
        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="w-8 h-8 text-[#FF6A00] animate-spin" />
          </div>
        ) : !query && !selectedCategory ? (
          <>
            <h2 className="text-base sm:text-lg font-black text-zinc-900 tracking-tight mb-3">
              Productos populares
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {(featuredProducts || []).slice(0, 6).map((product) => (
                <ProductSearchCard key={product.id} product={product} />
              ))}
            </div>
          </>
        ) : (
          <>
            {filteredProducts.length > 0 && (
              <>
                <h2 className="text-sm font-bold text-zinc-600 uppercase tracking-wider mb-3">
                  Productos ({filteredProducts.length})
                </h2>
                <div className="grid grid-cols-2 gap-3 mb-6">
                  {filteredProducts.map((product) => (
                    <ProductSearchCard key={product.id} product={product} />
                  ))}
                </div>
              </>
            )}

            {filteredCommerces.length > 0 && (
              <>
                <h2 className="text-sm font-bold text-zinc-600 uppercase tracking-wider mb-3">
                  Comercios ({filteredCommerces.length})
                </h2>
                <div className="space-y-3 mb-6">
                  {filteredCommerces.map((commerce) => (
                    <CommerceSearchCard key={commerce.id} commerce={commerce} />
                  ))}
                </div>
              </>
            )}

            {filteredProducts.length === 0 && filteredCommerces.length === 0 && (
              <div className="text-center py-20">
                <div className="w-16 h-16 rounded-full bg-zinc-100 flex items-center justify-center mx-auto mb-3">
                  <Search className="w-7 h-7 text-zinc-400" />
                </div>
                <h3 className="text-base font-bold text-zinc-800 mb-1">Sin resultados</h3>
                <p className="text-zinc-500 text-xs max-w-[240px] mx-auto">
                  No encontramos productos ni comercios que coincidan con tu búsqueda.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Navegación Inferior Flotante */}
      <CustomerBottomNav active="search" />
    </div>
  );
}

function ProductSearchCard({ product }: { product: any }) {
  const navigate = useNavigate();
  const { addItem } = useCart();

  return (
    <div
      className="bg-white rounded-2xl border border-zinc-100 shadow-[0_4px_16px_rgba(0,0,0,0.05)] overflow-hidden flex flex-col justify-between group hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition-all cursor-pointer"
      onClick={() => navigate(`/commerce/${product.commerceId}`)}
    >
      <div
        className="h-28 bg-zinc-100 bg-cover bg-center group-hover:scale-105 transition-transform duration-300"
        style={{ backgroundImage: `url(${safeImage(product.image, "product")})` }}
      />
      <div className="p-3 flex flex-col justify-between flex-1">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 truncate">
            {product.commerceName}
          </p>
          <p className="text-xs sm:text-sm font-bold text-zinc-900 truncate mt-0.5">
            {product.name}
          </p>
        </div>
        <div className="flex items-center justify-between mt-2 pt-1 border-t border-zinc-50">
          <span className="text-sm sm:text-base font-black text-[#FF6A00]">${product.price}</span>
          <button
            type="button"
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
            className="w-7 h-7 sm:w-8 sm:h-8 bg-[#FF6A00] hover:bg-[#e65f00] text-white rounded-xl shadow-sm shadow-[#FF6A00]/30 active:scale-90 transition-all flex items-center justify-center shrink-0 cursor-pointer"
            aria-label={`Añadir ${product.name} al carrito`}
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
      className="bg-white rounded-2xl border border-zinc-100 shadow-[0_4px_16px_rgba(0,0,0,0.05)] p-3.5 flex gap-3.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition-all cursor-pointer items-center"
      onClick={() => navigate(`/commerce/${commerce.id}`)}
    >
      <img
        src={safeImage(commerce.logo, "logo")}
        alt={commerce.name || "Comercio"}
        className="w-14 h-14 rounded-2xl object-cover bg-zinc-100 shrink-0 border border-zinc-100 shadow-xs"
        onError={(e) => {
          (e.target as HTMLImageElement).src = safeImage(null, "logo");
        }}
      />
      <div className="flex-1 min-w-0">
        <h3 className="text-zinc-900 font-bold text-sm truncate">{commerce.name}</h3>
        <div className="flex items-center gap-2.5 mt-1 text-xs text-zinc-500">
          <span className="flex items-center gap-1 font-medium">
            <Clock className="w-3.5 h-3.5 text-zinc-400" />
            {commerce.deliveryTime}
          </span>
          <span className="flex items-center gap-1 font-bold text-zinc-700">
            <Star className="w-3.5 h-3.5 text-[#FFC107] fill-[#FFC107]" />
            {commerce.rating}
          </span>
        </div>
        <span
          className={`inline-block mt-1.5 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
            commerce.isOpen === "open"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {commerce.isOpen === "open" ? "Abierto" : "Cerrado"}
        </span>
      </div>
    </div>
  );
}
