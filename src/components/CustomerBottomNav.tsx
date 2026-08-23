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
    <nav className="fixed bottom-4 left-4 right-4 bg-white/80 backdrop-blur-md border border-white/20 rounded-3xl shadow-xl px-6 py-3 flex justify-around items-center z-50" style={{ maxWidth: "448px", margin: "0 auto" }}>
      <motion.button 
        whileTap={{ scale: 0.8 }}
        onClick={() => navigate("/home")} 
        className={`bottom-nav-item ${active === "home" ? "active" : ""}`}
      >
        <UtensilsCrossed className="w-5 h-5" />
        <span className="text-[10px]">Inicio</span>
      </motion.button>
      
      <motion.button 
        whileTap={{ scale: 0.8 }}
        onClick={() => navigate("/search")} 
        className={`bottom-nav-item ${active === "search" ? "active" : ""}`}
      >
        <Search className="w-5 h-5" />
        <span className="text-[10px]">Buscar</span>
      </motion.button>

      <motion.button 
        whileTap={{ scale: 0.8 }}
        onClick={() => navigate("/cart")} 
        className={`relative bottom-nav-item flex flex-col items-center justify-center ${active === "cart" ? "active" : ""}`}
      >
        <div className="relative">
          <ShoppingCart className="w-5 h-5" />
          {totalItems > 0 && (
            <motion.span 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-1.5 -right-2 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center"
            >
              {totalItems}
            </motion.span>
          )}
        </div>
        <span className="text-[10px] mt-1">Carrito</span>
      </motion.button>

      <motion.button 
        whileTap={{ scale: 0.8 }}
        onClick={() => navigate("/profile")} 
        className={`bottom-nav-item ${active === "profile" ? "active" : ""}`}
      >
        <User className="w-5 h-5" />
        <span className="text-[10px]">Perfil</span>
      </motion.button>
    </nav>
  );
}
