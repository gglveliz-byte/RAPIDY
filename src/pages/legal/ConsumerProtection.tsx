import { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, ExternalLink, MessageSquare, CheckCircle2, Phone, Building2, ShieldCheck } from "lucide-react";

export default function ConsumerProtection() {
  const navigate = useNavigate();
  const [selectedCountry, setSelectedCountry] = useState<"ec" | "ar">("ec");
  const [form, setForm] = useState({ name: "", phone: "", orderId: "", details: "" });
  const [ticketId, setTicketId] = useState<string | null>(null);

  const handleClaimSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.phone || !form.details) return;

    const randomTicket = Math.floor(10000 + Math.random() * 90000);
    const generatedTicket = `REC-${selectedCountry.toUpperCase()}-${randomTicket}`;
    setTicketId(generatedTicket);

    try {
      const stored = JSON.parse(localStorage.getItem("qs_consumer_claims") || "[]");
      stored.push({
        ticket: generatedTicket,
        country: selectedCountry,
        ...form,
        date: new Date().toISOString(),
      });
      localStorage.setItem("qs_consumer_claims", JSON.stringify(stored));
    } catch {}
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
            Atención al Consumidor
          </span>
          <span className="text-[11px] text-white/80">Libro de Reclamos</span>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight mt-1">
          Defensa del Consumidor
        </h1>
        <p className="text-white/80 text-xs mt-0.5">
          Canales de mediación y reclamaciones • Ecuador y Argentina
        </p>
      </div>

      {/* Contenedor superpuesto -mt-4 */}
      <div className="px-4 -mt-4 space-y-3">
        
        {/* Selector de país */}
        <div className="bg-white rounded-2xl card-shadow p-1.5 grid grid-cols-2 gap-1.5">
          <button
            onClick={() => setSelectedCountry("ec")}
            className={`py-2 px-3 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              selectedCountry === "ec"
                ? "bg-[#2E7D32] text-white shadow-xs"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <span>🇪🇨</span> República del Ecuador
          </button>
          <button
            onClick={() => setSelectedCountry("ar")}
            className={`py-2 px-3 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              selectedCountry === "ar"
                ? "bg-[#2E7D32] text-white shadow-xs"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <span>🇦🇷</span> República Argentina
          </button>
        </div>

        {/* Organismos oficiales */}
        {selectedCountry === "ec" ? (
          <div className="bg-green-50/70 border border-green-200 rounded-2xl card-shadow p-4">
            <h2 className="text-xs font-bold text-green-950 flex items-center gap-1.5 mb-1">
              <Building2 className="w-4 h-4 text-[#2E7D32]" />
              Organismos Oficiales de Protección (Ecuador)
            </h2>
            <p className="text-xs text-green-900/90 leading-relaxed mb-3">
              En Ecuador tus derechos están amparados por la <strong>Ley Orgánica de Defensa del Consumidor (LODC)</strong>. Si no logras una resolución satisfactoria por nuestros canales, puedes acudir a:
            </p>
            <div className="space-y-1.5">
              <a
                href="https://www.dpe.gob.ec/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-green-200 text-xs font-semibold text-green-950 hover:bg-green-100/50 transition-colors"
              >
                <span>Defensoría del Pueblo del Ecuador (DPE)</span>
                <ExternalLink className="w-3.5 h-3.5 text-[#2E7D32]" />
              </a>
              <a
                href="https://www.produccion.gob.ec/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-green-200 text-xs font-semibold text-green-950 hover:bg-green-100/50 transition-colors"
              >
                <span>Ministerio de Producción y Comercio (MIPRO)</span>
                <ExternalLink className="w-3.5 h-3.5 text-[#2E7D32]" />
              </a>
            </div>
          </div>
        ) : (
          <div className="bg-blue-50/70 border border-blue-200 rounded-2xl card-shadow p-4">
            <h2 className="text-xs font-bold text-blue-950 flex items-center gap-1.5 mb-1">
              <Building2 className="w-4 h-4 text-blue-700" />
              Defensa del Consumidor (Argentina)
            </h2>
            <p className="text-xs text-blue-900/90 leading-relaxed mb-3">
              Conforme a la <strong>Ley N° 24.240</strong>, puedes iniciar un reclamo formal ante la autoridad nacional en caso de controversias no resueltas:
            </p>
            <div className="space-y-1.5">
              <a
                href="https://www.argentina.gob.ar/produccion/defensadelconsumidor/formulario"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-blue-200 text-xs font-semibold text-blue-950 hover:bg-blue-100/50 transition-colors"
              >
                <span>Ventanilla Única Federal de Reclamos</span>
                <ExternalLink className="w-3.5 h-3.5 text-blue-700" />
              </a>
              <div className="flex items-center gap-2 p-2.5 bg-white rounded-xl border border-blue-200 text-xs text-blue-900">
                <Phone className="w-3.5 h-3.5 text-blue-700 flex-shrink-0" />
                <span>Línea Gratuita Nacional: <strong>0800-666-1518</strong></span>
              </div>
            </div>
          </div>
        )}

        {/* Libro de reclamos interno */}
        <div className="bg-white rounded-2xl card-shadow p-5">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare className="w-4 h-4 text-[#2E7D32]" />
            <h2 className="text-sm font-bold text-gray-900">
              Libro de Reclamos Digital Ya Llega
            </h2>
          </div>
          <p className="text-xs text-gray-500 mb-4 leading-relaxed">
            Ingresa tu reclamo para recibir asistencia inmediata de nuestro equipo de operaciones con compromiso de respuesta en 24 horas.
          </p>

          {ticketId ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
              <CheckCircle2 className="w-8 h-8 text-[#2E7D32] mx-auto mb-1.5" />
              <h3 className="text-xs font-bold text-green-950">Reclamo Recibido con Éxito</h3>
              <p className="text-[11px] text-green-800 mt-0.5">Tu código de seguimiento:</p>
              <div className="font-mono text-sm font-bold text-gray-900 bg-white border border-green-300 rounded-lg py-1.5 px-3 max-w-xs mx-auto my-2 shadow-xs">
                {ticketId}
              </div>
              <p className="text-[11px] text-gray-600">
                Te contactaremos a tu número ({form.phone}) a la brevedad.
              </p>
              <button
                onClick={() => {
                  setTicketId(null);
                  setForm({ name: "", phone: "", orderId: "", details: "" });
                }}
                className="mt-3 text-xs font-semibold text-[#2E7D32] underline"
              >
                Nuevo reporte
              </button>
            </div>
          ) : (
            <form onSubmit={handleClaimSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-semibold text-gray-700 block mb-1">Tu Nombre *</label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Nombre completo"
                    className="w-full h-10 px-3 border border-gray-200 rounded-xl text-xs focus:border-[#2E7D32] focus:ring-1 focus:ring-[#2E7D32] outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-gray-700 block mb-1">Teléfono / Celular *</label>
                  <input
                    type="tel"
                    required
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="099... o +54..."
                    className="w-full h-10 px-3 border border-gray-200 rounded-xl text-xs focus:border-[#2E7D32] focus:ring-1 focus:ring-[#2E7D32] outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-gray-700 block mb-1">N° de Pedido o Comercio (opcional)</label>
                <input
                  type="text"
                  value={form.orderId}
                  onChange={(e) => setForm({ ...form, orderId: e.target.value })}
                  placeholder="Ej. #128 o Nombre del restaurante"
                  className="w-full h-10 px-3 border border-gray-200 rounded-xl text-xs focus:border-[#2E7D32] focus:ring-1 focus:ring-[#2E7D32] outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-gray-700 block mb-1">Detalle del reclamo *</label>
                <textarea
                  rows={3}
                  required
                  value={form.details}
                  onChange={(e) => setForm({ ...form, details: e.target.value })}
                  placeholder="Describe lo sucedido con el pedido o servicio..."
                  className="w-full p-2.5 border border-gray-200 rounded-xl text-xs focus:border-[#2E7D32] focus:ring-1 focus:ring-[#2E7D32] outline-none resize-none"
                />
              </div>

              <button
                type="submit"
                className="w-full h-11 bg-[#2E7D32] hover:bg-[#1B5E20] text-white font-semibold rounded-xl text-xs shadow-xs transition-all active:scale-[0.99]"
              >
                Enviar Reclamo Formal
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="text-center pt-4 pb-6">
          <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
            <ShieldCheck className="w-4 h-4 text-[#2E7D32]" />
            <span>Atención al usuario y resolución transparente • Ya Llega</span>
          </div>
        </div>

      </div>
    </div>
  );
}
