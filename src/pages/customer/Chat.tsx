/**
 * @archivo src/pages/customer/Chat.tsx
 * @modulo 02-customer-chat (Chat en Vivo del Pedido: Cliente con Repartidor/Comercio)
 * @proposito
 *   Pantalla de mensajería instantánea para el pedido activo.
 *   Diseñada con la estética oficial Rapidy (cabecera Dark Velvet, fondo luminoso #F7F7FA,
 *   burbujas en degradado Flame Orange para el cliente y blanco nítido para el comercio/chofer).
 *
 * @resumen_contenido
 *   - Componente `Chat`: Mensajes agrupados por fecha, respuestas rápidas,
 *     indicador de lectura, scroll automático y envío reactivo.
 *
 * @dependencias_internas
 *   - `useCustomerSession` (@/hooks/useCustomerSession)
 *   - `useChatMessages`, `useSendChatMessage`, `trpcMutate` (@/hooks/useDeliveryData)
 *
 * @dependencias_externas
 *   - `react` (`useState`, `useEffect`, `useRef`)
 *   - `react-router` (`useParams`, `useNavigate`)
 *   - `lucide-react` (`ArrowLeft`, `Send`, `Check`, `CheckCheck`, `Bike`, `Sparkles`)
 *
 * @tablas_bd_o_redis
 *   - PostgreSQL (Neon): `chat_messages`
 */

import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router";
import { ArrowLeft, Send, Check, CheckCheck, Bike, Sparkles } from "lucide-react";
import { useCustomerSession } from "@/hooks/useCustomerSession";
import { useChatMessages, useSendChatMessage, trpcMutate } from "@/hooks/useDeliveryData";

const quickMessages = [
  "Hola, ¿cuánto falta?",
  "Ya estoy atento al timbre",
  "Por favor dejar en recepción",
  "¡Muchas gracias!",
];

function groupMessagesByDate(messages: any[]) {
  const groups: { date: string; messages: any[] }[] = [];
  for (const msg of messages) {
    const date = new Date(msg.createdAt).toLocaleDateString("es-ES", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.date === date) {
      lastGroup.messages.push(msg);
    } else {
      groups.push({ date, messages: [msg] });
    }
  }
  return groups;
}

