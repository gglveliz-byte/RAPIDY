/**
 * @archivo src/pages/customer/Chat.tsx
 * @modulo 02-customer-chat (Chat en Vivo del Pedido)
 * @proposito
 *   Mensajería del pedido con SSE, envío optimista, borrador persistente y
 *   estados de envío claros. La identidad del remitente la deriva el backend.
 */

import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router";
import { ArrowLeft, Send, Check, CheckCheck, Bike, Sparkles, AlertCircle, RotateCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useCustomerSession } from "@/hooks/useCustomerSession";
import { useChatMessages, useSendChatMessage, trpcMutate } from "@/hooks/useDeliveryData";
import { useOrderEvents } from "@/hooks/useOrderEvents";
import { trpc } from "@/providers/trpc";
import { ThemeToggle } from "@/components/ThemeToggle";

const quickMessages = [
  "Hola, ¿cuánto falta?",
  "Ya estoy atento al timbre",
  "Por favor dejar en recepción",
  "¡Muchas gracias!",
];

interface OptimisticMessage {
  id: string;
  orderId: number;
  senderType: "customer";
  senderId: number;
  senderName: string;
  message: string;
  isRead: "no";
  createdAt: string;
  status: "sending" | "failed";
}

function createTemporaryMessageId(): string {
  return `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

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
  const chatOrderId = Number(orderId);
  const navigate = useNavigate();
  const { customer } = useCustomerSession();
  const { data: messages, loading, error, refresh } = useChatMessages(chatOrderId);
  const sendChat = useSendChatMessage(chatOrderId);
  const utils = trpc.useUtils();
  const { connected } = useOrderEvents(chatOrderId || undefined, utils);

  const [text, setText] = useState("");
  const [optimistic, setOptimistic] = useState<OptimisticMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const previousCountRef = useRef(0);

  const allMessages = [...messages, ...optimistic];

  // Borrador persistente por pedido.
  useEffect(() => {
    if (!chatOrderId) return;
    try {
      const saved = localStorage.getItem(`rapidy:chat-draft:${chatOrderId}`);
      if (saved) setText(saved);
    } catch { /* sin acción */ }
  }, [chatOrderId]);

  useEffect(() => {
    if (!chatOrderId) return;
    try {
      if (text) localStorage.setItem(`rapidy:chat-draft:${chatOrderId}`, text);
      else localStorage.removeItem(`rapidy:chat-draft:${chatOrderId}`);
    } catch { /* sin acción */ }
  }, [text, chatOrderId]);

  // Scroll al último mensaje solo si el usuario está cerca del final.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const nearBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight < 140;
    if (previousCountRef.current === 0 || nearBottom) {
      element.scrollTop = element.scrollHeight;
    }
    previousCountRef.current = allMessages.length;
  }, [allMessages.length]);

  // Acuse de lectura cuando llegan mensajes nuevos.
  useEffect(() => {
    if (!chatOrderId || messages.length === 0) return;
    trpcMutate("chat.markAsRead", { orderId: chatOrderId }).catch(() => {});
  }, [chatOrderId, messages.length]);

  const handleSend = async (rawMessage: string) => {
    const message = rawMessage.trim();
    if (!message || !customer || !chatOrderId) return;

    const temporaryId = createTemporaryMessageId();
    const optimisticMessage: OptimisticMessage = {
      id: temporaryId,
      orderId: chatOrderId,
      senderType: "customer",
      senderId: customer.id,
      senderName: `${customer.firstName} ${customer.lastName}`.trim(),
      message,
      isRead: "no",
      createdAt: new Date().toISOString(),
      status: "sending",
    };

    setOptimistic((previous) => [...previous, optimisticMessage]);
    if (text === rawMessage) setText("");

    try {
      await sendChat.mutateAsync({
        orderId: chatOrderId,
        message,
        as: "customer",
      });
      setOptimistic((previous) => previous.filter((item) => item.id !== temporaryId));
      refresh();
    } catch (err: any) {
      setOptimistic((previous) =>
        previous.map((item) =>
          item.id === temporaryId ? { ...item, status: "failed" } : item
        )
      );
      toast.error(err?.message || "No pudimos enviar el mensaje.");
    }
  };

  const retryMessage = (message: OptimisticMessage) => {
    setOptimistic((previous) => previous.filter((item) => item.id !== message.id));
    handleSend(message.message);
  };

  const grouped = groupMessagesByDate(allMessages);
  const isMine = (message: any) => message.senderType === "customer";

  return (
    <div className="mobile-container h-screen h-[100dvh] flex flex-col bg-surface dark:bg-[#0E0E12] text-zinc-900 dark:text-zinc-100 select-none notranslate">
      <header className="bg-ink dark:bg-ink/95 px-4 pt-safe pb-3 flex items-center gap-3 border-b border-white/10 dark:border-white/10 shadow-lg text-white shrink-0 z-20">
        <button
          onClick={() => navigate(-1)}
          className="w-11 h-11 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center text-white active:scale-90 transition-all cursor-pointer shrink-0"
          aria-label="Volver"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>

        <div className="w-10 h-10 rounded-2xl bg-brand/15 border border-brand/30 flex items-center justify-center text-brand font-bold shrink-0">
          <Bike className="w-5 h-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h1 className="text-sm font-bold text-white tracking-tight truncate">
              Chat del Pedido #{orderId}
            </h1>
            <Sparkles className="w-3.5 h-3.5 text-brand shrink-0" />
          </div>
          <p className="text-[11px] text-zinc-400 flex items-center gap-1.5 font-medium mt-0.5" aria-live="polite">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${connected ? "bg-emerald-500" : "bg-amber-400"} animate-pulse motion-reduce:animate-none`}
            />
            <span>{connected ? "Mensajes en tiempo real" : "Reconectando..."}</span>
          </p>
        </div>

        <ThemeToggle size="sm" className="shrink-0" />
      </header>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0 bg-surface dark:bg-[#0E0E12]"
        aria-live="polite"
      >
        {loading && allMessages.length === 0 && (
          <div className="flex justify-center py-10">
            <Loader2 className="w-7 h-7 text-brand animate-spin" />
          </div>
        )}

        {error && allMessages.length === 0 && (
          <div className="text-center py-10">
            <AlertCircle className="w-8 h-8 text-rose-400 mx-auto mb-2" />
            <p className="text-sm font-bold text-zinc-700 dark:text-zinc-200">No pudimos cargar el chat</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{error.message}</p>
            <button
              onClick={() => refresh()}
              className="mt-3 h-10 px-4 bg-brand hover:bg-brand-strong text-white text-xs font-bold rounded-xl"
            >
              Reintentar
            </button>
          </div>
        )}

        {grouped.map((group) => (
          <div key={group.date} className="space-y-2.5">
            <div className="flex justify-center my-2">
              <span className="bg-zinc-200/70 dark:bg-white/10 text-zinc-600 dark:text-zinc-300 text-[10px] font-bold px-3 py-1 rounded-full shadow-2xs border border-transparent dark:border-white/5">
                {group.date}
              </span>
            </div>

            {group.messages.map((msg: any) => {
              const mine = isMine(msg);
              const isOptimistic = String(msg.id).startsWith("temp-");
              const sending = isOptimistic && msg.status === "sending";
              const failed = isOptimistic && msg.status === "failed";

              return (
                <div
                  key={msg.id}
                  className={`flex ${mine ? "justify-end" : "justify-start"} animate-in fade-in duration-150`}
                >
                  <div className={`max-w-[80%] ${mine ? "items-end" : "items-start"}`}>
                    {!mine && (
                      <p className="text-[10px] font-black uppercase tracking-wider text-brand ml-1 mb-1">
                        {msg.senderName || (msg.senderType === "driver" ? "Repartidor" : "Comercio")}
                      </p>
                    )}

                    <div
                      className={`px-3.5 py-2.5 shadow-xs ${
                        mine
                          ? "bg-brand text-white rounded-2xl rounded-tr-xs"
                          : "bg-white dark:bg-[#1E1E24] text-zinc-900 dark:text-white border border-zinc-200/80 dark:border-white/10 rounded-2xl rounded-tl-xs"
                      } ${failed ? "ring-2 ring-rose-400/60" : ""}`}
                    >
                      <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words font-medium">
                        {msg.message}
                      </p>

                      <div
                        className={`flex items-center gap-1 mt-1 text-[10px] ${
                          mine ? "justify-end text-white/80 dark:text-white/60" : "justify-start text-zinc-400 dark:text-zinc-400"
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
                            {sending ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : failed ? (
                              <AlertCircle className="w-3.5 h-3.5 text-rose-200" />
                            ) : msg.isRead === "yes" ? (
                              <CheckCheck className="w-3.5 h-3.5 text-white" />
                            ) : (
                              <Check className="w-3.5 h-3.5 text-white/70" />
                            )}
                          </span>
                        )}
                      </div>

                      {failed && (
                        <button
                          onClick={() => retryMessage(msg)}
                          className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-white underline"
                        >
                          <RotateCw className="w-3 h-3" />
                          Reintentar envío
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {!loading && !error && allMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-orange-50 dark:bg-brand/10 border border-orange-100 dark:border-brand/20 flex items-center justify-center text-brand mb-2.5">
              <Bike className="w-6 h-6 stroke-[1.8]" />
            </div>
            <p className="text-xs font-bold text-zinc-700 dark:text-zinc-200">Envía un mensaje sobre tu pedido</p>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-400 mt-0.5 max-w-[260px]">
              Escribe cualquier indicación sobre la entrega, la dirección o el pago.
            </p>
          </div>
        )}
      </div>

      <div className="bg-white/90 dark:bg-[#0E0E12]/95 backdrop-blur-xs px-3 py-2 border-t border-zinc-200/70 dark:border-white/10 flex gap-2 overflow-x-auto no-scrollbar shrink-0">
        {quickMessages.map((quickMessage) => (
          <button
            key={quickMessage}
            onClick={() => handleSend(quickMessage)}
            className="min-h-[36px] px-3 py-1.5 bg-zinc-100/90 dark:bg-[#1E1E24] hover:bg-orange-50 dark:hover:bg-brand/15 hover:text-brand dark:hover:text-brand hover:border-orange-200 dark:hover:border-brand/30 border border-zinc-200/70 dark:border-white/10 rounded-full text-xs text-zinc-700 dark:text-zinc-300 whitespace-nowrap active:scale-95 transition-all shadow-2xs cursor-pointer font-medium"
          >
            {quickMessage}
          </button>
        ))}
      </div>

      <div className="bg-white dark:bg-ink/95 px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] flex items-center gap-2 border-t border-zinc-200/80 dark:border-white/10 shrink-0 shadow-lg">
        <input
          type="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              handleSend(text);
            }
          }}
          maxLength={2000}
          placeholder="Escribe un mensaje aquí..."
          aria-label="Mensaje"
          className="flex-1 h-11 px-4 bg-zinc-100 dark:bg-[#1E1E24] border border-zinc-200/80 dark:border-white/15 rounded-2xl text-xs sm:text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand/20 font-medium"
        />
        <button
          onClick={() => handleSend(text)}
          disabled={!text.trim()}
          className="w-11 h-11 bg-brand hover:bg-brand-strong text-white rounded-2xl flex items-center justify-center active:scale-90 disabled:opacity-40 transition-all shrink-0 shadow-md shadow-brand/25 cursor-pointer"
          aria-label="Enviar mensaje"
        >
          <Send className="w-4 h-4 stroke-[2.2]" />
        </button>
      </div>
    </div>
  );
}