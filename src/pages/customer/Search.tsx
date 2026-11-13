/**
 * @archivo src/pages/customer/Search.tsx
 * @modulo 02-customer-search (Búsqueda y Exploración de Catálogo)
 * @proposito
 *   Pantalla de búsqueda de productos y comercios para clientes de Rapidy.
 *   Permite filtrado en tiempo real por término de texto y categoría,
 *   sincronización con parámetros de URL (q, category) y adición rápida
 *   al carrito de compras con el sistema de diseño Dark Velvet & Flame Orange.
 *
 * @resumen_contenido
 *   - Componente `CustomerSearch`: Encabezado sticky con input buscador y píldoras horizontales.
 *   - Componente `ProductSearchCard`: Tarjeta de producto con precio en Flame Orange y botón añadir.
 *   - Componente `CommerceSearchCard`: Tarjeta de comercio con badges bioluminiscentes de horario.
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
    <div className="mobile-container bg-[#121212] min-h-screen text-white pb-safe-nav">
      {/* Cabecera Dark Velvet Sticky */}
      <div className="bg-[#0E0E12]/95 backdrop-blur-2xl border-b border-white/10 shadow-xl px-4 pt-safe pb-3 sticky top-0 z-20">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => navigate("/home")}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-zinc-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/5 active:scale-90 transition-transform shrink-0 cursor-pointer"
            aria-label="Volver al inicio"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar productos o comercios..."
              autoFocus
              className="w-full h-10 pl-9 pr-9 bg-white text-zinc-900 rounded-full text-sm font-medium focus:ring-2 focus:ring-[#FF6A00] outline-none shadow-sm transition-all"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 cursor-pointer p-0.5"
                aria-label="Limpiar búsqueda"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Píldoras de Categoría Horizontales */}
        <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar py-0.5">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-all cursor-pointer ${
              !selectedCategory
                ? "bg-[#FF6A00] text-white font-bold shadow-[0_2px_10px_rgba(255,106,0,0.35)]"
                : "bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 border border-white/5 font-medium"
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
              className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-all cursor-pointer ${
                selectedCategory === cat.id
                  ? "bg-[#FF6A00] text-white font-bold shadow-[0_2px_10px_rgba(255,106,0,0.35)]"
                  : "bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 border border-white/5 font-medium"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Resultados de búsqueda */}
      <div className="px-4 mt-4">
        {isLoading ? (
          <div className="flex justify-center items-center py-16">
            <Loader2 className="w-8 h-8 text-[#FF6A00] animate-spin" />
          </div>
        ) : !query && !selectedCategory ? (
          <>
            <h2 className="text-white font-bold text-sm tracking-tight mb-3">
              Productos populares
            </h2>
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
              {(featuredProducts || []).slice(0, 6).map((product) => (
                <ProductSearchCard key={product.id} product={product} />
              ))}
            </div>
          </>
        ) : (
          <>
            {filteredProducts.length > 0 && (
              <>
                <h2 className="text-white font-bold text-sm tracking-tight mb-3">
                  Productos ({filteredProducts.length})
                </h2>
                <div className="grid grid-cols-2 gap-2.5 sm:gap-3 mb-5">
                  {filteredProducts.map((product) => (
                    <ProductSearchCard key={product.id} product={product} />
                  ))}
                </div>
              </>
            )}

            {filteredCommerces.length > 0 && (
              <>
                <h2 className="text-white font-bold text-sm tracking-tight mb-3">
                  Comercios ({filteredCommerces.length})
                </h2>
                <div className="space-y-3 mb-5">
                  {filteredCommerces.map((commerce) => (
                    <CommerceSearchCard key={commerce.id} commerce={commerce} />
                  ))}
                </div>
              </>
            )}

            {filteredProducts.length === 0 && filteredCommerces.length === 0 && (
              <div className="text-center py-16">
                <Search className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
                <p className="text-zinc-400 text-sm">No se encontraron resultados</p>
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
      className="bg-[#18181F] border border-white/10 rounded-2xl overflow-hidden hover:border-white/20 transition-all card-shadow cursor-pointer flex flex-col justify-between"
      onClick={() => navigate(`/commerce/${product.commerceId}`)}
    >
      <div
        className="h-28 bg-zinc-800 bg-cover bg-center"
        style={{ backgroundImage: `url(${safeImage(product.image, "product")})` }}
      />
      <div className="p-3 flex flex-col justify-between flex-1">
        <div>
          <p className="text-zinc-400 text-xs truncate">{product.commerceName}</p>
          <p className="text-white font-bold text-sm truncate mt-0.5">{product.name}</p>
        </div>
        <div className="flex items-center justify-between mt-2 pt-1">
          <span className="text-base font-extrabold text-[#FF6A00]">${product.price}</span>
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
            className="w-8 h-8 bg-[#FF6A00] hover:bg-[#E65F00] text-white rounded-xl shadow-[0_4px_12px_rgba(255,106,0,0.3)] active:scale-90 transition-transform flex items-center justify-center shrink-0 cursor-pointer"
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
      className="bg-[#18181F] border border-white/10 rounded-2xl p-3 flex gap-3 hover:border-white/20 transition-all card-shadow cursor-pointer items-center"
      onClick={() => navigate(`/commerce/${commerce.id}`)}
    >
      <img
        src={safeImage(commerce.logo, "logo")}
        alt={commerce.name || "Comercio"}
        className="w-14 h-14 rounded-xl object-cover bg-zinc-800 shrink-0 border border-white/5"
        onError={(e) => {
          (e.target as HTMLImageElement).src = safeImage(null, "logo");
        }}
      />
      <div className="flex-1 min-w-0">
        <h3 className="text-white font-bold text-sm truncate">{commerce.name}</h3>
        <div className="flex items-center gap-2.5 mt-1 text-xs text-zinc-400">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-zinc-400" />
            {commerce.deliveryTime}
          </span>
          <span className="flex items-center gap-1">
            <Star className="w-3.5 h-3.5 text-[#FFC107] fill-[#FFC107]" />
            {commerce.rating}
          </span>
        </div>
        <span
          className={`inline-block mt-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
            commerce.isOpen === "open"
              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20"
              : "bg-red-500/15 text-red-400 border-red-500/20"
          }`}
        >
          {commerce.isOpen === "open" ? "Abierto" : "Cerrado"}
        </span>
      </div>
    </div>
  );
}
