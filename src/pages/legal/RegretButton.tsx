/**
 * @archivo src/pages/legal/RegretButton.tsx
 * @modulo Legal / Devolución y Desistimiento Ecuador (LODC Art. 45)
 * @proposito
 *   Implementa el canal oficial y digital para el ejercicio del Derecho a la
 *   Devolución y Desistimiento en Ventas Electrónicas y Comercio por Internet,
 *   conforme al Artículo 45 de la Ley Orgánica de Defensa del Consumidor (LODC)
 *   de la República del Ecuador.
 *
 * @resumen_contenido
 *   - Formulario de solicitud ecuatoriano (Cédula de 10 dígitos o RUC de 13 dígitos, teléfono +593, pedido, motivo).
 *   - Generación instantánea de código oficial de radicación `DEV-EC-${año}-${número_aleatorio}` con copiado al portapapeles.
 *   - Almacenamiento local persistente bajo la clave `rapidy_devolution_requests`.
 *   - Información pedagógica sobre el alcance legal y excepción técnica en alimentos preparados perecibles.
 *   - Sistema de diseño oficial Rapidy: cabecera Dark Velvet `#0E0E12`, fondo luminoso `#F7F7FA`, acentos Flame Orange `#FF6A00`.
 *
 * @dependencias_internas
 *   - `useNavigate` (react-router)
 *   - Iconos de `lucide-react`
 */

import { useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  Undo2,
  ShieldAlert,
  CheckCircle2,
  Copy,
  Check,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  FileText
} from "lucide-react";

interface DevolutionFormData {
  fullName: string;
  idNumber: string;
  phone: string;
  orderId: string;
  reason: string;
  details: string;
}

