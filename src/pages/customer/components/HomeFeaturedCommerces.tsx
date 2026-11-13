/**
 * @archivo src/pages/customer/components/HomeFeaturedCommerces.tsx
 * @modulo 02-customer-home (Sección de Restaurantes Destacados)
 * @proposito
 *   Muestra la hilera de "Restaurantes destacados" y platillos populares
 *   conforme al diseño del mockup. Muestra imágenes gastronómicas, tiempos de entrega,
 *   puntuación con estrellas y botón de acceso directo al menú del comercio.
 *
 * @resumen_contenido
 *   - Componente `HomeFeaturedCommerces`: Encabezado con enlace "Ver más >",
 *     carrusel horizontal deslizable con tarjetas de alta resolución y badges de estado.
 *
 * @dependencias_internas
 *   - `safeImage` (@/lib/imageUtils)
 *
 * @dependencias_externas
 *   - `lucide-react` (`Star`, `Clock`, `ChevronRight`)
 *   - `react-router` (`useNavigate`)
 *
 * @tablas_bd_o_redis
 *   - PostgreSQL (Neon): `commerces`
 */

import { useNavigate } from "react-router";
import { Star, Clock, ChevronRight } from "lucide-react";
import { safeImage } from "@/lib/imageUtils";

interface Commerce {
  id: number;
  name: string;
  description: string;
  logo: string;
  coverImage: string;
  rating: string;
  deliveryTime: string;
  minOrder: string;
  isOpen: string;
}

interface HomeFeaturedCommercesProps {
  commerces: Commerce[];
  loading?: boolean;
}

export function HomeFeaturedCommerces({
  commerces,
  loading = false,
}: HomeFeaturedCommercesProps) {
  const navigate = useNavigate();

  return (
    <div className="w-full">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base sm:text-lg font-black text-zinc-900 tracking-tight">
          Restaurantes destacados
        </h2>
        <button
          onClick={() => navigate("/search")}
          className="text-xs font-bold text-[#FF6A00] hover:text-[#e05e00] flex items-center gap-0.5 cursor-pointer transition-colors"
        >
          <span>Ver más</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Horizontal Carousel */}
      {loading ? (
        <div className="flex gap-3 overflow-x-auto no-scrollbar">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="min-w-[200px] h-44 bg-zinc-200 rounded-3xl animate-pulse"
            />
          ))}
        </div>
      ) : commerces.length === 0 ? (
        <div className="p-6 bg-white rounded-2xl text-center border border-zinc-100">
          <p className="text-xs text-zinc-500">No hay restaurantes disponibles en este momento</p>
        </div>
      ) : (
        <div className="flex gap-3.5 overflow-x-auto no-scrollbar pb-2">
          {commerces.map((commerce) => (
            <div
              key={commerce.id}
              onClick={() => navigate(`/commerce/${commerce.id}`)}
              className="min-w-[190px] sm:min-w-[210px] bg-white rounded-3xl overflow-hidden border border-zinc-100 shadow-[0_6px_20px_rgba(0,0,0,0.06)] hover:shadow-lg hover:-translate-y-1 active:scale-[0.98] transition-all cursor-pointer flex flex-col justify-between group"
            >
              {/* Cover Image */}
              <div
                className="h-28 w-full bg-cover bg-center relative overflow-hidden"
                style={{
                  backgroundImage: `url(${safeImage(commerce.coverImage, "cover")})`,
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />
                <div className="absolute top-2.5 right-2.5 flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-[10px] font-bold text-white shadow-xs">
                  <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                  <span>{commerce.rating || "4.8"}</span>
                </div>
                <div className="absolute bottom-2 left-2.5 flex items-center gap-1 text-[10px] font-semibold text-white/90">
                  <Clock className="w-3 h-3 text-white/80" />
                  <span>{commerce.deliveryTime || "20-30 min"}</span>
                </div>
              </div>

              {/* Info Body */}
              <div className="p-3">
                <h3 className="font-bold text-zinc-900 text-sm truncate group-hover:text-[#FF6A00] transition-colors">
                  {commerce.name}
                </h3>
                <p className="text-[11px] text-zinc-500 truncate mt-0.5">
                  {commerce.description || "Comida deliciosa"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

