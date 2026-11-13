/**
 * @archivo src/pages/customer/components/HomeHeader.tsx
 * @modulo 02-customer-home (Cabecera Fija Sticky, Marca Rapidy y Buscador)
 * @proposito
 *   Encabezado superior del panel de clientes Rapidy con posición fija/sticky.
 *   Permanece anclado en la parte superior durante el desplazamiento de pantalla
 *   con efecto Glassmorphism esmerilado, permitiendo que el catálogo y los comercios
 *   se desplacen fluidamente por detrás.
 *
 * @resumen_contenido
 *   - Componente `HomeHeader`:
 *     * Barra sticky con backdrop-blur-2xl a 60 FPS.
 *     * Saludo y geolocalización activa del cliente.
 *     * Logotipo Rapidy oficial con eslogan corporativo.
 *     * Píldora de búsqueda flotante con autocompletado y botón de limpieza.
 *     * Detección reactiva de scroll para compactar la cabecera dinámicamente.
 *
 * @dependencias_internas
 *   - Ninguna
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
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 max-w-[480px] mx-auto z-40 transition-all duration-300 select-none ${
        isScrolled
          ? "bg-[#0E0E12]/95 backdrop-blur-2xl border-b border-white/10 shadow-[0_12px_36px_rgba(0,0,0,0.7)] pt-safe px-4 pb-3"
          : "bg-gradient-to-b from-[#0E0E12] via-[#141419] to-[#0E0E12] border-b border-white/5 pt-safe px-4 pb-3.5 shadow-xl"
      }`}
    >
      {/* Background Subtle Flare */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-72 h-28 bg-[#FF6A00]/15 rounded-full blur-3xl pointer-events-none" />

      {/* Top User & Location Bar (Sin el botón de búsqueda redundante) */}
      <div
        className={`relative z-10 flex items-center justify-between transition-all duration-300 ${
          isScrolled ? "mb-1.5 pt-0.5" : "mb-2.5 pt-1"
        }`}
      >
        <button
          onClick={() => navigate("/profile")}
          className="flex items-center gap-2 group cursor-pointer text-left"
        >
          <div className="w-9 h-9 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-[#FF6A00] group-hover:bg-white/10 transition-colors shadow-xs">
            <User className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-zinc-400 font-medium">Hola,</span>
              <span className="text-xs font-bold text-white tracking-tight">
                {customerName || "Invitado"}
              </span>
              <Sparkles className="w-3 h-3 text-[#FF6A00]" />
            </div>
            <div className="flex items-center gap-1 text-[11px] text-[#FF6A00] font-semibold max-w-[210px] sm:max-w-[260px] truncate">
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="truncate">{customerAddress || "Seleccionar ubicación"}</span>
            </div>
          </div>
        </button>
      </div>

      {/* Brand Hero: Logo + Slogan (Se compacta suavemente al hacer scroll) */}
      <div
        className={`relative z-10 flex flex-col items-center text-center transition-all duration-300 ${
          isScrolled ? "scale-90 my-0.5" : "my-1.5"
        }`}
      >
        <div className="flex items-center gap-2">
          <img
            src="/image.png"
            alt="Rapidy Emblem"
            className="w-9 h-9 rounded-full object-cover shadow-[0_0_16px_rgba(255,106,0,0.5)] ring-2 ring-[#FF6A00]/40"
          />
          <div className="text-left">
            <div className="text-xl sm:text-2xl font-black tracking-tight leading-none text-white flex items-baseline">
              <span>RAPID</span>
              <span className="text-[#FF6A00]">Y</span>
            </div>
            <span className="text-[8px] font-black tracking-widest uppercase text-zinc-400 block -mt-0.5">
              DELIVERY & MÁS
            </span>
          </div>
        </div>

        {!isScrolled && (
          <p className="text-[11px] sm:text-xs text-zinc-300 mt-1 font-medium tracking-tight animate-in fade-in duration-200">
            Todo lo que quieres, en un solo pedido
          </p>
        )}
      </div>

      {/* Floating White Pill Search Bar (Permanece siempre fija y accesible) */}
      <div className={`relative z-10 transition-all duration-300 ${isScrolled ? "mt-1.5" : "mt-2.5"}`}>
        <div className="relative flex items-center h-11 sm:h-12 bg-white rounded-full shadow-[0_6px_20px_rgba(0,0,0,0.25)] px-4 gap-2.5 transition-all focus-within:ring-2 focus-within:ring-[#FF6A00]">
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
    </header>
  );
}
