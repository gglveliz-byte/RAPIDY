/**
 * @archivo src/pages/legal/LegalHub.tsx
 * @modulo Legal & Compliance - Rapidy Ecuador
 * @proposito
 *   Centro de documentación legal, transparencia institucional y protección al consumidor
 *   de Rapidy para la República del Ecuador. Estructura el acceso centralizado a los 6 pilares
 *   de cumplimiento normativo (LODC, LOPDP, Comercio Electrónico y estándares Google Play).
 *
 * @resumen_contenido
 *   - Componente `LegalHub`: Vista principal del centro legal de Rapidy Ecuador.
 *   - 6 pilares normativos de protección legal ecuatoriana:
 *       1. Términos y Condiciones (/terminos-y-condiciones) - LODC y Ley de Comercio Electrónico.
 *       2. Política de Privacidad (/politica-de-privacidad) - LOPDP (R.O. 459 Suplemento).
 *       3. Cancelaciones y Reembolsos (/politica-de-reembolso) - Art. 46 LODC y reintegros en USD.
 *       4. Derecho de Devolución y Desistimiento (/boton-de-arrepentimiento) - Art. 45 LODC en comercio electrónico.
 *       5. Defensa del Consumidor (/defensa-del-consumidor) - Defensoría del Pueblo del Ecuador (DPE) y MPCEIP.
 *       6. Eliminación de Cuenta y Datos (/eliminar-cuenta) - LOPDP Ecuador y Google Play Data Safety.
 *   - Definición de intermediación tecnológica neutral en Ecuador (Quito, Guayaquil, Cuenca y cobertura nacional).
 *   - Canales oficiales de atención: soporte@rapidy.app, 1800-DEFENSA (1800 333 367) y mediación arbitral.
 *   - Sistema de diseño oficial Rapidy: Cabecera Dark Velvet (#0E0E12), fondo #F7F7FA y acentos Flame Orange (#FF6A00).
 *
 * @dependencias_internas
 *   - Enrutador React Router (`useNavigate`)
 *
 * @dependencias_externas
 *   - `lucide-react`: ArrowLeft, FileText, Shield, RefreshCw, Undo2, Scale, Trash2, ChevronRight, ShieldCheck, Mail, Phone, MapPin, Building2
 */

import { useNavigate } from "react-router";
import {
  ArrowLeft,
  FileText,
  Shield,
  RefreshCw,
  Undo2,
  Scale,
  Trash2,
  ChevronRight,
  ShieldCheck,
  Mail,
  Phone,
  MapPin,
  Building2,
} from "lucide-react";

/**
 * Representa la metadata técnica y jurídica de cada documento legal en Rapidy Ecuador.
 */
interface LegalDocumentItem {
  id: string;
  title: string;
  badge: string;
  path: string;
  description: string;
  legalBasis: string;
  icon: typeof FileText;
}

/**
 * Componente principal del Centro Legal Hub de Rapidy Ecuador.
 * Centraliza la documentación regulatoria, garantías del consumidor y canales de mediación.
 */
