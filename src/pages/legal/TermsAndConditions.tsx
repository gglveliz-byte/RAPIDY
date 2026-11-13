/**
 * @archivo src/pages/legal/TermsAndConditions.tsx
 * @modulo 08-legal-and-compliance (Términos y Condiciones de Uso)
 * @proposito
 *   Página canónica de Términos y Condiciones de Uso de la plataforma Rapidy en
 *   la República del Ecuador 🇪🇨. Establece el marco regulatorio integral bajo la
 *   Ley Orgánica de Defensa del Consumidor (LODC), Ley de Comercio Electrónico (Ley 2002-67),
 *   normas de inocuidad alimentaria ARCSA, régimen tributario SRI (IVA vigente del 15% y USD)
 *   y resolución de controversias en centros de mediación de Quito y Guayaquil.
 *
 * @resumen_contenido
 *   - Cabecera Dark Velvet (#0E0E12) con acentos en Flame Orange (#FF6A00) y badge oficial ecuatoriano.
 *   - Erradicación 100% de selectores de países (exclusivo para la República del Ecuador).
 *   - Resumen ejecutivo de intermediación tecnológica y deslinde bromatológico.
 *   - Acordeón interactivo accesible con controles para expandir o colapsar todas las cláusulas.
 *   - 10 cláusulas legales exhaustivas conforme a las leyes ecuatorianas (desde termsData.ts).
 *   - Enlaces directos a Política de Privacidad, Reembolsos y Defensa del Consumidor.
 *
 * @dependencias_internas
 *   - `ECUADOR_LEGAL_CLAUSES`, `LegalClause` (./termsData)
 *
 * @dependencias_externas
 *   - `react` (`useState`)
 *   - `react-router` (`useNavigate`)
 *   - `lucide-react` (`ArrowLeft`, `ShieldCheck`, `Scale`, `FileText`, `DollarSign`, `AlertCircle`, `ChevronDown`, `ChevronUp`, `CheckCircle2`, `Sparkles`)
 */

import { useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  ShieldCheck,
  Scale,
  FileText,
  DollarSign,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { ECUADOR_LEGAL_CLAUSES, type LegalClause } from "./termsData";

export default function TermsAndConditions() {
  const navigate = useNavigate();
  const [openSections, setOpenSections] = useState<number[]>([1, 2]);

  const toggleSection = (id: number) => {
    setOpenSections((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const expandAll = () => setOpenSections(ECUADOR_LEGAL_CLAUSES.map((c) => c.id));
  const collapseAll = () => setOpenSections([]);

  return (
    <div className="mobile-container max-w-2xl mx-auto bg-[#F7F7FA] min-h-screen pb-12 font-sans selection:bg-[#FF6A00]/20 selection:text-[#FF6A00]">
      {/* Cabecera Dark Velvet oficial Rapidy */}
      <div className="bg-[#0E0E12] px-4 pt-5 pb-8 border-b border-white/10 relative overflow-hidden">
        {/* Halo luminoso sutil en la cabecera */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#FF6A00]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10">
          <button
            onClick={() => navigate(-1)}
            className="text-white/90 hover:text-white mb-3 touch-target flex items-center gap-1.5 transition-colors cursor-pointer group"
            aria-label="Volver a la pantalla anterior"
          >
            <div className="w-8 h-8 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center group-hover:bg-[#FF6A00]/20 group-hover:border-[#FF6A00]/40 transition-all">
              <ArrowLeft className="w-4 h-4 text-white group-hover:text-[#FF6A00] transition-colors" />
            </div>
            <span className="text-sm font-semibold tracking-wide">Volver</span>
          </button>

          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-[11px] font-black uppercase tracking-wider bg-[#FF6A00]/20 text-[#FF6A00] border border-[#FF6A00]/30 px-3 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
              <span>🇪🇨</span>
              <span>República del Ecuador</span>
            </span>
            <span className="text-[11px] font-medium text-zinc-400 bg-white/5 border border-white/10 px-2.5 py-0.5 rounded-full">
              LODC & Ley 2002-67
            </span>
            <span className="text-[11px] font-medium text-zinc-400">
              Versión Oficial 2026
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Términos y Condiciones
          </h1>
          <p className="text-zinc-400 text-xs sm:text-sm mt-1 max-w-xl leading-relaxed">
            Contrato de adhesión para la plataforma tecnológica de intermediación Rapidy en territorio ecuatoriano.
          </p>
        </div>
      </div>

      {/* Contenedor superpuesto -mt-4 */}
      <div className="px-4 -mt-4 space-y-3 relative z-20">
        {/* Banner de Marco Regulatorio Ecuatoriano */}
        <div className="bg-white rounded-3xl card-shadow p-4 sm:p-5 border-l-4 border-[#FF6A00] border border-zinc-100 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#FF6A00]/10 border border-[#FF6A00]/25 flex items-center justify-center text-[#FF6A00] shrink-0">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-zinc-900 uppercase tracking-wide">
                  Marco Regulatorio 100% Ecuatoriano
                </span>
                <span className="text-[10px] bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded-full">
                  Vigente 🇪🇨
                </span>
              </div>
              <p className="text-xs text-zinc-600 mt-1 leading-relaxed">
                Rapidy opera bajo el imperio de la <strong>Constitución</strong>, la <strong>Ley Orgánica de Defensa del Consumidor (LODC)</strong>, la <strong>Ley de Comercio Electrónico (Ley 2002-67)</strong>, la regulación sanitaria de <strong>ARCSA</strong> y las disposiciones fiscales del <strong>SRI</strong>.
              </p>
            </div>
          </div>

          {/* Micro pills de atributos clave */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3.5 pt-3 border-t border-zinc-100 text-[11px] text-zinc-700 font-medium">
            <div className="bg-[#F7F7FA] rounded-xl p-2 border border-zinc-200/60 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-[#FF6A00] shrink-0" />
              <span>Dólares (USD) con IVA 15%</span>
            </div>
            <div className="bg-[#F7F7FA] rounded-xl p-2 border border-zinc-200/60 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#FF6A00] shrink-0" />
              <span>Cédula o RUC ecuatoriano</span>
            </div>
            <div className="bg-[#F7F7FA] rounded-xl p-2 border border-zinc-200/60 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#FF6A00] shrink-0" />
              <span>Inocuidad ARCSA</span>
            </div>
            <div className="bg-[#F7F7FA] rounded-xl p-2 border border-zinc-200/60 flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5 text-[#FF6A00] shrink-0" />
              <span>Mediación Quito & GYE</span>
            </div>
          </div>
        </div>

        {/* Barra de control del acordeón */}
        <div className="flex items-center justify-between px-1 pt-1">
          <span className="text-xs font-bold text-zinc-700 flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-[#FF6A00]" />
            <span>Cláusulas de Contratación ({ECUADOR_LEGAL_CLAUSES.length})</span>
          </span>
          <div className="flex items-center gap-1.5 text-xs">
            <button
              onClick={expandAll}
              className="px-2.5 py-1 rounded-lg bg-white border border-zinc-200 text-zinc-700 font-semibold hover:border-[#FF6A00] hover:text-[#FF6A00] transition-colors cursor-pointer text-[11px]"
            >
              Expandir todo
            </button>
            <button
              onClick={collapseAll}
              className="px-2.5 py-1 rounded-lg bg-white border border-zinc-200 text-zinc-700 font-semibold hover:border-[#FF6A00] hover:text-[#FF6A00] transition-colors cursor-pointer text-[11px]"
            >
              Colapsar todo
            </button>
          </div>
        </div>

        {/* Lista de Cláusulas en Acordeón */}
        <div className="space-y-2.5">
          {ECUADOR_LEGAL_CLAUSES.map((clause: LegalClause) => {
            const isOpen = openSections.includes(clause.id);
            const Icon = clause.icon;

            return (
              <div
                key={clause.id}
                className={`bg-white rounded-2xl sm:rounded-3xl card-shadow border transition-all overflow-hidden ${
                  isOpen
                    ? "border-[#FF6A00]/30 shadow-md ring-1 ring-[#FF6A00]/10"
                    : "border-zinc-100 hover:border-zinc-200"
                }`}
              >
                <button
                  onClick={() => toggleSection(clause.id)}
                  className="w-full p-4 sm:p-4.5 flex items-center justify-between text-left transition-colors cursor-pointer gap-3"
                  aria-expanded={isOpen}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                        isOpen
                          ? "bg-[#FF6A00] text-white shadow-xs"
                          : "bg-zinc-100 text-zinc-600"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#FF6A00] bg-[#FF6A00]/10 px-2 py-0.5 rounded-full">
                          {clause.badge}
                        </span>
                      </div>
                      <h2 className="text-xs sm:text-sm font-bold text-zinc-900 truncate mt-0.5">
                        {clause.title}
                      </h2>
                    </div>
                  </div>
                  <div className="w-7 h-7 rounded-lg bg-zinc-50 border border-zinc-200/80 flex items-center justify-center text-zinc-500 shrink-0">
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-[#FF6A00]" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </div>
                </button>

                {isOpen && (
                  <div className="px-4 pb-4.5 pt-1 text-xs text-zinc-600 border-t border-zinc-100 space-y-3 leading-relaxed">
                    <p className="font-normal text-zinc-700 bg-[#F7F7FA] p-3 rounded-xl border border-zinc-200/70">
                      {clause.content.summary}
                    </p>

                    <div className="space-y-2 pl-1">
                      {clause.content.points.map((pt, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <span className="text-[#FF6A00] font-black text-sm leading-none mt-0.5">•</span>
                          <div>
                            <strong className="text-zinc-900 font-bold">{pt.label} </strong>
                            <span className="text-zinc-600">{pt.text}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {clause.content.highlight && (
                      <div className="bg-amber-50/90 rounded-xl p-3 border border-amber-200/80 text-[11px] text-amber-900 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-[#FF6A00] shrink-0 mt-0.5" />
                        <div>
                          <strong className="font-bold text-amber-950">Aviso Legal Importante: </strong>
                          <span>{clause.content.highlight}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Tarjeta de Garantía al Consumidor Ecuador */}
        <div className="bg-gradient-to-br from-zinc-900 to-[#0E0E12] rounded-3xl p-5 text-white shadow-xl relative overflow-hidden mt-4">
          <div className="absolute top-0 right-0 w-48 h-48 bg-[#FF6A00]/15 rounded-full blur-2xl pointer-events-none" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-[#FF6A00]" />
              <span className="text-[11px] font-black text-[#FF6A00] uppercase tracking-wider">
                Compromiso de Transparencia Rapidy
              </span>
            </div>
            <h3 className="text-base font-bold text-white">
              ¿Tienes dudas sobre tus derechos como consumidor?
            </h3>
            <p className="text-xs text-zinc-300 mt-1 leading-relaxed">
              Puedes acudir directamente a la <strong>Defensoría del Pueblo de Ecuador</strong> o recurrir a los canales oficiales de reclamos y mediación contemplados en la LODC.
            </p>
            <div className="mt-3.5 flex flex-wrap gap-2">
              <button
                onClick={() => navigate("/defensa-del-consumidor")}
                className="px-3 py-2 rounded-xl bg-[#FF6A00] hover:bg-[#e65f00] text-white text-xs font-bold transition-all shadow-md shadow-[#FF6A00]/25 flex items-center gap-1.5 cursor-pointer"
              >
                <span>Defensa del Consumidor</span>
              </button>
              <button
                onClick={() => navigate("/politica-de-reembolso")}
                className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <span>Reembolsos y Devoluciones</span>
              </button>
            </div>
          </div>
        </div>

        {/* Accesos a otros documentos legales */}
        <div className="pt-2">
          <div className="text-center text-xs text-zinc-500 font-semibold mb-2">
            Otros Documentos Regulatorios Ecuatorianos
          </div>
          <div className="flex flex-wrap gap-2 justify-center text-xs">
            <button
              onClick={() => navigate("/politica-de-privacidad")}
              className="px-3 py-1.5 rounded-xl bg-white border border-zinc-200 text-zinc-700 font-medium hover:border-[#FF6A00] hover:text-[#FF6A00] transition-colors shadow-2xs cursor-pointer"
            >
              Protección de Datos (LOPDP)
            </button>
            <button
              onClick={() => navigate("/politica-de-reembolso")}
              className="px-3 py-1.5 rounded-xl bg-white border border-zinc-200 text-zinc-700 font-medium hover:border-[#FF6A00] hover:text-[#FF6A00] transition-colors shadow-2xs cursor-pointer"
            >
              Garantía & Reembolsos
            </button>
            <button
              onClick={() => navigate("/legal")}
              className="px-3 py-1.5 rounded-xl bg-white border border-zinc-200 text-zinc-700 font-medium hover:border-[#FF6A00] hover:text-[#FF6A00] transition-colors shadow-2xs cursor-pointer"
            >
              Centro Legal Completo
            </button>
          </div>
        </div>

        {/* Footer legal oficial */}
        <div className="text-center pt-3 pb-6">
          <div className="flex items-center justify-center gap-1.5 text-xs text-zinc-400">
            <ShieldCheck className="w-4 h-4 text-[#FF6A00]" />
            <span>Rapidy Technologies Ecuador S.A.S. • RUC Ecuatoriano en trámite</span>
          </div>
          <p className="text-[10px] text-zinc-400 mt-0.5">
            Todos los derechos reservados © {new Date().getFullYear()} • Plataforma Tecnológica de Intermediación
          </p>
        </div>
      </div>
    </div>
  );
}
