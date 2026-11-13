/**
 * @archivo src/pages/customer/components/HomeCategories.tsx
 * @modulo 02-customer-home (Píldoras y Categorías Dinámicas)
 * @proposito
 *   Muestra las categorías dinámicas registradas en la base de datos PostgreSQL.
 *   Permite filtrado instantáneo de comercios y productos con estado activo de selección
 *   y botón de limpieza de filtro.
 *
 * @resumen_contenido
 *   - Componente `HomeCategories`: Renderiza el carrusel horizontal con iconos vectoriales
 *     y etiquetas interactivas con estética Rapidy.
 *
 * @dependencias_internas
 *   - Ninguna
 *
 * @dependencias_externas
 *   - `lucide-react` (`UtensilsCrossed`, `ShoppingCart`, `Pill`, `ShoppingBag`, `Croissant`, `IceCreamCone`, `Coffee`, `Dog`, `MoreHorizontal`)
 *
 * @tablas_bd_o_redis
 *   - PostgreSQL (Neon): `categories`
 */

import {
  UtensilsCrossed,
  ShoppingCart,
  Pill,
  ShoppingBag,
  Croissant,
  IceCreamCone,
  Coffee,
  Dog,
  MoreHorizontal,
} from "lucide-react";

interface Category {
  id: number;
  name: string;
  icon: string;
  color?: string;
}

interface HomeCategoriesProps {
  categories: Category[];
  selectedCategory: number | null;
  onSelectCategory: (id: number) => void;
  onClearCategory: () => void;
}

const iconRegistry: Record<string, React.ReactNode> = {
  UtensilsCrossed: <UtensilsCrossed className="w-4 h-4" />,
  Croissant: <Croissant className="w-4 h-4" />,
  ShoppingCart: <ShoppingCart className="w-4 h-4" />,
  Pill: <Pill className="w-4 h-4" />,
  IceCreamCone: <IceCreamCone className="w-4 h-4" />,
  Coffee: <Coffee className="w-4 h-4" />,
  Dog: <Dog className="w-4 h-4" />,
  ShoppingBag: <ShoppingBag className="w-4 h-4" />,
};

export function HomeCategories({
  categories,
  selectedCategory,
  onSelectCategory,
  onClearCategory,
}: HomeCategoriesProps) {
  if (categories.length === 0) return null;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
          Categorías
        </span>
        {selectedCategory && (
          <button
            type="button"
            onClick={onClearCategory}
            className="text-xs font-bold text-[#FF6A00] hover:underline cursor-pointer"
          >
            Ver todas
          </button>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {categories.map((cat) => {
          const isSelected = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onSelectCategory(cat.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                isSelected
                  ? "bg-[#FF6A00] text-white shadow-md shadow-[#FF6A00]/30 scale-105"
                  : "bg-white text-zinc-700 border border-zinc-200/80 hover:bg-zinc-50 shadow-xs"
              }`}
            >
              <span className={isSelected ? "text-white" : "text-[#FF6A00]"}>
                {iconRegistry[cat.icon] || <MoreHorizontal className="w-4 h-4" />}
              </span>
              <span>{cat.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
