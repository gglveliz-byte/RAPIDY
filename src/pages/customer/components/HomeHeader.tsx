/**
 * @archivo src/pages/customer/components/HomeHeader.tsx
 * @modulo 02-customer-home (Cabecera Fija Split: Cliente & Rapidy Brand + Buscador)
 * @proposito
 *   Encabezado compacto superior en modo fixed con distribución horizontal optimizada y
 *   soporte nativo para Modo Oscuro (Dark Velvet #0E0E12) y Modo Claro:
 *   Mitad izquierda con información del cliente (avatar, saludo, dirección),
 *   mitad derecha con el conmutador de tema ThemeToggle y la identidad de Rapidy,
 *   y barra de búsqueda a todo lo ancho inmediatamente debajo.
 *   Ahorra espacio vertical y maximiza el área visible para el catálogo.
 *
 * @resumen_contenido
 *   - Componente `HomeHeader`:
 *     * Fila superior split (Cliente / Conmutador de tema + Identidad oficial Rapidy).
 *     * Integración de `ThemeToggle` con tamaño "sm" para alternancia instantánea de tema.
 *     * Fila inferior con buscador interactivo y botón de limpieza con estilos dark/light.
 *     * Fondo Glassmorphism fijo con desenfoque de 24px y sombra suave al scroll.
 *
 * @dependencias_internas
 *   - `ThemeToggle` (@/components/ThemeToggle)
 *
 * @dependencias_externas
 *   - `lucide-react` (`Search`, `MapPin`, `User`, `Sparkles`)
 *   - `react-router` (`useNavigate`)
 *   - `react` (`useState`, `useEffect`)
 *
 * @tablas_bd_o_redis
 *   - Ninguna (UI y navegación)
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Search, MapPin, User, Sparkles } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

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
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 15);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 max-w-[480px] mx-auto z-40 transition-all duration-300 select-none ${
        isScrolled
          ? "bg-white/95 dark:bg-ink/95 backdrop-blur-2xl border-b border-zinc-200/80 dark:border-white/10 shadow-[0_12px_30px_rgba(0,0,0,0.08)] dark:shadow-[0_12px_30px_rgba(0,0,0,0.65)] pt-safe px-4 pb-2.5"
          : "bg-gradient-to-b from-white via-zinc-50 to-white dark:from-[#0E0E12] dark:via-[#141419] dark:to-[#0E0E12] border-b border-zinc-200/50 dark:border-white/5 pt-safe px-4 pb-3 shadow-sm dark:shadow-xl"
      }`}
    >
      {/* Background Subtle Flare */}
      <div className="absolute top-0 right-8 w-48 h-20 bg-brand/10 dark:bg-brand/15 rounded-full blur-2xl pointer-events-none" />

      {/* Row 1 Split: Left = Cliente | Right = ThemeToggle + Rapidy Brand */}
      <div className="relative z-10 flex items-center justify-between gap-2 pt-1 mb-2">
        {/* Left Half: Customer Profile & Delivery Address */}
        <button
          onClick={() => navigate("/profile")}
          className="flex items-center gap-2 group cursor-pointer text-left min-w-0 flex-1"
        >
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 flex items-center justify-center text-brand group-hover:bg-zinc-200 dark:group-hover:bg-white/10 transition-colors shadow-xs shrink-0">
            <User className="w-4 h-4 text-zinc-700 dark:text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <span className="text-[10px] sm:text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">Hola,</span>
              <span className="text-xs font-bold text-zinc-900 dark:text-white tracking-tight truncate">
                {customerName || "Invitado"}
              </span>
              <Sparkles className="w-3 h-3 text-brand shrink-0" />
            </div>
            <div className="flex items-center gap-1 text-[10px] sm:text-[11px] text-brand font-semibold truncate max-w-[150px] sm:max-w-[200px]">
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="truncate">{customerAddress || "Seleccionar ubicación"}</span>
            </div>
          </div>
        </button>

        {/* Right Half: ThemeToggle + Rapidy Official Identity */}
        <div className="flex items-center gap-2 shrink-0">
          <ThemeToggle size="sm" />
          <div
            className="flex items-center gap-2 select-none text-right cursor-pointer group"
            onClick={() => navigate("/home")}
          >
            <div className="flex flex-col items-end">
              <div className="text-base sm:text-lg font-black tracking-tight leading-none text-zinc-900 dark:text-white flex items-baseline">
                <span>RAPID</span>
                <span className="text-brand">Y</span>
              </div>
              <span className="text-[7.5px] font-black tracking-widest uppercase text-zinc-500 dark:text-zinc-400 block mt-0.5">
                DELIVERY & MÁS
              </span>
            </div>
            <div className="relative">
              <img
                src="/image.png"
                alt="Rapidy Emblem"
                className="w-8 h-8 rounded-full object-cover shadow-[0_0_14px_rgba(255,106,0,0.5)] ring-2 ring-brand/40 group-hover:scale-105 transition-transform shrink-0"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Full-width Floating Search Bar */}
      <div className="relative z-10">
        <div className="relative flex items-center h-10 sm:h-11 bg-zinc-100/90 dark:bg-[#1A1A1E] border border-zinc-200/80 dark:border-white/10 rounded-full shadow-[0_4px_16px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.3)] px-3.5 gap-2 transition-all focus-within:ring-2 focus-within:ring-brand focus-within:bg-white dark:focus-within:bg-[#1A1A1E]">
          <Search className="w-4 h-4 text-zinc-400 dark:text-zinc-400 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSearchSubmit()}
            placeholder="Buscar en Rapidy..."
            className="flex-1 text-xs sm:text-sm text-zinc-900 dark:text-white bg-transparent outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-500 font-medium"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 text-xs font-bold w-4 h-4 flex items-center justify-center rounded-full bg-zinc-200 dark:bg-white/10 cursor-pointer"
            >
              ×
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
