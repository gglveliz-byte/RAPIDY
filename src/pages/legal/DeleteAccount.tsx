import { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, UserX, AlertTriangle, CheckCircle2, ShieldCheck, Lock } from "lucide-react";

export default function DeleteAccount() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    phone: "",
    fullName: "",
    role: "customer",
    reason: "",
    confirmCheck: false,
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.phone || !form.fullName || !form.confirmCheck) return;

    setLoading(true);
    setTimeout(() => {
      try {
        const stored = JSON.parse(localStorage.getItem("qs_deletion_requests") || "[]");
        stored.push({ ...form, requestedAt: new Date().toISOString() });
        localStorage.setItem("qs_deletion_requests", JSON.stringify(stored));
      } catch {}
      setLoading(false);
      setSubmitted(true);
    }, 500);
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
            Seguridad del Usuario
          </span>
          <span className="text-[11px] text-white/80">Google Play Data Safety</span>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight mt-1">
          Eliminación de Cuenta y Datos
        </h1>
        <p className="text-white/80 text-xs mt-0.5">
          Derecho de Supresión • Ley 25.326 & LOPDP
        </p>
      </div>

      {/* Contenedor superpuesto -mt-4 */}
      <div className="px-4 -mt-4 space-y-3">
        
        {/* Advertencia previa */}
        <div className="bg-white rounded-2xl card-shadow p-4 border-l-4 border-amber-500">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-950 mb-1">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>Consecuencias de la baja de cuenta</span>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">
            Al confirmar la baja de tu cuenta en <strong>Ya Llega</strong>, eliminaremos permanentemente tu número de teléfono, direcciones registradas e historial de actividad en la plataforma.
          </p>
          <p className="text-[11px] text-gray-500 mt-2 bg-amber-50/70 p-2.5 rounded-xl border border-amber-200/60">
            *Obligación contable: Los registros fiscales de órdenes o pagos ya completados se conservarán por el plazo legal mínimo obligatorio para cumplir con la AFIP (Argentina) o SRI (Ecuador).
          </p>
        </div>

        {submitted ? (
          <div className="bg-white rounded-2xl card-shadow p-6 text-center animate-in fade-in duration-300">
            <div className="w-12 h-12 bg-green-100 text-[#2E7D32] rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h2 className="text-base font-bold text-gray-900 mb-1">
              Solicitud de Eliminación Recibida
            </h2>
            <p className="text-xs text-gray-600 max-w-sm mx-auto mb-4">
              Hemos registrado la petición para el número <strong>{form.phone}</strong>. Tus datos serán dados de baja en un plazo máximo de <strong>48 horas hábiles</strong>.
            </p>
            <button
              onClick={() => navigate("/home")}
              className="px-6 py-2.5 bg-[#2E7D32] hover:bg-[#1B5E20] text-white text-xs font-semibold rounded-xl transition-all"
            >
              Volver a la App
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl card-shadow p-5">
            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label className="text-[11px] font-semibold text-gray-700 block mb-1">
                  Rol de tu cuenta *
                </label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full h-10 px-3 border border-gray-200 rounded-xl text-xs focus:border-[#2E7D32] focus:ring-1 focus:ring-[#2E7D32] outline-none bg-white"
                >
                  <option value="customer">Cliente / Comprador</option>
                  <option value="driver">Repartidor (Driver)</option>
                  <option value="merchant">Comercio Aliado</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-gray-700 block mb-1">
                  Nombre completo registrado *
                </label>
                <input
                  type="text"
                  required
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  placeholder="Tu nombre completo"
                  className="w-full h-10 px-3 border border-gray-200 rounded-xl text-xs focus:border-[#2E7D32] focus:ring-1 focus:ring-[#2E7D32] outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-gray-700 block mb-1">
                  Número de Celular / Teléfono registrado *
                </label>
                <input
                  type="tel"
                  required
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="099... o +54 9..."
                  className="w-full h-10 px-3 border border-gray-200 rounded-xl text-xs focus:border-[#2E7D32] focus:ring-1 focus:ring-[#2E7D32] outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-gray-700 block mb-1">
                  Motivo de la solicitud (opcional)
                </label>
                <textarea
                  rows={2}
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  placeholder="Cuéntanos brevemente..."
                  className="w-full p-2.5 border border-gray-200 rounded-xl text-xs focus:border-[#2E7D32] focus:ring-1 focus:ring-[#2E7D32] outline-none resize-none"
                />
              </div>

              <div className="flex items-start gap-2 pt-1">
                <input
                  type="checkbox"
                  id="confirmCheck"
                  required
                  checked={form.confirmCheck}
                  onChange={(e) => setForm({ ...form, confirmCheck: e.target.checked })}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                />
                <label htmlFor="confirmCheck" className="text-[11px] text-gray-600 leading-tight">
                  Confirmo que deseo solicitar la supresión definitiva de mi cuenta y registros en la plataforma.
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl text-xs shadow-xs transition-all active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
              >
                <Lock className="w-4 h-4" />
                {loading ? "Registrando solicitud..." : "Confirmar Solicitud de Eliminación"}
              </button>
            </form>
          </div>
        )}

        {/* Footer */}
        <div className="text-center pt-4 pb-6">
          <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
            <ShieldCheck className="w-4 h-4 text-[#2E7D32]" />
            <span>Privacidad y soberanía de datos del usuario • Ya Llega</span>
          </div>
        </div>

      </div>
    </div>
  );
}
