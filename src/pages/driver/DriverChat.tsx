import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router";
import { ArrowLeft, Send, Check, CheckCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useDriverSession } from "@/hooks/useDeliveryData";
import { useChatMessages, useSendChatMessage, trpcMutate } from "@/hooks/useDeliveryData";
import { useOrderEvents } from "@/hooks/useOrderEvents";
import { trpc } from "@/providers/trpc";
import { ThemeToggle } from "@/components/ThemeToggle";

const quickMessages = [
  "Hola, ya voy en camino",
  "Estoy acá, esperando",
  "Llego enseguida",
  "¡Gracias!",
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

export default function DriverChat() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const driverSession = useDriverSession();
  const chatOrderId = Number(orderId);
  const { data: messages, loading, refresh, error } = useChatMessages(chatOrderId);
  const sendChat = useSendChatMessage(chatOrderId);
  const utils = trpc.useUtils();
  const { connected } = useOrderEvents(chatOrderId || undefined, utils);
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const lastMessageId = messages && messages.length > 0
    ? (messages[messages.length - 1] as any).id
    : null;

  useEffect(() => {
    if (chatOrderId && driverSession && lastMessageId) {
      trpcMutate("chat.markAsRead", { orderId: chatOrderId }).catch(() => {});
    }
  }, [chatOrderId, driverSession, lastMessageId]);

  const handleSend = async (msg: string) => {
    const message = msg.trim();
    if (!message || !driverSession || !chatOrderId || sendChat.isPending) return;
    try {
      await sendChat.mutateAsync({
        orderId: chatOrderId,
        message,
        as: "driver",
      });
      setText("");
      refresh();
    } catch (err: any) {
      toast.error(err?.message || "No pudimos enviar el mensaje.");
    }
  };

  const grouped = groupMessagesByDate(messages || []);
  const isMine = (msg: any) => msg.senderType === "driver";

  return (
    <div className="mobile-container h-screen h-[100dvh] flex flex-col bg-surface dark:bg-[#0E0E12] text-zinc-900 dark:text-zinc-100 notranslate">
      {/* Header */}
      <div className="bg-gradient-to-r from-brand to-brand-strong px-4 pt-safe pb-3 flex items-center gap-3 border-b border-white/15 dark:border-white/10 shadow-lg dark:shadow-none z-10 shrink-0">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Volver"
          className="touch-target w-11 h-11 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center text-white active:scale-90 transition-all shrink-0"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div className="w-10 h-10 bg-white/20 border border-white/25 rounded-full flex items-center justify-center shrink-0">
          <span className="text-white text-sm font-black">
            {driverSession?.name?.charAt(0) || "C"}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold text-white truncate">Pedido #{orderId}</h1>
          <p className="text-xs text-white/80 flex items-center gap-1" aria-live="polite">
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-green-400" : "bg-amber-400"} animate-pulse motion-reduce:animate-none`} />
            {connected ? "En línea" : "Reconectando..."}
          </p>
        </div>
        <ThemeToggle
          size="lg"
          className="shrink-0 !bg-white !border-white/60 !text-zinc-900 hover:!bg-white/90 hover:!text-zinc-900 shadow-none"
        />
      </div>

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-2 bg-surface dark:bg-[#0E0E12]">
        {loading && (!messages || messages.length === 0) && (
          <div className="flex justify-center py-10">
            <Loader2 className="w-7 h-7 text-brand animate-spin" />
            <span className="sr-only">Cargando mensajes</span>
          </div>
        )}

        {error && (
          <div role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 flex items-center justify-between gap-2">
            <span>No se pudo cargar el chat: {error.message}</span>
            <button
              type="button"
              onClick={() => refresh()}
              className="min-h-11 px-2 font-bold underline underline-offset-2 shrink-0"
            >
              Reintentar
            </button>
          </div>
        )}

        {grouped.map((group) => (
          <div key={group.date}>
            {/* Date separator */}
            <div className="flex justify-center my-3">
              <span className="bg-zinc-200/80 dark:bg-white/10 text-zinc-600 dark:text-zinc-300 text-[11px] font-medium px-3 py-1 rounded-full border border-transparent dark:border-white/5">
                {group.date}
              </span>
            </div>
            {group.messages.map((msg: any) => (
              <div
                key={msg.id}
                className={`flex mb-1.5 ${isMine(msg) ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-[78%] ${isMine(msg) ? "order-1" : "order-1"}`}>
                  {!isMine(msg) && (
                    <p className="text-[11px] font-semibold text-brand-strong dark:text-brand ml-1 mb-0.5">
                      {msg.senderName || "Cliente"}
                    </p>
                  )}
                  <div className={`px-3 py-2 ${isMine(msg)
                    ? "bg-brand-strong text-white dark:bg-brand dark:text-zinc-950 rounded-tl-xl rounded-tr-sm rounded-bl-xl rounded-br-xl shadow-sm dark:shadow-none"
                    : "bg-white text-zinc-900 dark:bg-[#1E1E24] dark:text-zinc-100 border border-zinc-200/80 dark:border-white/10 rounded-tl-sm rounded-tr-xl rounded-bl-xl rounded-br-xl shadow-sm dark:shadow-none"}`}
                  >
                    <p className="text-sm leading-snug whitespace-pre-wrap break-words">{msg.message}</p>
                    <div className={`flex items-center gap-0.5 mt-0.5 ${isMine(msg) ? "justify-end" : "justify-start"}`}>
                      <span className={`text-[10px] ${isMine(msg) ? "text-white/75 dark:text-zinc-900/70" : "text-zinc-500 dark:text-zinc-400"}`}>
                        {new Date(msg.createdAt).toLocaleTimeString("es-ES", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {isMine(msg) && (
                        <span className={`text-[10px] ${msg.isRead === "yes" ? "text-emerald-200 dark:text-emerald-800" : "text-white/80 dark:text-zinc-900/60"}`}>
                          {msg.isRead === "yes" ? <CheckCheck className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}

        {!loading && (!messages || messages.length === 0) && (
          <div className="flex justify-center mt-8 px-4">
            <span className="max-w-xs text-center bg-white/90 dark:bg-[#1A1A1E] text-zinc-600 dark:text-zinc-300 text-xs px-4 py-2.5 rounded-xl border border-zinc-200/70 dark:border-white/10 shadow-sm dark:shadow-none">
              Los mensajes están cifrados. Escribí el primero.
            </span>
          </div>
        )}
      </div>

      {/* Quick messages */}
      <div className="bg-white/95 dark:bg-[#111115]/95 backdrop-blur px-3 py-2 border-t border-zinc-200 dark:border-white/10 flex gap-2 overflow-x-auto no-scrollbar shrink-0">
        {quickMessages.map((qm) => (
          <button
            key={qm}
            type="button"
            onClick={() => handleSend(qm)}
            disabled={sendChat.isPending}
            className="min-h-11 px-3 py-1.5 bg-zinc-100 dark:bg-[#1E1E24] border border-zinc-200/70 dark:border-white/10 rounded-full text-xs font-medium text-zinc-700 dark:text-zinc-300 whitespace-nowrap hover:bg-brand-soft hover:text-brand-strong dark:hover:bg-brand/15 dark:hover:text-brand dark:hover:border-brand/30 transition-colors shadow-sm dark:shadow-none disabled:opacity-40"
          >
            {qm}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="bg-white dark:bg-[#111115] px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] flex items-center gap-2 border-t border-zinc-200/80 dark:border-white/10 shrink-0">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              handleSend(text);
            }
          }}
          maxLength={2000}
          placeholder="Escribe un mensaje..."
          aria-label="Mensaje"
          className="flex-1 h-11 px-4 bg-zinc-100 dark:bg-[#1E1E24] border border-zinc-200/80 dark:border-white/15 rounded-full text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand/20 shadow-sm dark:shadow-none"
        />
        <button
          type="button"
          onClick={() => handleSend(text)}
          disabled={sendChat.isPending || !text.trim()}
          aria-label="Enviar mensaje"
          className="w-11 h-11 bg-brand rounded-full flex items-center justify-center text-zinc-950 hover:brightness-110 disabled:opacity-40 transition-all flex-shrink-0 shadow-sm dark:shadow-none"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}