export default function Chat() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { customer } = useCustomerSession();
  const { data: messages, refresh } = useChatMessages(Number(orderId));
  const sendChat = useSendChatMessage(Number(orderId));
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (orderId && customer) {
      trpcMutate("chat.markAsRead", { orderId: Number(orderId), readerType: "customer" }).catch(() => {});
    }
  }, [orderId, customer]);

  const handleSend = async (msg: string) => {
    if (!msg.trim() || !customer) return;
    try {
      await sendChat.mutateAsync({
        orderId: Number(orderId),
        senderType: "customer",
        senderId: customer.id,
        senderName: `${customer.firstName} ${customer.lastName}`,
        message: msg.trim(),
      });
      setText("");
      refresh();
    } catch (err) {
      console.error(err);
    }
  };

  const grouped = groupMessagesByDate(messages || []);
  const isMine = (msg: any) => msg.senderType === "customer";

  return (
    <div className="mobile-container h-screen h-[100dvh] flex flex-col bg-[#F7F7FA] text-zinc-900 select-none notranslate">
      {/* 1. Cabecera Fija Dark Velvet Oficial */}
      <header className="bg-[#0E0E12] px-4 pt-safe pb-3 flex items-center gap-3 border-b border-white/10 shadow-lg text-white shrink-0 z-20">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center text-white active:scale-90 transition-all cursor-pointer shrink-0"
          aria-label="Volver"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>

        <div className="w-10 h-10 rounded-2xl bg-[#FF6A00]/15 border border-[#FF6A00]/30 flex items-center justify-center text-[#FF6A00] font-bold shrink-0">
          <Bike className="w-5 h-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h1 className="text-sm font-bold text-white tracking-tight truncate">
              Chat del Pedido #{orderId}
            </h1>
            <Sparkles className="w-3.5 h-3.5 text-[#FF6A00] shrink-0" />
          </div>
          <p className="text-[11px] text-zinc-400 flex items-center gap-1.5 font-medium mt-0.5">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shrink-0" />
            <span>Repartidor y soporte en línea</span>
          </p>
        </div>
      </header>

      {/* 2. Área de Mensajes con Burbujas Rapidy */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0 bg-[#F7F7FA]">
        {grouped.map((group) => (
          <div key={group.date} className="space-y-2.5">
            {/* Separador de Fecha */}
            <div className="flex justify-center my-2">
              <span className="bg-zinc-200/70 text-zinc-600 text-[10px] font-bold px-3 py-1 rounded-full shadow-2xs">
                {group.date}
              </span>
            </div>

            {group.messages.map((msg: any) => {
              const mine = isMine(msg);

              return (
                <div
                  key={msg.id}
                  className={`flex ${mine ? "justify-end" : "justify-start"} animate-in fade-in duration-150`}
                >
                  <div className={`max-w-[80%] ${mine ? "items-end" : "items-start"}`}>
                    {!mine && (
                      <p className="text-[10px] font-black uppercase tracking-wider text-[#FF6A00] ml-1 mb-1">
                        {msg.senderName || "Repartidor"}
                      </p>
                    )}

                    <div
                      className={`px-3.5 py-2.5 shadow-xs ${
                        mine
                          ? "bg-gradient-to-r from-[#FF5E00] to-[#FF6A00] text-white rounded-2xl rounded-tr-xs"
                          : "bg-white text-zinc-900 border border-zinc-200/80 rounded-2xl rounded-tl-xs"
                      }`}
                    >
                      <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words font-medium">
                        {msg.message}
                      </p>

                      <div
                        className={`flex items-center gap-1 mt-1 text-[10px] ${
                          mine ? "justify-end text-white/80" : "justify-start text-zinc-400"
                        }`}
                      >
                        <span>
                          {new Date(msg.createdAt).toLocaleTimeString("es-ES", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {mine && (
                          <span>
                            {msg.isRead === "yes" ? (
                              <CheckCheck className="w-3.5 h-3.5 text-white" />
                            ) : (
                              <Check className="w-3.5 h-3.5 text-white/70" />
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {(!messages || messages.length === 0) && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center text-[#FF6A00] mb-2.5">
              <Bike className="w-6 h-6 stroke-[1.8]" />
            </div>
            <p className="text-xs font-bold text-zinc-700">Comunícate con tu repartidor</p>
            <p className="text-[11px] text-zinc-400 mt-0.5 max-w-[240px]">
              Escribe cualquier indicación sobre la entrega o la dirección.
            </p>
          </div>
        )}
      </div>

      {/* 3. Atajos de Mensajes Rápidos */}
      <div className="bg-white/90 backdrop-blur-xs px-3 py-2 border-t border-zinc-200/70 flex gap-2 overflow-x-auto no-scrollbar shrink-0">
        {quickMessages.map((qm) => (
          <button
            key={qm}
            onClick={() => handleSend(qm)}
            className="px-3 py-1.5 bg-zinc-100/90 hover:bg-orange-50 hover:text-[#FF6A00] hover:border-orange-200 border border-zinc-200/70 rounded-full text-xs text-zinc-700 whitespace-nowrap active:scale-95 transition-all shadow-2xs cursor-pointer font-medium"
          >
            {qm}
          </button>
        ))}
      </div>

      {/* 4. Barra Inferior de Entrada de Texto */}
      <div className="bg-white px-3 pt-2 pb-safe flex items-center gap-2 border-t border-zinc-200/80 shrink-0 shadow-lg">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend(text)}
          placeholder="Escribe un mensaje aquí..."
          className="flex-1 h-11 px-4 bg-zinc-100 border border-zinc-200/80 rounded-2xl text-xs sm:text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-[#FF6A00] focus:ring-1 focus:ring-[#FF6A00]/20 font-medium"
        />
        <button
          onClick={() => handleSend(text)}
          disabled={sendChat.isPending || !text.trim()}
          className="w-11 h-11 bg-[#FF6A00] hover:bg-[#e65f00] text-white rounded-2xl flex items-center justify-center active:scale-90 disabled:opacity-40 transition-all shrink-0 shadow-md shadow-[#FF6A00]/25 cursor-pointer"
          aria-label="Enviar mensaje"
        >
          <Send className="w-4 h-4 stroke-[2.2]" />
        </button>
      </div>
    </div>
  );
}
