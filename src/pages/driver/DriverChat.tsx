import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router";
import { ArrowLeft, Send, Check, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { useDriverSession } from "@/hooks/useDeliveryData";
import { useChatMessages, useSendChatMessage, trpcMutate } from "@/hooks/useDeliveryData";
import { useOrderEvents } from "@/hooks/useOrderEvents";
import { trpc } from "@/providers/trpc";

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
  const { data: messages, refresh, error } = useChatMessages(chatOrderId);
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
    <div className="mobile-container min-h-screen flex flex-col notranslate">
      {/* Header */}
      <div className="bg-ink px-4 pt-safe pb-3 flex items-center gap-3 shadow-md z-10">
        <button onClick={() => navigate(-1)} className="touch-target text-white">
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div className="w-10 h-10 bg-brand/15 border border-brand/30 rounded-full flex items-center justify-center">
          <span className="text-brand text-sm font-black">
            {driverSession?.name?.charAt(0) || "C"}
          </span>
        </div>
        <div className="flex-1">
          <h1 className="text-sm font-semibold text-white">Pedido #{orderId}</h1>
          <p className="text-xs text-white/70 flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-green-400" : "bg-amber-400"} animate-pulse`} />
            {connected ? "En línea" : "Reconectando..."}
          </p>
        </div>
      </div>

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 bg-surface">
        {error && (
          <div role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-center justify-between gap-2">
            <span>No se pudo cargar el chat: {error.message}</span>
            <button type="button" onClick={() => refresh()} className="font-bold underline">
              Reintentar
            </button>
          </div>
        )}
        {grouped.map((group) => (
          <div key={group.date}>
            {/* Date separator */}
            <div className="flex justify-center my-3">
              <span className="bg-white/90 text-gray-500 text-[11px] px-3 py-1 rounded-lg shadow-sm">
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
                    <p className="text-[11px] font-semibold text-brand ml-1 mb-0.5">
                      {msg.senderName || "Cliente"}
                    </p>
                  )}
                  <div className={`px-3 py-2 ${isMine(msg)
                    ? "bg-brand text-white rounded-tl-xl rounded-tr-sm rounded-bl-xl rounded-br-xl shadow-sm"
                    : "bg-white text-zinc-900 rounded-tl-sm rounded-tr-xl rounded-bl-xl rounded-br-xl shadow-sm"}`}
                  >
                    <p className={`text-sm leading-snug whitespace-pre-wrap break-words ${isMine(msg) ? "text-white" : "text-zinc-800"}`}>{msg.message}</p>
                    <div className={`flex items-center gap-0.5 mt-0.5 ${isMine(msg) ? "justify-end" : "justify-start"}`}>
                      <span className={`text-[10px] ${isMine(msg) ? "text-white/80" : "text-zinc-400"}`}>
                        {new Date(msg.createdAt).toLocaleTimeString("es-ES", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {isMine(msg) && (
                        <span className="text-[10px] text-white">
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
        {(!messages || messages.length === 0) && (
          <div className="flex justify-center mt-8">
            <span className="bg-white/80 text-gray-500 text-xs px-4 py-2 rounded-lg shadow-sm">
              Los mensajes están cifrados. Escribí el primero.
            </span>
          </div>
        )}
      </div>

      {/* Quick messages */}
      <div className="bg-white/95 px-3 py-2 border-t border-zinc-200 flex gap-2 overflow-x-auto no-scrollbar">
        {quickMessages.map((qm) => (
          <button
            key={qm}
            onClick={() => handleSend(qm)}
            disabled={sendChat.isPending}
            className="px-3 py-1.5 bg-zinc-100 rounded-full text-xs text-zinc-700 whitespace-nowrap hover:bg-brand-soft hover:text-brand transition-colors shadow-sm disabled:opacity-40"
          >
            {qm}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="bg-white px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] flex items-center gap-2 border-t border-zinc-200/80">
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
          className="flex-1 h-11 px-4 bg-zinc-100 border border-zinc-200/80 rounded-full text-sm text-zinc-900 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand/20 shadow-sm"
        />
        <button
          onClick={() => handleSend(text)}
          disabled={sendChat.isPending || !text.trim()}
          className="w-11 h-11 bg-brand rounded-full flex items-center justify-center text-white hover:bg-brand-strong disabled:opacity-40 transition-all flex-shrink-0 shadow-sm"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
