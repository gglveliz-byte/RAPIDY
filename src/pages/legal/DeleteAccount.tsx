/**
 * @file DeleteAccount.tsx
 * @description Portal público de Eliminación de Cuenta y Supresión de Datos Personales (Rapidy Ecuador 🇪🇨).
 * Cumple con la Ley Orgánica de Protección de Datos Personales (LOPDP Arts. 15 y 16), las políticas de
 * seguridad de Google Play Store (Google Play Data Deletion Policy), y la conservación tributaria de 7 años
 * establecida por el Servicio de Rentas Internas (SRI).
 * Sistema de Diseño: Dark Velvet (#0E0E12), fondo #F7F7FA, acentos Flame Orange (#FF6A00) y botones rose-600.
 */

import { useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  Lock,
  Phone,
  User,
  HelpCircle,
  Copy,
  Check,
  Clock,
  FileSpreadsheet,
  Layers,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { trpcMutate } from "@/hooks/useDeliveryData";

interface DeletionRecord {
  ticketId: string;
  fullName: string;
  phone: string;
  role: string;
  reason: string;
  requestedAt: string;
  sla: string;
  status: "pendiente" | "en_proceso";
  legalBasis: string;
}

export default function DeleteAccount() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    role: "customer",
    reasonCategory: "privacy",
    reasonDetails: "",
    confirmCheck: false,
  });

  const [ticketResult, setTicketResult] = useState<DeletionRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [showFaq, setShowFaq] = useState<string | null>("sri");

  const isValidEcPhone = (phone: string) => {
    const cleaned = phone.replace(/[\s-]/g, "");
    return /^(?:(?:\+?593)|0)?9\d{8}$/.test(cleaned);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName.trim() || !form.phone.trim() || !form.confirmCheck) return;

    setLoading(true);
    setError("");
    try {
      const result = await trpcMutate<{
        success: boolean;
        ticketId?: string;
        sla?: string;
        requestedAt?: string;
      }>("customer.requestDeletion", {
        phone: form.phone.trim(),
        fullName: form.fullName.trim(),
        role: form.role,
        reason: `${form.reasonCategory}${
          form.reasonDetails ? `: ${form.reasonDetails.trim()}` : ""
        }`,
      });

      const newRecord: DeletionRecord = {
        ticketId:
          result?.ticketId ??
          `BAJA-EC-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`,
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        role: form.role,
        reason: `${form.reasonCategory}${
          form.reasonDetails ? `: ${form.reasonDetails.trim()}` : ""
        }`,
        requestedAt: result?.requestedAt ?? new Date().toISOString(),
        sla: result?.sla ?? "48 horas hábiles",
        status: "pendiente",
        legalBasis: "LOPDP Ecuador (Arts. 15 y 16) & Google Play Data Deletion Policy",
      };
      setTicketResult(newRecord);
    } catch (err: any) {
      setError(err?.message || "No pudimos registrar la solicitud. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyTicket = (ticket: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(ticket);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="mobile-container max-w-2xl mx-auto bg-surface min-h-screen pb-16 font-sans">
      {/* Cabecera Fija Dark Velvet */}
      <header className="sticky top-0 z-30 bg-ink border-b border-white/10 px-4 pt-4 pb-4 shadow-md">
        <div className="flex items-center justify-between mb-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="text-white/80 hover:text-white flex items-center gap-1.5 transition-colors touch-target"
            aria-label="Volver"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-xs font-semibold">Volver</span>
          </button>
          <div className="inline-flex items-center gap-1.5 bg-white/10 border border-white/15 px-2.5 py-1 rounded-full">
            <span className="w-2 h-2 rounded-full bg-brand animate-pulse" />
            <span className="text-[11px] font-bold text-white tracking-wide">
              LOPDP Ecuador 🇪🇨 & Google Play
            </span>
          </div>
        </div>
        <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
          <Trash2 className="w-5 h-5 text-brand" />
          Eliminación de Cuenta y Supresión de Datos
        </h1>
        <p className="text-white/70 text-xs mt-0.5">
          Derecho de Supresión • Ley Orgánica de Protección de Datos Personales del Ecuador
        </p>
      </header>

      {/* Contenido Principal */}
      <main className="px-4 pt-4 space-y-4">
        {/* Banner de Garantía Legal */}
        <section className="bg-white rounded-3xl p-4 border border-gray-200/80 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-950">Aviso Legal de Supresión Definitiva</h2>
              <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                Conforme al <strong>Art. 15 de la LOPDP</strong> y las normativas de{" "}
                <strong>Google Play Store</strong>, puedes tramitar el borrado irreversible de tu cuenta
                y datos personales en Rapidy.
              </p>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-2 text-[11px]">
            <div className="bg-surface p-2.5 rounded-2xl border border-gray-200/60">
              <span className="font-bold text-gray-900 block mb-0.5">⏱️ Tiempo de Respuesta</span>
              <span className="text-gray-600">Máximo <strong>48 horas hábiles</strong>.</span>
            </div>
            <div className="bg-surface p-2.5 rounded-2xl border border-gray-200/60">
              <span className="font-bold text-gray-900 block mb-0.5">🔒 Salvedad SRI</span>
              <span className="text-gray-600">Facturación fiscal por 7 años.</span>
            </div>
          </div>
        </section>

        {/* Estado: Éxito con Ticket o Formulario */}
        {ticketResult ? (
          <section className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-sm text-center">
            <div className="w-14 h-14 bg-rose-50 border border-rose-200 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-3 shadow-inner">
              <CheckCircle2 className="w-8 h-8 text-rose-600" />
            </div>
            <span className="inline-block bg-rose-100 text-rose-800 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full mb-2">
              Solicitud Registrada
            </span>
            <h2 className="text-lg font-bold text-gray-950">Trámite de Baja en Proceso</h2>
            <p className="text-xs text-gray-600 max-w-md mx-auto mt-1 leading-relaxed">
              Hemos registrado la petición para el número <strong>{ticketResult.phone}</strong>. Tus
              datos serán eliminados en un plazo máximo de <strong>48 horas hábiles</strong>.
            </p>

            {/* Código de Ticket */}
            <div className="mt-4 p-3.5 bg-ink rounded-2xl text-left border border-white/10">
              <div className="flex items-center justify-between text-[11px] text-white/60 mb-1">
                <span>Código de Trámite Oficial (Ecuador)</span>
                <span className="text-brand font-mono font-semibold">SLA: 48h</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-base font-bold text-white tracking-wider">
                  {ticketResult.ticketId}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyTicket(ticketResult.ticketId)}
                  className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-medium flex items-center gap-1 transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-brand" />
                      <span className="text-brand">Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-white/80" />
                      <span>Copiar</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Resumen */}
            <div className="mt-4 bg-surface rounded-2xl p-3 text-left border border-gray-200/60 space-y-1.5 text-xs">
              <div className="flex justify-between text-gray-700">
                <span className="text-gray-500">Titular:</span>
                <span className="font-semibold">{ticketResult.fullName}</span>
              </div>
              <div className="flex justify-between text-gray-700">
                <span className="text-gray-500">Rol:</span>
                <span className="capitalize font-medium">
                  {ticketResult.role === "customer"
                    ? "Cliente consumidor"
                    : ticketResult.role === "driver"
                    ? "Repartidor asociado"
                    : "Comercio aliado"}
                </span>
              </div>
              <div className="flex justify-between text-gray-700">
                <span className="text-gray-500">Fundamento:</span>
                <span className="font-semibold text-gray-900">LOPDP Ecuador & SRI</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate("/home")}
              className="mt-5 w-full h-11 bg-ink hover:bg-black text-white text-xs font-semibold rounded-2xl transition-all shadow-xs"
            >
              Volver a la App
            </button>
          </section>
        ) : (
          <section className="bg-white rounded-3xl p-5 border border-gray-200/80 shadow-xs">
            <div className="border-b border-gray-100 pb-3 mb-4">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Lock className="w-4 h-4 text-brand" />
                Formulario de Solicitud de Supresión
              </h3>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Datos vinculados a tu cuenta registrada en Rapidy Ecuador.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Rol */}
              <div>
                <label className="text-xs font-bold text-gray-800 block mb-1">
                  Rol de la cuenta *
                </label>
                <div className="relative">
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="w-full h-11 px-3.5 pr-8 bg-white border border-gray-200 rounded-2xl text-xs text-gray-900 focus:border-brand focus:ring-1 focus:ring-brand outline-none appearance-none cursor-pointer"
                  >
                    <option value="customer">Cliente Consumidor (Comprador)</option>
                    <option value="driver">Repartidor Asociado (Driver / Courier)</option>
                    <option value="merchant">Comercio Aliado (Restaurante o Tienda)</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-3.5 pointer-events-none" />
                </div>
              </div>

              {/* Nombre completo */}
              <div>
                <label className="text-xs font-bold text-gray-800 block mb-1">
                  Nombre y Apellidos completos *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={form.fullName}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                    placeholder="Ej. Carlos Patricio Mendoza Vera"
                    className="w-full h-11 pl-10 pr-3.5 border border-gray-200 rounded-2xl text-xs text-gray-900 focus:border-brand focus:ring-1 focus:ring-brand outline-none"
                  />
                  <User className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5" />
                </div>
              </div>

              {/* Teléfono ecuatoriano */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-gray-800 block">
                    Celular registrado en Ecuador *
                  </label>
                  <span className="text-[10px] text-gray-500 font-mono">
                    +593 o 09XXXXXXXX
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="tel"
                    required
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="0991234567 o +593991234567"
                    className="w-full h-11 pl-10 pr-3.5 border border-gray-200 rounded-2xl text-xs text-gray-900 focus:border-brand focus:ring-1 focus:ring-brand outline-none font-mono"
                  />
                  <Phone className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5" />
                </div>
                {form.phone && !isValidEcPhone(form.phone) && (
                  <p className="text-[11px] text-amber-600 mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    Ingresa un número celular válido de Ecuador (ej: 0991234567).
                  </p>
                )}
              </div>

              {/* Motivo de la baja */}
              <div>
                <label className="text-xs font-bold text-gray-800 block mb-1">
                  Motivo de la solicitud *
                </label>
                <div className="relative mb-2">
                  <select
                    value={form.reasonCategory}
                    onChange={(e) => setForm({ ...form, reasonCategory: e.target.value })}
                    className="w-full h-11 px-3.5 pr-8 bg-white border border-gray-200 rounded-2xl text-xs text-gray-900 focus:border-brand focus:ring-1 focus:ring-brand outline-none appearance-none cursor-pointer"
                  >
                    <option value="privacy">Privacidad y supresión de datos (LOPDP)</option>
                    <option value="inactive">Ya no utilizo la aplicación</option>
                    <option value="service">Experiencia con entregas o pedidos</option>
                    <option value="device">Cambio de número o dispositivo</option>
                    <option value="other">Otro motivo particular</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-3.5 pointer-events-none" />
                </div>
                <textarea
                  rows={2}
                  value={form.reasonDetails}
                  onChange={(e) => setForm({ ...form, reasonDetails: e.target.value })}
                  placeholder="Detalles adicionales (opcional)..."
                  className="w-full p-3 border border-gray-200 rounded-2xl text-xs text-gray-900 focus:border-brand focus:ring-1 focus:ring-brand outline-none resize-none"
                />
              </div>

              {/* Confirmación expresa */}
              <div className="p-3.5 bg-rose-50/70 rounded-2xl border border-rose-200/80">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    id="confirmCheck"
                    required
                    checked={form.confirmCheck}
                    onChange={(e) => setForm({ ...form, confirmCheck: e.target.checked })}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                  />
                  <span className="text-[11px] text-gray-800 leading-relaxed">
                    <strong>Confirmación Expresa e Irreversible:</strong> Declaro ser titular de la cuenta
                    y solicito la supresión definitiva de mi perfil, credenciales, domicilios e historial
                    en Rapidy Ecuador conforme al Art. 15 de la LOPDP, entendiendo que esta acción es irreversible.
                  </span>
                </label>
              </div>

              {/* Botón de Eliminación */}
              {error && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={loading || !form.confirmCheck}
                className="w-full h-12 bg-rose-600 hover:bg-rose-700 active:scale-[0.99] text-white font-bold rounded-2xl text-xs shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                {loading ? "Generando ticket legal..." : "Solicitar Eliminación Definitiva de Cuenta"}
              </button>
            </form>
          </section>
        )}

        {/* Políticas de Transparencia de Datos Google Play y SRI */}
        <section className="bg-white rounded-3xl p-4 border border-gray-200/80 shadow-xs space-y-2">
          <div className="flex items-center gap-2 mb-2 px-1">
            <HelpCircle className="w-4 h-4 text-brand" />
            <h3 className="text-xs font-bold text-gray-900">
              Política de Transparencia de Datos • Ecuador
            </h3>
          </div>

          {/* Item 1 */}
          <div className="border border-gray-200/70 rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowFaq(showFaq === "deleted" ? null : "deleted")}
              className="w-full p-3 bg-gray-50/80 hover:bg-gray-100/80 flex items-center justify-between text-left transition-colors"
            >
              <span className="text-xs font-semibold text-gray-800 flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-brand" />
                ¿Qué datos se eliminan de inmediato?
              </span>
              {showFaq === "deleted" ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
            </button>
            {showFaq === "deleted" && (
              <div className="p-3 bg-white text-xs text-gray-600 leading-relaxed border-t border-gray-100 space-y-1">
                <p>• <strong>Perfil y Acceso:</strong> Nombre, celular (+593), credenciales cifradas y token de sesión.</p>
                <p>• <strong>Ubicación:</strong> Coordenadas GPS guardadas, referencias de entrega y pines en mapa de Ecuador.</p>
                <p>• <strong>Actividad:</strong> Historial de pedidos en app, favoritos y registros de chat con soporte.</p>
              </div>
            )}
          </div>

          {/* Item 2 */}
          <div className="border border-gray-200/70 rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowFaq(showFaq === "sri" ? null : "sri")}
              className="w-full p-3 bg-gray-50/80 hover:bg-gray-100/80 flex items-center justify-between text-left transition-colors"
            >
              <span className="text-xs font-semibold text-gray-800 flex items-center gap-2">
                <FileSpreadsheet className="w-3.5 h-3.5 text-brand" />
                Salvedad Tributaria Obligatoria (SRI Ecuador - 7 Años)
              </span>
              {showFaq === "sri" ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
            </button>
            {showFaq === "sri" && (
              <div className="p-3 bg-white text-xs text-gray-600 leading-relaxed border-t border-gray-100">
                <p>
                  Conforme al <strong>Código Tributario del Ecuador</strong> y resoluciones del{" "}
                  <strong>Servicio de Rentas Internas (SRI)</strong>, las facturas electrónicas y
                  comprobantes de retención deben conservarse durante <strong>7 años</strong>.
                </p>
                <p className="mt-1.5 text-gray-500 bg-gray-50 p-2 rounded-xl text-[11px]">
                  * Estos registros se mantienen en estado bloqueado y disociado, sin uso operativo,
                  exclusivos para auditoría tributaria oficial.
                </p>
              </div>
            )}
          </div>

          {/* Item 3 */}
          <div className="border border-gray-200/70 rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowFaq(showFaq === "sla" ? null : "sla")}
              className="w-full p-3 bg-gray-50/80 hover:bg-gray-100/80 flex items-center justify-between text-left transition-colors"
            >
              <span className="text-xs font-semibold text-gray-800 flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-brand" />
                Plazos de Tramitación y Revocatoria (LOPDP)
              </span>
              {showFaq === "sla" ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
            </button>
            {showFaq === "sla" && (
              <div className="p-3 bg-white text-xs text-gray-600 leading-relaxed border-t border-gray-100">
                <p>
                  El trámite se ejecuta en un plazo máximo de <strong>48 horas hábiles</strong>.
                  Para cualquier consulta o desistimiento formal, puedes escribir a{" "}
                  <a href="mailto:privacidad@rapidy.ec" className="text-brand font-semibold underline">
                    privacidad@rapidy.ec
                  </a>{" "}
                  indicando tu número de ticket.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Footer Google Play Policy */}
        <footer className="text-center pt-2 pb-6">
          <div className="inline-flex items-center gap-2 text-xs text-gray-500 bg-white/80 border border-gray-200/80 px-3.5 py-1.5 rounded-full shadow-xs">
            <ShieldCheck className="w-4 h-4 text-brand" />
            <span>URL pública de eliminación conforme a Google Play Data Safety • Rapidy Ecuador</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
