/**
 * @archivo src/pages/legal/ConsumerProtection.tsx
 * @modulo Legal & Defensa del Consumidor
 * @proposito
 *   Portal oficial y Libro Digital de Reclamos y Mediación de Rapidy en la República del Ecuador.
 *   Provee información transparente sobre los derechos del consumidor bajo la Ley Orgánica
 *   de Defensa del Consumidor (LODC), canales directos a organismos estatales (Defensoría del
 *   Pueblo del Ecuador - DPE y Ministerio de Producción, Comercio Exterior, Inversiones y Pesca - MPCEIP),
 *   y un sistema de registro de incidencias con generación de ticket formal ecuatoriano.
 *
 * @resumen_contenido
 *   - Cabecera fija Dark Velvet (#0E0E12) con borde border-white/10, botón volver y badge ecuatoriano.
 *   - Módulo informativo de derechos y marco legal ecuatoriano (LODC, DPE, MPCEIP, 1800-DEFENSA).
 *   - Libro Digital de Reclamos y Mediación con validaciones para Cédula/RUC y móvil ecuatoriano (+593).
 *   - Generación de ticket formal ecuatoriano (`REC-EC-${año}-${random}`) y almacenamiento en `rapidy_consumer_claims`.
 *   - Compromiso de resolución en un máximo de 5 días hábiles conforme al estándar de mediación.
 *   - Estética oficial Rapidy: Flame Orange (#FF6A00), tarjetas rounded-3xl / rounded-2xl y fondo #F7F7FA.
 *
 * @dependencias_externas
 *   - react (useState), react-router (useNavigate)
 *   - lucide-react (ArrowLeft, ExternalLink, MessageSquare, CheckCircle2, Phone, Building2, ShieldCheck, Scale, Clock, Send, AlertCircle, FileText)
 */

import { useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  ExternalLink,
  MessageSquare,
  CheckCircle2,
  Phone,
  Building2,
  ShieldCheck,
  Scale,
  Clock,
  Send,
  AlertCircle,
  FileText,
} from "lucide-react";

interface ClaimFormState {
  name: string;
  idNumber: string;
  phone: string;
  email: string;
  orderId: string;
  incidentType: string;
  details: string;
}

interface StoredClaim extends ClaimFormState {
  ticket: string;
  country: "ec";
  date: string;
  status: "en_revision";
}

const INCIDENT_OPTIONS = [
  "Alimentos en mal estado o vencidos",
  "Demora extrema en la entrega",
  "Cobro no reconocido o diferencia de precio",
  "Faltante de productos en el pedido",
  "Pedido entregado a otra persona o extraviado",
  "Inconveniente de trato o seguridad con repartidor",
  "Otro motivo / Solicitud formal de mediación",
];

const LODC_RIGHTS = [
  { title: "Información Veraz y Clara", desc: "Precios finales en USD con desglose íntegro de tarifas e impuestos." },
  { title: "Calidad e Inocuidad", desc: "Alimentos preparados y productos en condiciones óptimas de empaque e higiene." },
  { title: "Reparación o Devolución", desc: "Reembolso o crédito inmediato ante cancelaciones imputables al comercio o app." },
  { title: "Trato Equitativo y Digno", desc: "No discriminación y mediación transparente, oportuna e imparcial." },
];

