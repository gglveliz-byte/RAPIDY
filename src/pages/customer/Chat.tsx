import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router";
import { ArrowLeft, Send, Check, CheckCheck } from "lucide-react";
import { useCustomerSession } from "@/hooks/useCustomerSession";
import { useChatMessages, useSendChatMessage, trpcMutate } from "@/hooks/useDeliveryData";

const quickMessages = [
  "Hola, una pregunta",
  "¿Cuánto falta?",
  "¡Gracias!",
  "Llego enseguida",
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
    <div className="mobile-container h-screen h-[100dvh] flex flex-col notranslate">
      {/* Header */}
      <div className="bg-[#075E54] px-4 pt-safe-top pb-3 flex items-center gap-3 shadow-md z-10 shrink-0">
        <button 
          onClick={() => navigate(-1)} 
          className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white active:scale-90 transition-transform"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center font-bold">
          <span className="text-white text-sm">
            {customer?.firstName?.charAt(0) || "?"}
          </span>
        </div>
        <div className="flex-1">
          <h1 className="text-sm font-bold text-white">Pedido #{orderId}</h1>
          <p className="text-xs text-white/80 flex items-center gap-1.5 font-medium">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            En línea
          </p>
        </div>
      </div>

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2" style={{background:"#ECE5DD"}}>
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
                    <p className="text-[11px] font-semibold text-[#2E7D32] ml-1 mb-0.5">
                      {msg.senderName || "Comercio"}
                    </p>
                  )}
                  <div className={`px-3 py-2 ${isMine(msg)
                    ? "bg-[#DCF8C6] rounded-tl-xl rounded-tr-sm rounded-bl-xl rounded-br-xl shadow-sm"
                    : "bg-white rounded-tl-sm rounded-tr-xl rounded-bl-xl rounded-br-xl shadow-sm"}`}
                  >
                    <p className="text-sm text-gray-800 leading-snug whitespace-pre-wrap break-words">{msg.message}</p>
                    <div className={`flex items-center gap-0.5 mt-0.5 ${isMine(msg) ? "justify-end" : "justify-start"}`}>
                      <span className="text-[10px] text-gray-400">
                        {new Date(msg.createdAt).toLocaleTimeString("es-ES", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {isMine(msg) && (
                        <span className="text-[10px] text-blue-500">
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
      <div className="bg-[#F0F0F0] px-3 py-2 border-t border-gray-200 flex gap-2 overflow-x-auto no-scrollbar">
        {quickMessages.map((qm) => (
          <button
            key={qm}
            onClick={() => handleSend(qm)}
            className="px-3 py-1.5 bg-white rounded-full text-xs text-gray-700 whitespace-nowrap hover:bg-gray-100 transition-colors shadow-sm"
          >
            {qm}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="bg-[#F0F0F0] px-3 pt-2 pb-safe flex items-center gap-2 border-t border-gray-200 shrink-0">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend(text)}
          placeholder="Escribe un mensaje..."
          className="flex-1 h-11 px-4 bg-white rounded-full text-sm focus:outline-none shadow-sm"
        />
        <button
          onClick={() => handleSend(text)}
          disabled={sendChat.isPending || !text.trim()}
          className="w-11 h-11 bg-[#075E54] rounded-full flex items-center justify-center text-white hover:bg-[#064E47] active:scale-90 disabled:opacity-40 transition-all flex-shrink-0 shadow-sm"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