export default function LegalHub() {
  const navigate = useNavigate();

  const legalDocuments: LegalDocumentItem[] = [
    {
      id: "terminos-condiciones",
      title: "Términos y Condiciones",
      badge: "LODC & E-Commerce",
      path: "/terminos-y-condiciones",
      description:
        "Condiciones de intermediación tecnológica neutral, derechos de comercios aliados y repartidores independientes.",
      legalBasis: "Ley Orgánica de Defensa del Consumidor y Ley de Comercio Electrónico, Firmas y Mensajes de Datos.",
      icon: FileText,
    },
    {
      id: "politica-privacidad",
      title: "Política de Privacidad",
      badge: "LOPDP Ecuador",
      path: "/politica-de-privacidad",
      description:
        "Tratamiento legítimo de datos personales, geolocalización GPS en tiempo real y ejercicio de derechos ARCO+.",
      legalBasis: "Ley Orgánica de Protección de Datos Personales (Registro Oficial Suplemento 459).",
      icon: Shield,
    },
    {
      id: "cancelaciones-reembolsos",
      title: "Cancelaciones y Reembolsos",
      badge: "Art. 46 LODC • USD",
      path: "/politica-de-reembolso",
      description:
        "Tiempos y protocolos de restitución dineraria en dólares (USD), plazos bancarios nacionales y gestión de incidencias.",
      legalBasis: "Art. 46 de la LODC y regulaciones del Banco Central del Ecuador para débitos/créditos.",
      icon: RefreshCw,
    },
    {
      id: "derecho-devolucion",
      title: "Derecho de Devolución y Desistimiento",
      badge: "Art. 45 LODC",
      path: "/boton-de-arrepentimiento",
      description:
        "Facultad de revocación y desistimiento para contrataciones electrónicas en plazo legal de 3 días hábiles.",
      legalBasis: "Art. 45 de la LODC para compras a distancia y canales digitales en Ecuador.",
      icon: Undo2,
    },
    {
      id: "defensa-consumidor",
      title: "Defensa del Consumidor",
      badge: "DPE & MPCEIP",
      path: "/defensa-del-consumidor",
      description:
        "Canal de quejas, libro de reclamaciones digital y articulación directa con la Defensoría del Pueblo del Ecuador.",
      legalBasis: "Defensoría del Pueblo del Ecuador (DPE) y Ministerio de Producción, Comercio Exterior e Inversiones.",
      icon: Scale,
    },
    {
      id: "eliminacion-cuenta",
      title: "Eliminación de Cuenta y Datos",
      badge: "Google Play Safe",
      path: "/eliminar-cuenta",
      description:
        "Solicitud expedita de supresión definitiva de perfil, historial transaccional y borrado irrevocable de credenciales.",
      legalBasis: "Derecho de Supresión (Art. 15 LOPDP) y directivas Google Play Data Safety.",
      icon: Trash2,
    },
  ];

  return (
    <div className="mobile-container max-w-2xl mx-auto bg-[#F7F7FA] min-h-screen pb-16 selection:bg-[#FF6A00]/20 selection:text-[#0E0E12]">
      {/* Cabecera fija Dark Velvet (#0E0E12) con border-white/10 y botón volver */}
      <header className="sticky top-0 z-50 bg-[#0E0E12] border-b border-white/10 px-4 py-3 flex items-center justify-between shadow-xl">
        <button
          onClick={() => navigate(-1)}
          className="text-white/90 hover:text-white touch-target flex items-center gap-2 transition-colors cursor-pointer group"
          aria-label="Volver a la vista anterior"
        >
          <ArrowLeft className="w-5 h-5 text-zinc-300 group-hover:text-white group-hover:-translate-x-0.5 transition-transform" />
          <span className="text-sm font-semibold tracking-tight">Volver</span>
        </button>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-wider bg-[#FF6A00]/20 text-[#FF6A00] border border-[#FF6A00]/30 px-2.5 py-0.5 rounded-full">
            Ecuador 🇪🇨
          </span>
        </div>
      </header>

      {/* Banner de Presentación Institucional */}
      <div className="bg-[#0E0E12] px-4 pt-3 pb-8 border-b border-white/10 text-white">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-black uppercase tracking-wider bg-white/10 text-zinc-200 px-2.5 py-0.5 rounded-full border border-white/10">
            Transparencia & Cumplimiento
          </span>
          <span className="text-[11px] text-zinc-400 font-medium">República del Ecuador</span>
        </div>
        <h1 className="text-2xl font-black text-white tracking-tight">
          Centro Legal Rapidy
        </h1>
        <p className="text-zinc-400 text-xs mt-1.5 leading-relaxed">
          Marco regulatorio, derechos del consumidor y protección de datos conforme a la legislación de la República del Ecuador.
        </p>
      </div>

      {/* Contenedor Principal Superpuesto */}
      <main className="px-4 -mt-4 space-y-4">
        {/* Tarjeta 1: Manifiesto de Intermediación Tecnológica */}
        <section className="bg-white rounded-3xl p-4 sm:p-5 border border-zinc-100 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#FF6A00]/10 border border-[#FF6A00]/20 flex items-center justify-center text-[#FF6A00] shrink-0 mt-0.5">
              <Building2 className="w-5 h-5" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-xs font-black uppercase tracking-wider text-zinc-900 flex items-center gap-1.5">
                Plataforma de Intermediación Tecnológica
              </h2>
              <p className="text-xs text-zinc-600 leading-relaxed">
                En <strong>Rapidy</strong> operamos en la <strong>República del Ecuador 🇪🇨</strong> como una plataforma neutral de intermediación digital que conecta a clientes con establecimientos comerciales y repartidores independientes con cobertura activa en <strong>Quito, Guayaquil, Cuenca</strong> y a nivel nacional.
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded-lg">
                  <MapPin className="w-3 h-3 text-[#FF6A00]" /> Quito
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded-lg">
                  <MapPin className="w-3 h-3 text-[#FF6A00]" /> Guayaquil
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded-lg">
                  <MapPin className="w-3 h-3 text-[#FF6A00]" /> Cuenca
                </span>
                <span className="text-[10px] font-bold bg-[#FF6A00]/10 text-[#FF6A00] px-2 py-0.5 rounded-lg border border-[#FF6A00]/20">
                  Moneda Legal: USD ($)
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Sección: Los 6 Pilares de Protección Legal */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-black uppercase tracking-wider text-zinc-500">
              Pilares de Protección Legal (6)
            </h2>
            <span className="text-[10px] font-bold text-zinc-400">Normativa 2026</span>
          </div>

          <div className="space-y-2">
            {legalDocuments.map((doc) => {
              const Icon = doc.icon;
              return (
                <button
                  key={doc.id}
                  onClick={() => navigate(doc.path)}
                  className="w-full bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 border border-zinc-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex items-center justify-between text-left hover:border-[#FF6A00]/40 hover:shadow-md transition-all active:scale-[0.99] group cursor-pointer"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl sm:rounded-2xl bg-[#FF6A00]/10 border border-[#FF6A00]/20 text-[#FF6A00] flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-[#FF6A00] group-hover:text-white transition-colors">
                      <Icon className="w-5 h-5 transition-transform group-hover:scale-110" />
                    </div>
                    <div className="min-w-0 pr-1">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <span className="text-xs sm:text-sm font-bold text-zinc-900 group-hover:text-[#FF6A00] transition-colors line-clamp-1">
                          {doc.title}
                        </span>
                        <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-[#FF6A00]/10 text-[#FF6A00] border border-[#FF6A00]/20 shrink-0">
                          {doc.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-500 line-clamp-2 leading-relaxed">
                        {doc.description}
                      </p>
                      <span className="text-[10px] text-zinc-400 mt-1 block font-medium">
                        Base: {doc.legalBasis}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-[#FF6A00] group-hover:translate-x-1 transition-all shrink-0 ml-2" />
                </button>
              );
            })}
          </div>
        </section>

        {/* Tarjeta: Canales Oficiales Ecuatorianos de Soporte y Mediación */}
        <section className="bg-white rounded-3xl p-4 sm:p-5 border border-zinc-100 shadow-[0_4px_20px_rgba(0,0,0,0.04)] space-y-3">
          <h2 className="text-xs font-black uppercase tracking-wider text-zinc-900 flex items-center gap-1.5">
            Canales Oficiales en Ecuador
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* Defensoría del Pueblo */}
            <a
              href="tel:1800333367"
              className="p-3 rounded-2xl bg-zinc-50 hover:bg-zinc-100/80 border border-zinc-100 flex items-center justify-between transition-colors group"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-[#FF6A00]/10 text-[#FF6A00] flex items-center justify-center shrink-0">
                  <Phone className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-[11px] font-bold text-zinc-900 block truncate">
                    Defensoría del Pueblo
                  </span>
                  <span className="text-[10px] text-zinc-500 font-semibold block">
                    1800-DEFENSA (333 367)
                  </span>
                </div>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-[#FF6A00] transition-colors" />
            </a>

            {/* Soporte Legal Rapidy */}
            <a
              href="mailto:soporte@rapidy.app"
              className="p-3 rounded-2xl bg-zinc-50 hover:bg-zinc-100/80 border border-zinc-100 flex items-center justify-between transition-colors group"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-[#FF6A00]/10 text-[#FF6A00] flex items-center justify-center shrink-0">
                  <Mail className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-[11px] font-bold text-zinc-900 block truncate">
                    Soporte & Legalidad
                  </span>
                  <span className="text-[10px] text-zinc-500 font-semibold block">
                    soporte@rapidy.app
                  </span>
                </div>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-[#FF6A00] transition-colors" />
            </a>
          </div>

          <div className="text-[11px] text-zinc-500 bg-zinc-50 p-2.5 rounded-xl border border-zinc-100 leading-relaxed">
            Jurisdicción y Mediación: En caso de controversias, las partes se someterán a los Centros de Mediación y Arbitraje autorizados en la <strong>República del Ecuador</strong>, con observancia estricta de la Ley Orgánica de Defensa del Consumidor.
          </div>
        </section>

        {/* Footer de Confianza y Transparencia */}
        <footer className="text-center pt-2 pb-6 space-y-1">
          <div className="flex items-center justify-center gap-1.5 text-xs text-zinc-500 font-medium">
            <ShieldCheck className="w-4 h-4 text-[#FF6A00]" />
            <span>Rapidy Ecuador • Plataforma de Intermediación Tecnológica</span>
          </div>
          <p className="text-[10px] text-zinc-400">
            Cumplimiento normativo LODC & LOPDP (R.O. 459) • Operaciones en USD ($)
          </p>
        </footer>
      </main>
    </div>
  );
}
