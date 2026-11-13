/**
 * @archivo src/pages/customer/components/HomePromoBanner.tsx
 * @modulo 02-customer-home (Banner Promocional y Platillos Flotantes)
 * @proposito
 *   Banner interactivo de alto impacto visual para el inicio de Rapidy.
 *   Presenta la propuesta de valor "¡Pedidos más rápidos!" con degradado ámbar/dorado,
 *   platillos flotantes en 3D (hamburguesa gourmet, papas y bebida) y animación continua.
 *
 * @resumen_contenido
 *   - Componente `HomePromoBanner`: Tarjeta con gradiente radiante, tipografía estilizada,
 *     insignia de entrega express y platillos en levitación mediante CSS keyframes.
 *
 * @dependencias_internas
 *   - Ninguna
 *
 * @dependencias_externas
 *   - `lucide-react` (`Zap`, `ArrowRight`)
 *   - `react-router` (`useNavigate`)
 *
 * @tablas_bd_o_redis
 *   - Ninguna (Componente de presentación con enlace al catálogo general)
 */

import { useNavigate } from "react-router";
import { Zap, ArrowRight } from "lucide-react";

export function HomePromoBanner() {
  const navigate = useNavigate();

  return (
    <div className="relative w-full overflow-hidden rounded-3xl bg-gradient-to-r from-[#FFA000] via-[#FF8500] to-[#FF5E00] shadow-[0_12px_36px_rgba(255,106,0,0.35)] p-5 sm:p-6 text-white cursor-pointer select-none group"
      onClick={() => navigate("/search")}
    >
      {/* Dynamic Background Light Effect */}
      <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-white/20 rounded-full blur-2xl pointer-events-none group-hover:scale-125 transition-transform duration-700" />
      <div className="absolute left-1/3 top-0 w-32 h-32 bg-yellow-300/25 rounded-full blur-xl pointer-events-none" />

      <div className="relative z-10 flex items-center justify-between gap-3">
        {/* Left Side: Impact Copy & Call to Action */}
        <div className="flex-1 max-w-[210px] sm:max-w-[260px]">
          <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-black/20 backdrop-blur-md text-[10px] font-black tracking-wide uppercase mb-2">
            <Zap className="w-3 h-3 text-yellow-300 fill-yellow-300 animate-pulse" />
            <span>Rapidy Express</span>
          </div>

          <h2 className="text-xl sm:text-2xl font-black tracking-tight leading-tight text-white drop-shadow-sm">
            ¡Pedidos más rápidos!
          </h2>

          <p className="text-xs sm:text-sm text-white/90 mt-1 font-medium leading-snug">
            Tus comidas y compras favoritas en minutos en tu puerta.
          </p>

          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/30 backdrop-blur-md text-xs font-bold text-white group-hover:bg-black/40 transition-colors">
            <span>Pedir ahora</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* Right Side: Floating Dishes Combo (Burger + Fries + Soda) */}
        <div className="relative w-28 sm:w-36 h-28 sm:h-32 shrink-0 flex items-center justify-center">
          {/* Ambient Glow behind food */}
          <div className="absolute inset-0 bg-yellow-200/30 rounded-full blur-md" />

          {/* Floating Burger Composition */}
          <div className="relative z-10 transform group-hover:scale-105 group-hover:-translate-y-1 transition-transform duration-500">
            <img
              src="https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=350&fit=crop&auto=format"
              alt="Hamburguesa Gourmet"
              className="w-24 sm:w-28 h-24 sm:h-28 object-cover rounded-2xl shadow-[0_12px_24px_rgba(0,0,0,0.35)] ring-2 ring-white/30 transform -rotate-3"
            />
            {/* Express Badge over the image */}
            <div className="absolute -top-2 -right-2 px-2 py-0.5 bg-[#FF2D55] text-white text-[9px] font-black uppercase rounded-full shadow-md tracking-wider">
              HOT 🔥
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

