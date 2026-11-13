/**
 * @archivo src/pages/customer/components/HomeHeader.tsx
 * @modulo 02-customer-home (Cabecera Principal, Identidad de Marca y Buscador)
 * @proposito
 *   Encabezado superior del panel de clientes Rapidy.
 *   Contiene la barra de estado con saludo al cliente, dirección activa,
 *   el logotipo corporativo con el eslogan oficial "Todo lo que quieres, en un solo pedido",
 *   y la barra de búsqueda interactiva flotante.
 *
 * @resumen_contenido
 *   - Componente `HomeHeader`: Renderiza el saludo, la marca Rapidy con tipografía oficial
 *     y el campo de búsqueda rápida con soporte para tecla Enter y botón de borrado.
 *
 * @dependencias_internas
 *   - Ninguna
 *
 * @dependencias_externas
 *   - `lucide-react` (`Search`, `MapPin`, `User`, `Sparkles`)
 *   - `react-router` (`useNavigate`)
 *
 * @tablas_bd_o_redis
 *   - Ninguna (UI y navegación)
 */

import { useNavigate } from "react-router";
import { Search, MapPin, User, Sparkles } from "lucide-react";

interface HomeHeaderProps {
  customerName?: string;
  customerAddress?: string;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: () => void;
}

export function HomeHeader({
  customerName,
  customerAddress,
  searchQuery,
  onSearchChange,
  onSearchSubmit,
}: HomeHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="relative w-full bg-gradient-to-b from-[#0E0E12] via-[#16161B] to-[#121216] pt-safe px-4 pb-4 text-white shadow-xl">
      {/* Background Subtle Flare */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-72 h-36 bg-[#FF6A00]/15 rounded-full blur-3xl pointer-events-none" />

      {/* Top User & Location Bar */}
      <div className="relative z-10 flex items-center justify-between pt-1 mb-3">
        <button
          onClick={() => navigate("/profile")}
          className="flex items-center gap-2 group cursor-pointer text-left"
        >
          <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-[#FF6A00] group-hover:bg-white/10 transition-colors shadow-sm">
            <User className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-zinc-400 font-medium">Hola,</span>
              <span className="text-xs font-bold text-white tracking-tight">
                {customerName || "Invitado"}
              </span>
              <Sparkles className="w-3 h-3 text-[#FF6A00]" />
            </div>
            <div className="flex items-center gap-1 text-[11px] text-[#FF6A00] font-semibold max-w-[190px] truncate">
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="truncate">{customerAddress || "Seleccionar ubicación"}</span>
            </div>
          </div>
        </button>

        <button
          onClick={() => navigate("/search")}
          className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
          aria-label="Buscar"
        >
          <Search className="w-4 h-4 text-zinc-300" />
        </button>
      </div>

      {/* Brand Hero: Logo + Slogan (Identidad Exacta del Mockup) */}
      <div className="relative z-10 flex flex-col items-center text-center my-2">
        <div className="flex items-center gap-2">
          <img
            src="/public/image.png"
            alt="Rapidy Emblem"
            className="w-10 h-10 rounded-full object-cover shadow-[0_0_18px_rgba(255,106,0,0.5)] ring-2 ring-[#FF6A00]/40"
            onError={(e) => {
              (e.target as HTMLImageElement).src = "/image.png";
            }}
          />
          <div className="text-left">
            <div className="text-2xl font-black tracking-tight leading-none text-white flex items-baseline">
              <span>RAPID</span>
              <span className="text-[#FF6A00]">Y</span>
            </div>
            <span className="text-[8px] font-black tracking-widest uppercase text-zinc-400 block -mt-0.5">
              DELIVERY & MÁS
            </span>
          </div>
        </div>

        <p className="text-xs text-zinc-300 mt-1.5 font-medium tracking-tight">
          Todo lo que quieres, en un solo pedido
        </p>
      </div>

      {/* Floating White Pill Search Bar */}
      <div className="relative z-10 mt-3">
        <div className="relative flex items-center h-12 bg-white rounded-full shadow-[0_6px_20px_rgba(0,0,0,0.25)] px-4 gap-2.5 transition-all focus-within:ring-2 focus-within:ring-[#FF6A00]">
          <Search className="w-4 h-4 text-zinc-500 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSearchSubmit()}
            placeholder="Buscar en Rapidy..."
            className="flex-1 text-xs sm:text-sm text-zinc-900 bg-transparent outline-none placeholder:text-zinc-500 font-medium"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="text-zinc-400 hover:text-zinc-700 text-sm font-bold w-5 h-5 flex items-center justify-center rounded-full bg-zinc-100 cursor-pointer"
            >
              ×
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

