/**
 * @archivo src/components/ChatBubble.tsx
 * @modulo 00-ui-kernel (Botón Flotante de Chat de Pedido)
 * @proposito
 *   Botón flotante tipo FAB (Floating Action Button) para acceder directamente al chat
 *   entre cliente y repartidor/comercio durante el seguimiento de la orden.
 *   Diseñado con la estética oficial Rapidy (Flame Orange #FF6A00 con halo luminoso).
 *
 * @resumen_contenido
 *   - Componente `ChatBubble`: Botón táctil circular con ícono de mensaje y micro-animación.
 *
 * @dependencias_externas
 *   - `react-router` (`useNavigate`)
 *   - `lucide-react` (`MessageCircle`)
 */

import { useNavigate } from "react-router";
import { MessageCircle } from "lucide-react";

export default function ChatBubble({
  orderId,
  role = "customer",
}: {
  orderId: number;
  role?: "customer" | "driver";
}) {
  const navigate = useNavigate();
  const path = role === "driver" ? `/driver/chat/${orderId}` : `/chat/${orderId}`;

  return (
    <div className="fixed inset-x-0 bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] z-50 pointer-events-none">
      <div className="mx-auto flex max-w-[480px] justify-end px-4">
        <button
          onClick={() => navigate(path)}
          className="pointer-events-auto w-14 h-14 bg-gradient-to-tr from-[#FF5E00] to-[#FF7700] hover:brightness-110 active:scale-90 text-white rounded-full flex items-center justify-center shadow-[0_8px_25px_rgba(255,106,0,0.45)] border-2 border-white/20 transition-all cursor-pointer group"
          aria-label="Abrir chat del pedido"
        >
          <MessageCircle className="w-6 h-6 text-white stroke-[2.2] group-hover:scale-110 transition-transform" />
        </button>
      </div>
    </div>
  );
}
