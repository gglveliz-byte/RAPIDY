/**
 * @archivo src/components/CustomerBottomNav.tsx
 * @modulo 00-ui-kernel (Navegación Inferior Flotante de Clientes)
 * @proposito
 *   Barra de navegación inferior fija estilo isla flotante (Glassmorphism) para clientes.
 *   Permite acceso con un toque a Inicio, Búsqueda, Carrito de Compras (con contador reactivo)
 *   y Perfil de usuario con estética oficial Rapidy en Tema Oscuro (Dark Velvet & Flame Orange).
 *
 * @resumen_contenido
 *   - Componente `CustomerBottomNav`: Botones táctiles animados con framer-motion,
 *     indicador de pestaña activa e insignia numérica de artículos en el carrito.
 *
 * @dependencias_internas
 *   - `useCart` (@/hooks/useCart)
 *
 * @dependencias_externas
 *   - `framer-motion` (`motion`)
 *   - `lucide-react` (`UtensilsCrossed`, `Search`, `ShoppingCart`, `User`)
 *   - `react-router` (`useNavigate`)
 *
 * @tablas_bd_o_redis
 *   - Ninguna (Estado de UI y carrito en cliente)
 */

import { useNavigate } from "react-router";
import {
  UtensilsCrossed,
  Search,
  ShoppingCart,
  User,
} from "lucide-react";
import { useCart } from "@/hooks/useCart";
import { motion } from "framer-motion";

export function CustomerBottomNav({ active }: { active: string }) {
  const navigate = useNavigate();
  const { totalItems } = useCart();

  return (
    <nav 
      className="fixed bottom-safe-nav left-3 right-3 bg-[#0E0E12]/95 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-[0_12px_36px_rgba(0,0,0,0.5)] px-1.5 py-1.5 flex justify-between items-center z-50 select-none transition-all" 
      style={{ maxWidth: "440px", margin: "0 auto" }}
    >
      <motion.button 
        whileTap={{ scale: 0.88 }}
        onClick={() => navigate("/home")} 
        className={`flex-1 min-w-0 flex flex-col items-center justify-center py-1.5 px-0.5 rounded-2xl transition-all min-h-[46px] cursor-pointer ${
          active === "home" 
            ? "text-[#FF6A00] bg-[#FF6A00]/15 font-bold shadow-[0_0_12px_rgba(255,106,0,0.25)]" 
            : "text-zinc-400 hover:text-white"
        }`}
      >
        <UtensilsCrossed className="w-5 h-5 stroke-[2.2]" />
        <span className="text-[10px] sm:text-[11px] mt-0.5 tracking-tight whitespace-nowrap">Inicio</span>
      </motion.button>
      
      <motion.button 
        whileTap={{ scale: 0.88 }}
        onClick={() => navigate("/search")} 
        className={`flex-1 min-w-0 flex flex-col items-center justify-center py-1.5 px-0.5 rounded-2xl transition-all min-h-[46px] cursor-pointer ${
          active === "search" 
            ? "text-[#FF6A00] bg-[#FF6A00]/15 font-bold shadow-[0_0_12px_rgba(255,106,0,0.25)]" 
            : "text-zinc-400 hover:text-white"
        }`}
      >
        <Search className="w-5 h-5 stroke-[2.2]" />
        <span className="text-[10px] sm:text-[11px] mt-0.5 tracking-tight whitespace-nowrap">Buscar</span>
      </motion.button>

      <motion.button 
        whileTap={{ scale: 0.88 }}
        onClick={() => navigate("/cart")} 
        className={`relative flex-1 min-w-0 flex flex-col items-center justify-center py-1.5 px-0.5 rounded-2xl transition-all min-h-[46px] cursor-pointer ${
          active === "cart" 
            ? "text-[#FF6A00] bg-[#FF6A00]/15 font-bold shadow-[0_0_12px_rgba(255,106,0,0.25)]" 
            : "text-zinc-400 hover:text-white"
        }`}
      >
        <div className="relative">
          <ShoppingCart className="w-5 h-5 stroke-[2.2]" />
          {totalItems > 0 && (
            <motion.span 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-1.5 -right-2.5 min-w-[17px] h-[17px] px-1 bg-[#FF6A00] text-white text-[9px] font-black rounded-full flex items-center justify-center shadow-xs"
            >
              {totalItems}
            </motion.span>
          )}
        </div>
        <span className="text-[10px] sm:text-[11px] mt-0.5 tracking-tight whitespace-nowrap">Carrito</span>
      </motion.button>

      <motion.button 
        whileTap={{ scale: 0.88 }}
        onClick={() => navigate("/profile")} 
        className={`flex-1 min-w-0 flex flex-col items-center justify-center py-1.5 px-0.5 rounded-2xl transition-all min-h-[46px] cursor-pointer ${
          active === "profile" 
            ? "text-[#FF6A00] bg-[#FF6A00]/15 font-bold shadow-[0_0_12px_rgba(255,106,0,0.25)]" 
            : "text-zinc-400 hover:text-white"
        }`}
      >
        <User className="w-5 h-5 stroke-[2.2]" />
        <span className="text-[10px] sm:text-[11px] mt-0.5 tracking-tight whitespace-nowrap">Perfil</span>
      </motion.button>
    </nav>
  );
}
