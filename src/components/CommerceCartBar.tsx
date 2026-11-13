/**
 * @archivo src/components/CommerceCartBar.tsx
 * @modulo 00-ui-kernel (Barra Flotante de Carrito en Detalle de Comercio)
 * @proposito
 *   Barra flotante inferior estilo isla que aparece cuando el cliente tiene productos
 *   seleccionados de un comercio específico. Permite visualizar el total acumulado
 *   e ir directo al checkout (`/cart`). Diseñada con la estética oficial Rapidy
 *   (Dark Velvet #0E0E12 con detalles luminosos en Flame Orange #FF6A00).
 *
 * @resumen_contenido
 *   - Componente `CommerceCartBar`: Animación con framer-motion, indicador de cantidad,
 *     subtotal de la tienda y botón de checkout.
 *
 * @dependencias_internas
 *   - `useCart` (@/hooks/useCart)
 *
 * @dependencias_externas
 *   - `react-router` (`useNavigate`)
 *   - `lucide-react` (`ShoppingBag`, `ArrowRight`)
 *   - `framer-motion` (`motion`, `AnimatePresence`)
 */

import { useNavigate } from "react-router";
import { ShoppingBag, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useCart } from "@/hooks/useCart";

interface CommerceCartBarProps {
  commerceId: number;
}

export function CommerceCartBar({ commerceId }: CommerceCartBarProps) {
  const navigate = useNavigate();
  const { items } = useCart();

  // Filtrar artículos pertenecientes a este comercio
  const commerceItems = items.filter((item) => item.commerceId === commerceId);
  const itemCount = commerceItems.reduce((acc, item) => acc + (item.unitType === "kg" ? 1 : item.quantity), 0);
  const commerceSubtotal = commerceItems.reduce(
    (acc, item) => acc + parseFloat(item.price) * item.quantity,
    0
  );

  if (itemCount === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 90, opacity: 0, scale: 0.95 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 90, opacity: 0, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 350, damping: 26 }}
        className="fixed bottom-safe-nav left-3 right-3 z-50 flex justify-center select-none"
        style={{ maxWidth: "440px", margin: "0 auto" }}
      >
        <button
          onClick={() => navigate("/cart")}
          className="w-full bg-[#0E0E12]/95 backdrop-blur-2xl border border-white/15 rounded-3xl shadow-[0_16px_40px_rgba(0,0,0,0.65)] p-2.5 sm:p-3 flex items-center justify-between active:scale-[0.98] transition-all cursor-pointer group"
        >
          {/* Lado izquierdo: Ícono de bolsa + Información de artículos */}
          <div className="flex items-center gap-3 pl-1">
            <div className="w-10 h-10 bg-[#FF6A00]/15 border border-[#FF6A00]/30 rounded-2xl flex items-center justify-center relative text-[#FF6A00] shrink-0">
              <ShoppingBag className="w-5 h-5 stroke-[2.2]" />
              <span className="absolute -top-1.5 -right-1.5 bg-[#FF6A00] text-white text-[10px] font-black rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center shadow-md">
                {itemCount}
              </span>
            </div>
            <div className="text-left">
              <p className="text-[11px] text-zinc-400 font-medium leading-none">Ver mi pedido</p>
              <p className="text-base font-black text-white tracking-tight mt-1">
                ${commerceSubtotal.toFixed(2)}
              </p>
            </div>
          </div>

          {/* Lado derecho: Botón de acción Ir a pagar */}
          <div className="flex items-center gap-1.5 text-xs font-black bg-[#FF6A00] hover:bg-[#e65f00] text-white px-4 py-2.5 rounded-2xl shadow-md shadow-[#FF6A00]/30 group-hover:translate-x-0.5 transition-all">
            <span>Ir a pagar</span>
            <ArrowRight className="w-4 h-4 stroke-[2.5]" />
          </div>
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
