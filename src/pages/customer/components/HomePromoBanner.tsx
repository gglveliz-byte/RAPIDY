/**
 * @archivo src/pages/customer/components/HomePromoBanner.tsx
 * @modulo 02-customer-home (Banner Dinámico: Tops de Productos Más Pedidos)
 * @proposito
 *   Banner interactivo de alto impacto visual para el inicio de Rapidy con
 *   compatibilidad para Modo Oscuro (Dark Velvet #0E0E12) y Modo Claro.
 *   Clasifica y rota dinámicamente en tiempo real los productos más pedidos (TOP 1, 2, 3, 4...)
 *   conforme a las órdenes registradas en PostgreSQL. Presenta insignias de ranking (TOP #1 MÁS PEDIDO),
 *   animaciones fluidas con framer-motion, fotos del platillo, precio y botón de compra directa.
 *
 * @resumen_contenido
 *   - Componente `HomePromoBanner`: Carrusel rotativo con temporizador automático,
 *     insignia de ranking reactivo, selector de indicadores y enlace directo al comercio
 *     con acento Flame Orange oficial y bordes sutiles dark:border-white/10.
 *
 * @dependencias_internas
 *   - `useTopOrderedProducts` (@/hooks/useDeliveryData)
 *   - `safeImage` (@/lib/imageUtils)
 *
 * @dependencias_externas
 *   - `react` (`useState`, `useEffect`)
 *   - `react-router` (`useNavigate`)
 *   - `framer-motion` (`motion`, `AnimatePresence`)
 *   - `lucide-react` (`Zap`, `ArrowRight`, `Flame`)
 *
 * @tablas_bd_o_redis
 *   - PostgreSQL (Neon): `order_items`, `products`, `commerces`
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Zap, ArrowRight, Flame } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTopOrderedProducts } from "@/hooks/useDeliveryData";
import { safeImage } from "@/lib/imageUtils";

// Lista de respaldo en caso de que aún no existan órdenes registradas
const fallbackProducts = [
  {
    id: 2,
    commerceId: 1,
    name: "Hamburguesa completa",
    price: "6.50",
    image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=350&fit=crop&auto=format",
    commerceName: "La Esquina del Sabor",
  },
  {
    id: 1,
    commerceId: 1,
    name: "Milanesa con papas fritas",
    price: "7.50",
    image: "https://upload.wikimedia.org/wikipedia/commons/9/96/Milanesa_napolitana_con_papas_fritas_rodajas_de_tomate_y_or%C3%A9gano.jpg",
    commerceName: "La Esquina del Sabor",
  },
  {
    id: 7,
    commerceId: 2,
    name: "Medialunas de manteca x6",
    price: "2.50",
    image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&h=350&fit=crop&auto=format",
    commerceName: "Panadería El Horno",
  },
  {
    id: 5,
    commerceId: 2,
    name: "Docena de facturas surtidas",
    price: "4.50",
    image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&h=350&fit=crop&auto=format",
    commerceName: "Panadería El Horno",
  },
];

export function HomePromoBanner() {
  const navigate = useNavigate();
  const { data: topProductsData } = useTopOrderedProducts();
  const [currentIndex, setCurrentIndex] = useState(0);

  const topList = topProductsData.length > 0 ? topProductsData : fallbackProducts;

  // Rotación automática cada 3.8 segundos
  useEffect(() => {
    if (topList.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % topList.length);
    }, 3800);
    return () => clearInterval(timer);
  }, [topList.length]);

  const currentProduct = topList[currentIndex] || topList[0];
  const rankNumber = currentIndex + 1;

  const handleActionClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentProduct?.commerceId) {
      navigate(`/commerce/${currentProduct.commerceId}`);
    } else {
      navigate("/search");
    }
  };

  return (
    <div
      onClick={handleActionClick}
      className="relative w-full overflow-hidden rounded-3xl bg-gradient-to-r from-[#FFA000] via-[#FF8500] to-[#FF5E00] shadow-[0_12px_36px_rgba(255,106,0,0.35)] dark:shadow-[0_12px_36px_rgba(255,106,0,0.25)] border border-transparent dark:border-white/10 p-5 sm:p-6 text-white cursor-pointer select-none group"
    >
      {/* Luces y destellos dinámicos de fondo */}
      <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-white/20 rounded-full blur-2xl pointer-events-none group-hover:scale-125 transition-transform duration-700" />
      <div className="absolute left-1/3 top-0 w-32 h-32 bg-yellow-300/25 rounded-full blur-xl pointer-events-none" />

      <div className="relative z-10 flex items-center justify-between gap-3">
        {/* Lado Izquierdo: Copy + Acción + Datos del Producto Actual */}
        <div className="flex-1 max-w-[210px] sm:max-w-[260px]">
          <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-black/20 backdrop-blur-md text-[10px] font-black tracking-wide uppercase mb-2">
            <Zap className="w-3 h-3 text-yellow-300 fill-yellow-300 animate-pulse" />
            <span>Rapidy Express</span>
          </div>

          <h2 className="text-xl sm:text-2xl font-black tracking-tight leading-tight text-white drop-shadow-sm">
            ¡Pedidos más rápidos!
          </h2>

          <AnimatePresence mode="wait">
            <motion.div
              key={currentProduct.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3 }}
              className="mt-1"
            >
              <p className="text-xs sm:text-sm font-bold text-white truncate">
                {currentProduct.name}
              </p>
              <p className="text-[10px] sm:text-xs text-white/80 font-medium truncate">
                {currentProduct.commerceName ? `de ${currentProduct.commerceName}` : "Favorito de la comunidad"}
              </p>
            </motion.div>
          </AnimatePresence>

          <div className="mt-3 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-black/30 backdrop-blur-md text-xs font-bold text-white group-hover:bg-black/45 transition-all shadow-xs">
            <span>Pedir ahora</span>
            <span className="font-black text-yellow-300">${currentProduct.price}</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* Lado Derecho: Producto con Insignia de Ranking Dinámico (TOP 1, 2, 3...) */}
        <div className="relative w-28 sm:w-36 h-28 sm:h-32 shrink-0 flex items-center justify-center">
          {/* Ambient Glow */}
          <div className="absolute inset-0 bg-yellow-200/35 rounded-full blur-md" />

          {/* Platillo en Levitación con Transición Reactiva */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentProduct.id}
              initial={{ scale: 0.85, opacity: 0, rotate: -6 }}
              animate={{ scale: 1, opacity: 1, rotate: -2 }}
              exit={{ scale: 0.85, opacity: 0, rotate: 6 }}
              transition={{ duration: 0.45, ease: "easeOut" }}
              className="relative z-10"
            >
              <img
                src={safeImage(currentProduct.image, "product")}
                alt={currentProduct.name}
                className="w-24 sm:w-28 h-24 sm:h-28 object-cover rounded-2xl shadow-[0_12px_24px_rgba(0,0,0,0.35)] ring-2 ring-white/40 dark:ring-white/30"
              />

              {/* Insignia Dinámica del Ranking de Pedidos */}
              <motion.div
                initial={{ scale: 0.7 }}
                animate={{ scale: 1 }}
                className={`absolute -top-2.5 -right-2 px-2.5 py-0.5 text-white text-[9px] font-black uppercase rounded-full shadow-lg tracking-wider flex items-center gap-1 ${
                  rankNumber === 1
                    ? "bg-[#FF2D55] ring-2 ring-white/50"
                    : rankNumber === 2
                    ? "bg-brand ring-1 ring-white/40"
                    : rankNumber === 3
                    ? "bg-amber-600 ring-1 ring-white/40"
                    : "bg-zinc-800 ring-1 ring-white/30"
                }`}
              >
                <Flame className="w-2.5 h-2.5 fill-white" />
                <span>TOP {rankNumber}</span>
              </motion.div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Indicadores Dinámicos de Puntos (Dots de Carrusel Tops) */}
      <div className="relative z-10 flex items-center justify-center gap-1.5 mt-3 pt-1 border-t border-white/10">
        {topList.map((prod, idx) => (
          <button
            key={prod.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setCurrentIndex(idx);
            }}
            className={`transition-all duration-300 rounded-full cursor-pointer ${
              currentIndex === idx
                ? "w-6 h-1.5 bg-white shadow-sm"
                : "w-1.5 h-1.5 bg-white/40 hover:bg-white/70"
            }`}
            aria-label={`Ver Top ${idx + 1}: ${prod.name}`}
          />
        ))}
      </div>
    </div>
  );
}
