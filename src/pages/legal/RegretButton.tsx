import { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Undo2, ShieldAlert, CheckCircle2, Copy, Check, ShieldCheck } from "lucide-react";

export default function RegretButton() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    orderId: "",
    reason: "",
  });
  const [submittedCode, setSubmittedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName || !form.phone || !form.orderId) return;

    setLoading(true);
    setTimeout(() => {
      const randomSuffix = Math.floor(100000 + Math.random() * 900000);
      const code = `ARR-AR-${new Date().getFullYear()}-${randomSuffix}`;
      setSubmittedCode(code);
      setLoading(false);
      try {
        const stored = JSON.parse(localStorage.getItem("qs_regret_requests") || "[]");
        stored.push({ code, ...form, timestamp: new Date().toISOString() });
        localStorage.setItem("qs_regret_requests", JSON.stringify(stored));
      } catch {}
    }, 500);
  };

  const copyCode = () => {
    if (!submittedCode) return;
    navigator.clipboard.writeText(submittedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mobile-container max-w-2xl mx-auto bg-gray-50 min-h-screen pb-12">
      {/* Header oficial estilo Ya Llega */}
      <div className="bg-[#2E7D32] px-4 pt-4 pb-8">
        <button
          onClick={() => navigate(-1)}
          className="text-white/90 hover:text-white mb-3 touch-target flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft className="w-6 h-6" />
          <span className="text-sm font-medium">Volver</span>
        </button>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider bg-white/20 text-white px-2.5 py-0.5 rounded-full">
            🇦🇷 Normativa Argentina
          </span>
          <span className="text-[11px] text-white/80">Res. 424/2020 SCI</span>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight mt-1">
          Botón de Arrepentimiento
        </h1>
        <p className="text-white/80 text-xs mt-0.5">
          Revocación de compra conforme a la Ley N° 24.240
        </p>
      </div>

      {/* Contenedor superpuesto -mt-4 */}
      <div className="px-4 -mt-4 space-y-3">
        
        {/* Cuadro legal */}
        <div className="bg-white rounded-2xl card-shadow p-4 border-l-4 border-blue-600">
          <div className="flex items-center gap-2 text-xs font-bold text-blue-950 mb-1">
            <ShieldAlert className="w-4 h-4 text-blue-600" />
            <span>Derecho de Revocación Legal (Art. 34 Ley 24.240)</span>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">
            Puedes revocar tu solicitud de servicio ingresando tus datos abajo. Se te otorgará de inmediato un <strong>código de identificación de trámite</strong> oficial.
          </p>
          <p className="text-[11px] text-gray-500 mt-2 bg-blue-50/70 p-2.5 rounded-xl border border-blue-100">
            *Excepción alimentos: Conforme al Art. 1116 inc. b del Código Civil y Comercial, la revocación no aplica en alimentos perecederos cuya preparación culinaria ya fue iniciada en cocina por el comercio gastronómico.
          </p>
        </div>

        {submittedCode ? (
          <div className="bg-white rounded-2xl card-shadow p-6 text-center animate-in fade-in duration-300">
            <div className="w-12 h-12 bg-green-100 text-[#2E7D32] rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h2 className="text-base font-bold text-gray-900 mb-1">
              Solicitud de Revocación Emitida
            </h2>
            <p className="text-xs text-gray-600 mb-4">
              Hemos generado tu código oficial de revocación conforme al Artículo 3° de la Resolución 424/2020:
            </p>

            <div className="bg-gray-50 border-2 border-dashed border-[#2E7D32]/40 rounded-xl p-3.5 flex items-center justify-between mb-4">
              <div className="text-left">
                <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">Código de Trámite</span>
                <span className="text-sm sm:text-base font-mono font-bold text-gray-900">{submittedCode}</span>
              </div>
              <button
                onClick={copyCode}
                className="p-2 rounded-lg bg-white border border-gray-200 text-[#2E7D32] hover:bg-green-50 transition-colors"
                title="Copiar código"
              >
                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            <div className="text-left text-xs text-gray-600 space-y-1 bg-gray-50 p-3 rounded-xl border border-gray-100 mb-4">
              <p><strong>Titular:</strong> {form.fullName}</p>
              <p><strong>Teléfono:</strong> {form.phone}</p>
              <p><strong>Pedido ID:</strong> #{form.orderId}</p>
              <p><strong>Fecha y hora:</strong> {new Date().toLocaleString("es-AR")}</p>
            </div>

            <p className="text-[11px] text-gray-500 mb-4">
              Nos comunicaremos en un plazo máximo de 24 horas hábiles a tu número para verificar el estado de la orden y coordinar el reintegro.
            </p>

            <button
              onClick={() => {
                setSubmittedCode(null);
                setForm({ fullName: "", phone: "", orderId: "", reason: "" });
              }}
              className="text-xs text-[#2E7D32] font-semibold underline"
            >
              Ingresar otra solicitud
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl card-shadow p-5">
            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">
                  Nombre y Apellido completo *
                </label>
                <input
                  type="text"
                  required
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  placeholder="Tu nombre completo"
                  className="w-full h-11 px-3 border border-gray-200 rounded-xl text-xs sm:text-sm focus:border-[#2E7D32] focus:ring-1 focus:ring-[#2E7D32] outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">
                    Teléfono / WhatsApp *
                  </label>
                  <input
                    type="tel"
                    required
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+54 9 11..."
                    className="w-full h-11 px-3 border border-gray-200 rounded-xl text-xs sm:text-sm focus:border-[#2E7D32] focus:ring-1 focus:ring-[#2E7D32] outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">
                    Número de Pedido *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.orderId}
                    onChange={(e) => setForm({ ...form, orderId: e.target.value })}
                    placeholder="Ej. 128"
                    className="w-full h-11 px-3 border border-gray-200 rounded-xl text-xs sm:text-sm focus:border-[#2E7D32] focus:ring-1 focus:ring-[#2E7D32] outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">
                  Motivo de la revocación (opcional)
                </label>
                <textarea
                  rows={2}
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  placeholder="Explica brevemente la razón..."
                  className="w-full p-3 border border-gray-200 rounded-xl text-xs sm:text-sm focus:border-[#2E7D32] focus:ring-1 focus:ring-[#2E7D32] outline-none resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 bg-[#2E7D32] hover:bg-[#1B5E20] text-white font-semibold rounded-xl text-xs sm:text-sm shadow-xs transition-all active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Undo2 className="w-4 h-4" />
                {loading ? "Generando constancia..." : "Enviar Solicitud de Arrepentimiento"}
              </button>
            </form>
          </div>
        )}

        {/* Footer */}
        <div className="text-center pt-4 pb-6">
          <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
            <ShieldCheck className="w-4 h-4 text-[#2E7D32]" />
            <span>Resolución 424/2020 • Cumplimiento Ley 24.240</span>
          </div>
        </div>

      </div>
    </div>
  );
}