export default function RegretButton() {
  const navigate = useNavigate();

  const [form, setForm] = useState<DevolutionFormData>({
    fullName: "",
    idNumber: "",
    phone: "",
    orderId: "",
    reason: "",
    details: "",
  });

  const [error, setError] = useState<string | null>(null);
  const [submittedCode, setSubmittedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const reasonsList = [
    "El pedido aún no entra en cocción / preparación y solicito desistir",
    "Demora excesiva y no justificada en la aceptación o confirmación",
    "Pedido duplicado por error involuntario del usuario",
    "Problema comprobado de calidad, higiene, inocuidad o entrega en mal estado",
    "Error evidente en los ítems seleccionados antes de la cocción",
    "Otro motivo amparado en el Art. 45 de la LODC",
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validaciones básicas de campos obligatorios
    if (
      !form.fullName.trim() ||
      !form.idNumber.trim() ||
      !form.phone.trim() ||
      !form.orderId.trim() ||
      !form.reason
    ) {
      setError("Por favor completa todos los campos requeridos con asterisco (*).");
      return;
    }

    // Validación de Cédula (10 dígitos) o RUC (13 dígitos) ecuatoriano
    const cleanId = form.idNumber.replace(/\D/g, "");
    if (cleanId.length !== 10 && cleanId.length !== 13) {
      setError(
        "Ingresa una Cédula ecuatoriana válida de 10 dígitos o un RUC comercial de 13 dígitos numéricos."
      );
      return;
    }

    // Validación de teléfono celular en Ecuador
    const cleanPhone = form.phone.replace(/[\s()-]/g, "");
    if (cleanPhone.length < 9) {
      setError("Ingresa un número celular ecuatoriano válido (+593 o 09XXXXXXXX).");
      return;
    }

    setLoading(true);

    setTimeout(() => {
      const currentYear = new Date().getFullYear();
      const randomSuffix = Math.floor(100000 + Math.random() * 900000);
      const code = `DEV-EC-${currentYear}-${randomSuffix}`;

      setSubmittedCode(code);
      setLoading(false);

      try {
        const stored = JSON.parse(
          localStorage.getItem("rapidy_devolution_requests") || "[]"
        );
        stored.push({
          code,
          fullName: form.fullName.trim(),
          idNumber: cleanId,
          phone: form.phone.trim(),
          orderId: form.orderId.trim(),
          reason: form.reason,
          details: form.details.trim(),
          timestamp: new Date().toISOString(),
          jurisdiction: "Ecuador 🇪🇨",
          legalBasis: "Artículo 45 LODC - Devolución y Desistimiento en Ventas Electrónicas",
        });
        localStorage.setItem("rapidy_devolution_requests", JSON.stringify(stored));
      } catch (err) {
        console.error("No se pudo guardar la constancia localmente:", err);
      }
    }, 500);
  };

  const copyCode = () => {
    if (!submittedCode) return;
    navigator.clipboard.writeText(submittedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    setSubmittedCode(null);
    setForm({
      fullName: "",
      idNumber: "",
      phone: "",
      orderId: "",
      reason: "",
      details: "",
    });
    setError(null);
  };

  return (
    <div className="mobile-container max-w-2xl mx-auto bg-[#F7F7FA] min-h-screen pb-14 text-gray-900">
      {/* Cabecera fija oficial Rapidy Dark Velvet */}
      <header className="sticky top-0 z-40 bg-[#0E0E12]/95 backdrop-blur-2xl border-b border-white/10 px-4 pt-4 pb-4 text-white shadow-xl">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="text-white/80 hover:text-white flex items-center gap-1.5 transition-colors touch-target py-1 cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="text-xs sm:text-sm font-semibold">Volver</span>
            </button>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider bg-white/10 text-orange-400 border border-white/10 px-3 py-1 rounded-full shadow-xs">
              <span>🇪🇨</span> LODC Art. 45 Ecuador
            </span>
          </div>

          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Derecho a la Devolución y Desistimiento
          </h1>
          <p className="text-white/70 text-xs mt-0.5 leading-relaxed">
            Ventas electrónicas y comercio por internet • Ley Orgánica de Defensa del Consumidor
          </p>
        </div>
      </header>

      {/* Contenido principal */}
      <main className="px-4 pt-5 space-y-4">
        {/* Tarjeta de Marco Legal Ecuatoriano */}
        <section className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-gray-100 border-l-4 border-l-[#FF6A00]">
          <div className="flex items-center gap-2 text-xs font-bold text-gray-900 mb-2">
            <div className="p-1.5 rounded-xl bg-orange-50 text-[#FF6A00]">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <span>Marco Legal Ecuatoriano: Art. 45 LODC</span>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">
            Conforme al <strong>Artículo 45 de la Ley Orgánica de Defensa del Consumidor (LODC)</strong> de la República del Ecuador, en las compras efectuadas mediante medios electrónicos, internet o similares, el consumidor goza del derecho a revocar o solicitar la devolución dentro del término legal antes de la consumación o ejecución del servicio.
          </p>

          {/* Excepción explícita en alimentos y perecibles */}
          <div className="mt-3 bg-orange-50/70 p-3.5 rounded-2xl border border-orange-200/80 text-xs text-gray-700">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-[#FF6A00] shrink-0 mt-0.5" />
              <div>
                <strong className="font-bold text-orange-950 block">
                  Excepción legal en alimentos preparados y perecibles:
                </strong>
                <p className="text-[11.5px] text-gray-600 mt-1 leading-relaxed">
                  De conformidad con la normativa ecuatoriana, el derecho de desistimiento o revocación unilateral no aplica en órdenes de alimentos cuya cocción, preparación culinaria o empaque ya haya comenzado en el establecimiento asociado, salvo problemas evidentes de higiene, inocuidad comprobada o entrega en mal estado.
                </p>
              </div>
            </div>
          </div>
        </section>

        {submittedCode ? (
          /* Vista de Solicitud Exitosa */
          <section className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 sm:p-8 text-center animate-in fade-in duration-300">
            <div className="w-14 h-14 bg-orange-50 text-[#FF6A00] rounded-2xl flex items-center justify-center mx-auto mb-3 border border-orange-100">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h2 className="text-lg font-black text-gray-900 mb-1">
              Solicitud de Desistimiento Radicada
            </h2>
            <p className="text-xs text-gray-600 mb-4 max-w-md mx-auto">
              Se ha generado tu constancia oficial de trámite de conformidad con el Artículo 45 de la LODC del Ecuador:
            </p>

            <div className="bg-orange-50/60 border-2 border-dashed border-[#FF6A00]/40 rounded-2xl p-4 flex items-center justify-between mb-4">
              <div className="text-left">
                <span className="text-[10px] uppercase font-bold text-gray-500 block tracking-wider">
                  Código Oficial de Trámite
                </span>
                <span className="text-base sm:text-lg font-mono font-black text-gray-950 tracking-wider">
                  {submittedCode}
                </span>
              </div>
              <button
                type="button"
                onClick={copyCode}
                className="px-3 py-2 rounded-xl bg-white border border-orange-200 text-[#FF6A00] hover:bg-orange-100/50 transition-colors flex items-center gap-1.5 text-xs font-bold cursor-pointer shadow-xs"
                title="Copiar código oficial"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-[#FF6A00]" />
                    <span>¡Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copiar</span>
                  </>
                )}
              </button>
            </div>

            <div className="text-left text-xs text-gray-700 space-y-1.5 bg-gray-50/80 p-4 rounded-2xl border border-gray-100 mb-4">
              <p>
                <strong className="text-gray-900">Titular solicitante:</strong> {form.fullName}
              </p>
              <p>
                <strong className="text-gray-900">Cédula / RUC (Ecuador):</strong> {form.idNumber}
              </p>
              <p>
                <strong className="text-gray-900">Teléfono celular:</strong> {form.phone}
              </p>
              <p>
                <strong className="text-gray-900">Número de Pedido:</strong> #{form.orderId}
              </p>
              <p>
                <strong className="text-gray-900">Causal declarada:</strong> {form.reason}
              </p>
              {form.details && (
                <p>
                  <strong className="text-gray-900">Detalles adicionales:</strong> {form.details}
                </p>
              )}
              <p className="text-gray-500 text-[11px] pt-1 border-t border-gray-200/60">
                <strong>Fecha y hora legal:</strong>{" "}
                {new Date().toLocaleString("es-EC", {
                  timeZone: "America/Guayaquil",
                  dateStyle: "medium",
                  timeStyle: "short",
                })}{" "}
                (Hora continental de Ecuador)
              </p>
            </div>

            <p className="text-[11.5px] text-gray-500 mb-5 leading-relaxed">
              Tu solicitud ha quedado radicada formalmente. Nuestro equipo de soporte y mediación en Ecuador verificará con el restaurante asociado el estado de preparación en un plazo máximo de 24 horas laborables para coordinar el reembolso a tu cuenta o medio de pago original.
            </p>

            <button
              type="button"
              onClick={handleReset}
              className="text-xs text-[#FF6A00] font-bold hover:underline cursor-pointer transition-colors"
            >
              Ingresar otra solicitud de desistimiento
            </button>
          </section>
        ) : (
          /* Formulario de Desistimiento y Devolución */
          <section className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 sm:p-6">
            <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-[#FF6A00]" />
              Formulario de Radicación de Desistimiento
            </h2>

            {error && (
              <div className="mb-4 p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">
                  Nombre y Apellido completos *
                </label>
                <input
                  type="text"
                  required
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  placeholder="Ej. Carlos Xavier Andrade Morales"
                  className="w-full h-11 px-3.5 bg-gray-50/50 border border-gray-200 rounded-2xl text-xs sm:text-sm text-gray-900 focus:bg-white focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/20 outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">
                    Cédula o RUC ecuatoriano *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={13}
                    value={form.idNumber}
                    onChange={(e) => setForm({ ...form, idNumber: e.target.value })}
                    placeholder="10 dígitos (Cédula) o 13 (RUC)"
                    className="w-full h-11 px-3.5 bg-gray-50/50 border border-gray-200 rounded-2xl text-xs sm:text-sm text-gray-900 focus:bg-white focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/20 outline-none transition-all"
                  />
                  <span className="text-[10.5px] text-gray-400 mt-1 block">
                    10 dígitos persona natural o 13 dígitos RUC SRI
                  </span>
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">
                    Teléfono celular (+593 Ecuador) *
                  </label>
                  <input
                    type="tel"
                    required
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="Ej. 0991234567 o +593 99..."
                    className="w-full h-11 px-3.5 bg-gray-50/50 border border-gray-200 rounded-2xl text-xs sm:text-sm text-gray-900 focus:bg-white focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/20 outline-none transition-all"
                  />
                  <span className="text-[10.5px] text-gray-400 mt-1 block">
                    Número de WhatsApp para coordinar mediación
                  </span>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">
                  Número de Pedido *
                </label>
                <input
                  type="text"
                  required
                  value={form.orderId}
                  onChange={(e) => setForm({ ...form, orderId: e.target.value })}
                  placeholder="Ej. 4521 o #4521"
                  className="w-full h-11 px-3.5 bg-gray-50/50 border border-gray-200 rounded-2xl text-xs sm:text-sm text-gray-900 focus:bg-white focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/20 outline-none transition-all"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">
                  Causal / Motivo de la solicitud *
                </label>
                <select
                  required
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  className="w-full h-11 px-3 bg-gray-50/50 border border-gray-200 rounded-2xl text-xs sm:text-sm text-gray-900 focus:bg-white focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/20 outline-none transition-all"
                >
                  <option value="">Selecciona el motivo legal...</option>
                  {reasonsList.map((reasonOption, idx) => (
                    <option key={idx} value={reasonOption}>
                      {reasonOption}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">
                  Detalles adicionales de la solicitud (opcional)
                </label>
                <textarea
                  rows={2}
                  value={form.details}
                  onChange={(e) => setForm({ ...form, details: e.target.value })}
                  placeholder="Explica cualquier antecedente relevante sobre el pedido..."
                  className="w-full p-3.5 bg-gray-50/50 border border-gray-200 rounded-2xl text-xs sm:text-sm text-gray-900 focus:bg-white focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/20 outline-none resize-none transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 bg-[#FF6A00] hover:bg-[#e65f00] text-white font-bold rounded-2xl text-xs sm:text-sm shadow-md shadow-[#FF6A00]/25 transition-all active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Undo2 className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                <span>
                  {loading ? "Radicando constancia oficial..." : "Enviar Solicitud de Desistimiento"}
                </span>
              </button>
            </form>
          </section>
        )}

        {/* Footer institucional de respaldo legal */}
        <footer className="text-center pt-2 pb-6">
          <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400 font-medium">
            <ShieldCheck className="w-4 h-4 text-[#FF6A00]" />
            <span>Ley Orgánica de Defensa del Consumidor • República del Ecuador 🇪🇨</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
