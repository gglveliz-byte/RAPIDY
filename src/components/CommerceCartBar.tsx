import { useNavigate } from "react-router";
import { ShoppingBag, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useCart } from "@/hooks/useCart";

interface CommerceCartBarProps {
  commerceId: number;
}

export function CommerceCartBar({ commerceId }: CommerceCartBarProps) {
  const navigate = useNavigate();
  const { items, subtotal } = useCart();

  // Filter items belonging to this commerce
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
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: "spring", stiffness: 350, damping: 25 }}
        className="fixed bottom-safe-nav left-2 right-2 sm:left-3 sm:right-3 z-50 flex justify-center"
        style={{ maxWidth: "440px", margin: "0 auto" }}
      >
        <button
          onClick={() => navigate("/cart")}
          className="w-full bg-[#2E7D32] hover:bg-[#1B5E20] text-white rounded-2xl shadow-2xl px-4 py-3 flex items-center justify-between active:scale-[0.98] transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center relative">
              <ShoppingBag className="w-5 h-5 text-white stroke-[2.2]" />
              <span className="absolute -top-1.5 -right-1.5 bg-white text-[#2E7D32] text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center shadow">
                {itemCount}
              </span>
            </div>
            <div className="text-left">
              <p className="text-xs text-white/80 font-medium">Ver mi pedido</p>
              <p className="text-sm font-bold text-white tracking-tight">
                ${commerceSubtotal.toFixed(2)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-semibold bg-white/20 px-3 py-1.5 rounded-xl">
            <span>Ir a pagar</span>
            <ArrowRight className="w-4 h-4 stroke-[2.5]" />
          </div>
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