export default function ConsumerProtection() {
  const navigate = useNavigate();

  const [form, setForm] = useState<ClaimFormState>({
    name: "",
    idNumber: "",
    phone: "",
    email: "",
    orderId: "",
    incidentType: INCIDENT_OPTIONS[0],
    details: "",
  });

  const [ticketId, setTicketId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClaimSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanId = form.idNumber.trim();
    if (cleanId.length !== 10 && cleanId.length !== 13) {
      setErrorMessage("La cédula de identidad debe tener 10 dígitos o el RUC 13 dígitos.");
      return;
    }

    const cleanPhone = form.phone.trim().replace(/\s+/g, "");
    if (cleanPhone.length < 9) {
      setErrorMessage("Ingresa un número celular ecuatoriano válido (+593 o 09...).");
      return;
    }

    if (!form.details.trim() || form.details.trim().length < 15) {
      setErrorMessage("Por favor describe lo sucedido con mayor detalle (al menos 15 caracteres).");
      return;
    }

    setIsSubmitting(true);
    try {
      const year = new Date().getFullYear();
      const randomTicketNum = Math.floor(10000 + Math.random() * 90000);
      const generatedTicket = `REC-EC-${year}-${randomTicketNum}`;

      const stored: StoredClaim[] = JSON.parse(localStorage.getItem("rapidy_consumer_claims") || "[]");
      const newClaim: StoredClaim = {
        ticket: generatedTicket,
        country: "ec",
        ...form,
        date: new Date().toISOString(),
        status: "en_revision",
      };

      stored.push(newClaim);
      localStorage.setItem("rapidy_consumer_claims", JSON.stringify(stored));
      setTicketId(generatedTicket);
    } catch {
      setErrorMessage("Ocurrió un error al registrar el reclamo. Intenta nuevamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetForm = () => {
    setTicketId(null);
    setErrorMessage(null);
    setForm({ name: "", idNumber: "", phone: "", email: "", orderId: "", incidentType: INCIDENT_OPTIONS[0], details: "" });
  };

  return (
    <div className="min-h-screen bg-[#F7F7FA] text-gray-900 pb-16">
      {/* Cabecera Fija Dark Velvet Oficial */}
      <header className="sticky top-0 z-30 bg-[#0E0E12] border-b border-white/10 px-4 py-3 shadow-md">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            aria-label="Volver"
            className="flex items-center gap-1.5 text-white/90 hover:text-white transition-colors py-1 px-2 -ml-2 rounded-xl hover:bg-white/5 active:scale-95"
          >
            <ArrowLeft className="w-5 h-5 text-[#FF6A00]" />
            <span className="text-xs font-semibold">Volver</span>
          </button>
          <div className="flex items-center gap-1.5 bg-[#FF6A00]/15 border border-[#FF6A00]/30 px-3 py-1 rounded-full">
            <span className="text-sm">🇪🇨</span>
            <span className="text-[11px] font-bold text-[#FF6A00] tracking-wide uppercase">
              Protección al Consumidor 🇪🇨
            </span>
          </div>
        </div>
      </header>

      {/* Hero Banner Dark Velvet con acentos Flame Orange */}
      <div className="bg-[#0E0E12] text-white px-4 pt-6 pb-10 border-b border-white/10">
        <div className="max-w-2xl mx-auto space-y-2">
          <div className="inline-flex items-center gap-1.5 bg-white/10 backdrop-blur-xs px-2.5 py-1 rounded-lg text-[11px] text-white/90 font-medium">
            <Scale className="w-3.5 h-3.5 text-[#FF6A00]" />
            <span>República del Ecuador • LODC</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Defensa del Consumidor
          </h1>
          <p className="text-xs sm:text-sm text-gray-300 leading-relaxed max-w-xl">
            Tus derechos en Rapidy están amparados por la legislación ecuatoriana. Disponemos de canal directo de mediación y acceso a entidades reguladoras nacionales.
          </p>
        </div>
      </div>

      {/* Contenedor Principal Superpuesto */}
      <main className="max-w-2xl mx-auto px-4 -mt-5 space-y-5">
        {/* Tarjeta 1: Marco Legal Ecuatoriano (LODC) */}
        <section className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-gray-100 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#FF6A00]/10 border border-[#FF6A00]/25 flex items-center justify-center shrink-0">
              <Scale className="w-5 h-5 text-[#FF6A00]" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-gray-900">
                Ley Orgánica de Defensa del Consumidor (LODC)
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Marco regulatorio nacional aplicable a todas las transacciones en Rapidy Ecuador
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">
            Conforme a la <strong>Ley Orgánica de Defensa del Consumidor (LODC)</strong> y la Constitución del Ecuador, todo usuario de nuestra app goza de derechos fundamentales:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            {LODC_RIGHTS.map((r) => (
              <div key={r.title} className="p-3 rounded-2xl bg-[#F7F7FA] border border-gray-100 flex items-start gap-2.5">
                <div className="w-2 h-2 rounded-full bg-[#FF6A00] mt-1.5 shrink-0" />
                <div className="text-[11px] text-gray-700 leading-normal">
                  <strong className="text-gray-900 block font-semibold">{r.title}</strong>
                  {r.desc}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Tarjeta 2: Organismos Oficiales de Protección del Estado Ecuatoriano */}
        <section className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-gray-100 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#0E0E12] text-[#FF6A00] flex items-center justify-center shrink-0 border border-white/10">
              <Building2 className="w-5 h-5 text-[#FF6A00]" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-gray-900">
                Organismos Oficiales del Estado Ecuatoriano
              </h2>
              <p className="text-xs text-gray-500">
                Instancias públicas de supervisión, tutela constitucional y mediación estatal
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">
            Si tras presentar tu reclamo no obtienes una solución satisfactoria, puedes acudir a las autoridades competentes del Ecuador:
          </p>

          <div className="space-y-3 pt-1">
            {/* Defensoría del Pueblo del Ecuador (DPE) */}
            <div className="p-4 rounded-2xl border border-gray-200/80 bg-gradient-to-br from-white to-[#F7F7FA] space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-900">Defensoría del Pueblo del Ecuador (DPE)</span>
                    <span className="text-[10px] font-semibold bg-[#FF6A00]/15 text-[#FF6A00] px-2 py-0.5 rounded-full">
                      Tutela Constitucional
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-600 mt-1">
                    Institución Nacional de Derechos Humanos encargada de tutelar los derechos de consumidores en todo el país.
                  </p>
                </div>
                <a
                  href="https://www.dpe.gob.ec"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-white hover:bg-gray-50 text-gray-800 text-xs font-semibold rounded-xl border border-gray-300 shadow-2xs transition-all shrink-0 hover:border-[#FF6A00] hover:text-[#FF6A00]"
                >
                  <span>Portal Oficial DPE</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-gray-200 text-xs">
                <div className="flex items-center gap-2 text-gray-700">
                  <Phone className="w-4 h-4 text-[#FF6A00] shrink-0" />
                  <span className="text-[11px] sm:text-xs">
                    Línea Nacional Gratuita de Asesoría: <strong>1800-DEFENSA (1800 333 367)</strong>
                  </span>
                </div>
                <a href="tel:1800333367" className="text-[11px] font-bold text-[#FF6A00] hover:underline shrink-0 ml-2">
                  Llamar
                </a>
              </div>
            </div>

            {/* MPCEIP */}
            <div className="p-4 rounded-2xl border border-gray-200/80 bg-gradient-to-br from-white to-[#F7F7FA] space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-bold text-gray-900 block">
                    Ministerio de Producción, Comercio Exterior, Inversiones y Pesca (MPCEIP)
                  </span>
                  <p className="text-[11px] text-gray-600 mt-1">
                    Órgano rector del control comercial, metrología y cumplimiento de estándares de calidad en bienes y servicios.
                  </p>
                </div>
                <a
                  href="https://www.produccion.gob.ec/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-white hover:bg-gray-50 text-gray-800 text-xs font-semibold rounded-xl border border-gray-300 shadow-2xs transition-all shrink-0 hover:border-[#FF6A00] hover:text-[#FF6A00]"
                >
                  <span>Portal MPCEIP</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Tarjeta 3: Libro Digital de Reclamos y Mediación Rapidy Ecuador */}
        <section className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-gray-100 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#FF6A00]/15 border border-[#FF6A00]/30 flex items-center justify-center shrink-0">
                <MessageSquare className="w-5 h-5 text-[#FF6A00]" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-gray-900">Libro Digital de Reclamos y Mediación</h2>
                <p className="text-xs text-gray-500">Formulario oficial de mediación directa con Rapidy Ecuador</p>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-1 text-[11px] text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full font-medium">
              <Clock className="w-3.5 h-3.5 text-[#FF6A00]" />
              <span>Respuesta máx. 5 días hábiles</span>
            </div>
          </div>

          <div className="sm:hidden flex items-center gap-1.5 p-2 rounded-xl bg-orange-50 border border-orange-100 text-[11px] text-[#FF6A00] font-medium">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>Compromiso de resolución en un máximo de 5 días hábiles.</span>
          </div>

          {ticketId ? (
            <div className="p-6 rounded-2xl bg-orange-50/60 border border-orange-200/80 text-center space-y-3">
              <div className="w-12 h-12 bg-[#FF6A00] text-white rounded-full flex items-center justify-center mx-auto shadow-md shadow-[#FF6A00]/25">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">¡Reclamo Registrado con Éxito!</h3>
                <p className="text-xs text-gray-600 mt-1 max-w-md mx-auto">
                  Tu reclamo ha sido incorporado formalmente en nuestro Libro Digital bajo el marco de la LODC.
                </p>
              </div>
              <div className="my-3 p-3 bg-white rounded-xl border border-orange-200 max-w-sm mx-auto shadow-2xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block">
                  Código Único de Ticket Ecuatoriano
                </span>
                <span className="font-mono text-base font-extrabold text-[#FF6A00] tracking-wider block mt-0.5">
                  {ticketId}
                </span>
              </div>
              <div className="text-[11px] text-gray-600 space-y-1 max-w-md mx-auto">
                <p><strong>Contacto:</strong> {form.phone} {form.email ? `• ${form.email}` : ""}</p>
                <p><strong>Compromiso:</strong> Recibirás resolución en un plazo máximo de <strong>5 días hábiles</strong>.</p>
              </div>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleResetForm}
                  className="px-5 py-2.5 bg-[#0E0E12] hover:bg-black text-white text-xs font-semibold rounded-xl shadow-xs transition-all active:scale-95"
                >
                  Registrar otro reporte
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleClaimSubmit} className="space-y-4 pt-1">
              {errorMessage && (
                <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">Nombres y Apellidos *</label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Ej. Juan Pérez Morejón"
                    className="w-full h-11 px-3.5 bg-[#F7F7FA] border border-gray-200 rounded-xl text-xs text-gray-900 focus:bg-white focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/20 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">Cédula (10 dígitos) o RUC *</label>
                  <input
                    type="text"
                    required
                    maxLength={13}
                    value={form.idNumber}
                    onChange={(e) => setForm({ ...form, idNumber: e.target.value.replace(/\D/g, "") })}
                    placeholder="Ej. 1712345678 o RUC"
                    className="w-full h-11 px-3.5 bg-[#F7F7FA] border border-gray-200 rounded-xl text-xs text-gray-900 focus:bg-white focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/20 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">Teléfono Celular (+593) *</label>
                  <input
                    type="tel"
                    required
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="Ej. 0991234567 o +593 99..."
                    className="w-full h-11 px-3.5 bg-[#F7F7FA] border border-gray-200 rounded-xl text-xs text-gray-900 focus:bg-white focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/20 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">Correo Electrónico (opcional)</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="correo@ejemplo.com"
                    className="w-full h-11 px-3.5 bg-[#F7F7FA] border border-gray-200 rounded-xl text-xs text-gray-900 focus:bg-white focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/20 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">N° de Pedido o Comercio</label>
                  <input
                    type="text"
                    value={form.orderId}
                    onChange={(e) => setForm({ ...form, orderId: e.target.value })}
                    placeholder="Ej. #RP-1048 o Local"
                    className="w-full h-11 px-3.5 bg-[#F7F7FA] border border-gray-200 rounded-xl text-xs text-gray-900 focus:bg-white focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/20 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">Tipo de Incidencia *</label>
                  <select
                    value={form.incidentType}
                    onChange={(e) => setForm({ ...form, incidentType: e.target.value })}
                    className="w-full h-11 px-3 bg-[#F7F7FA] border border-gray-200 rounded-xl text-xs text-gray-900 focus:bg-white focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/20 outline-none transition-all"
                  >
                    {INCIDENT_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Descripción Detallada de los Hechos *</label>
                <textarea
                  rows={4}
                  required
                  value={form.details}
                  onChange={(e) => setForm({ ...form, details: e.target.value })}
                  placeholder="Explica detalladamente lo sucedido con el pedido, comercio o repartidor..."
                  className="w-full p-3.5 bg-[#F7F7FA] border border-gray-200 rounded-xl text-xs text-gray-900 focus:bg-white focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/20 outline-none transition-all resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-12 bg-[#FF6A00] hover:bg-[#e65f00] text-white text-xs sm:text-sm font-bold rounded-2xl shadow-md shadow-[#FF6A00]/25 transition-all flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>{isSubmitting ? "Registrando Reclamo..." : "Enviar Reclamo al Libro Digital"}</span>
              </button>

              <div className="flex items-center justify-center gap-2 pt-1 text-gray-500 text-[11px]">
                <FileText className="w-3.5 h-3.5 text-[#FF6A00]" />
                <span>Emisión inmediata de comprobante REC-EC conforme a la normativa ecuatoriana</span>
              </div>
            </form>
          )}
        </section>

        {/* Tarjeta 4: Compromiso de Rapidy Ecuador */}
        <section className="bg-gradient-to-r from-[#0E0E12] to-[#1B1B22] text-white rounded-3xl p-5 shadow-sm border border-white/10 flex flex-col sm:flex-row items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#FF6A00]/15 border border-[#FF6A00]/30 flex items-center justify-center shrink-0 text-[#FF6A00]">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div className="text-center sm:text-left space-y-1">
            <h3 className="text-xs sm:text-sm font-bold text-white">Garantía de Transparencia y Atención Directa</h3>
            <p className="text-[11px] sm:text-xs text-gray-300 leading-relaxed">
              En Rapidy creemos en la mediación ágil. Todos los reclamos recibidos en el Libro Digital son auditados por nuestro equipo legal en Ecuador para asegurar una solución justa y oportuna.
            </p>
          </div>
        </section>

        {/* Footer institucional */}
        <footer className="text-center pt-2 pb-6 space-y-1">
          <p className="text-[11px] text-gray-400">
            Rapidy Ecuador • Operaciones bajo legislación de comercio electrónico y LODC de la República del Ecuador
          </p>
          <p className="text-[10px] text-gray-400">
            Canal de atención al consumidor amparado por los artículos 4 y 9 de la LODC
          </p>
        </footer>
      </main>
    </div>
  );
}
