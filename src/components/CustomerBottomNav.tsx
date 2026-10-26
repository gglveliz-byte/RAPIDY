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
      className="fixed bottom-safe-nav left-2 right-2 sm:left-3 sm:right-3 bg-white/95 backdrop-blur-xl border border-gray-200/70 rounded-3xl shadow-xl px-1 py-1 sm:px-1.5 sm:py-1.5 flex justify-between items-center z-50 select-none transition-all" 
      style={{ maxWidth: "440px", margin: "0 auto" }}
    >
      <motion.button 
        whileTap={{ scale: 0.88 }}
        onClick={() => navigate("/home")} 
        className={`flex-1 min-w-0 flex flex-col items-center justify-center py-1 px-0.5 rounded-2xl transition-all min-h-[44px] ${
          active === "home" 
            ? "text-[#2E7D32] bg-green-50 font-semibold" 
            : "text-gray-500 hover:text-gray-800"
        }`}
      >
        <UtensilsCrossed className="w-5 h-5 stroke-[2.2]" />
        <span className="text-[10px] sm:text-[11px] mt-0.5 tracking-tight whitespace-nowrap">Inicio</span>
      </motion.button>
      
      <motion.button 
        whileTap={{ scale: 0.88 }}
        onClick={() => navigate("/search")} 
        className={`flex-1 min-w-0 flex flex-col items-center justify-center py-1 px-0.5 rounded-2xl transition-all min-h-[44px] ${
          active === "search" 
            ? "text-[#2E7D32] bg-green-50 font-semibold" 
            : "text-gray-500 hover:text-gray-800"
        }`}
      >
        <Search className="w-5 h-5 stroke-[2.2]" />
        <span className="text-[10px] sm:text-[11px] mt-0.5 tracking-tight whitespace-nowrap">Buscar</span>
      </motion.button>

      <motion.button 
        whileTap={{ scale: 0.88 }}
        onClick={() => navigate("/cart")} 
        className={`relative flex-1 min-w-0 flex flex-col items-center justify-center py-1 px-0.5 rounded-2xl transition-all min-h-[44px] ${
          active === "cart" 
            ? "text-[#2E7D32] bg-green-50 font-semibold" 
            : "text-gray-500 hover:text-gray-800"
        }`}
      >
        <div className="relative">
          <ShoppingCart className="w-5 h-5 stroke-[2.2]" />
          {totalItems > 0 && (
            <motion.span 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-1.5 -right-2.5 min-w-[17px] h-[17px] px-1 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center shadow-sm"
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
        className={`flex-1 min-w-0 flex flex-col items-center justify-center py-1 px-0.5 rounded-2xl transition-all min-h-[44px] ${
          active === "profile" 
            ? "text-[#2E7D32] bg-green-50 font-semibold" 
            : "text-gray-500 hover:text-gray-800"
        }`}
      >
        <User className="w-5 h-5 stroke-[2.2]" />
        <span className="text-[10px] sm:text-[11px] mt-0.5 tracking-tight whitespace-nowrap">Perfil</span>
      </motion.button>
    </nav>
  );
}
