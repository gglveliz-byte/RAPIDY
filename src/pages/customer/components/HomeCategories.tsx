/**
 * @archivo src/pages/customer/components/HomeCategories.tsx
 * @modulo 02-customer-home (Píldoras y Categorías Rápidas)
 * @proposito
 *   Muestra las 4 categorías emblemáticas del mockup (Comida, Supermercado, Farmacia, Compras)
 *   junto con las categorías dinámicas registradas en la base de datos PostgreSQL.
 *   Permite filtrado instantáneo con estado activo de selección.
 *
 * @resumen_contenido
 *   - Componente `HomeCategories`: Renderiza la fila de 4 categorías principales con tarjetas blancas
 *     redondeadas y el carrusel complementario con iconos temáticos.
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
  UtensilsCrossed: <UtensilsCrossed className="w-5 h-5" />,
  Croissant: <Croissant className="w-5 h-5" />,
  ShoppingCart: <ShoppingCart className="w-5 h-5" />,
  Pill: <Pill className="w-5 h-5" />,
  IceCreamCone: <IceCreamCone className="w-5 h-5" />,
  Coffee: <Coffee className="w-5 h-5" />,
  Dog: <Dog className="w-5 h-5" />,
  ShoppingBag: <ShoppingBag className="w-5 h-5" />,
};

export function HomeCategories({
  categories,
  selectedCategory,
  onSelectCategory,
  onClearCategory,
}: HomeCategoriesProps) {
  // 4 Top Quick Categories as seen in mockup
  const topShortcuts = [
    { label: "Comida", icon: <UtensilsCrossed className="w-5 h-5 text-[#FF6A00]" />, match: ["comida", "comidas", "restaurante"] },
    { label: "Supermercado", icon: <ShoppingCart className="w-5 h-5 text-emerald-600" />, match: ["supermercado", "supermercados", "almacen"] },
    { label: "Farmacia", icon: <Pill className="w-5 h-5 text-sky-600" />, match: ["farmacia", "farmacias", "salud"] },
    { label: "Compras", icon: <ShoppingBag className="w-5 h-5 text-amber-600" />, match: ["compras", "panadería", "panaderías", "otros"] },
  ];

  const handleShortcutClick = (shortcut: typeof topShortcuts[0]) => {
    const matched = categories.find((c) =>
      shortcut.match.some((m) => c.name.toLowerCase().includes(m))
    );
    if (matched) {
      onSelectCategory(matched.id);
    }
  };

  return (
    <div className="w-full">
      {/* 4 Mockup Category Squircles */}
      <div className="grid grid-cols-4 gap-2.5 sm:gap-3">
        {topShortcuts.map((item, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleShortcutClick(item)}
            className="flex flex-col items-center gap-1.5 p-2 rounded-2xl bg-white border border-zinc-100 shadow-[0_4px_16px_rgba(0,0,0,0.04)] hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all cursor-pointer group"
          >
            <div className="w-12 h-12 rounded-2xl bg-zinc-50 border border-zinc-100 flex items-center justify-center group-hover:bg-[#FF6A00]/10 transition-colors">
              {item.icon}
            </div>
            <span className="text-[11px] font-bold text-zinc-800 text-center tracking-tight leading-none">
              {item.label}
            </span>
          </button>
        ))}
      </div>

      {/* Expanded Categories Carousel with Active State */}
      {categories.length > 0 && (
        <div className="mt-3.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              Todas las categorías
            </span>
            {selectedCategory && (
              <button
                type="button"
                onClick={onClearCategory}
                className="text-xs font-bold text-[#FF6A00] hover:underline cursor-pointer"
              >
                Limpiar filtro
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
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                    isSelected
                      ? "bg-[#FF6A00] text-white shadow-md shadow-[#FF6A00]/30 scale-105"
                      : "bg-white text-zinc-700 border border-zinc-200/80 hover:bg-zinc-50"
                  }`}
                >
                  <span className="text-xs">
                    {iconRegistry[cat.icon] || <MoreHorizontal className="w-3.5 h-3.5" />}
                  </span>
                  <span>{cat.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

