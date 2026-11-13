/**
 * @archivo src/pages/legal/RefundPolicy.tsx
 * @modulo Legal & Cumplimiento Regulatorio - Rapidy Ecuador
 * @proposito
 *   Presenta la Política Oficial de Cancelaciones y Reembolsos de Rapidy para la
 *   República del Ecuador, bajo el marco de la Ley Orgánica de Defensa del Consumidor
 *   (LODC) Art. 46 (Devolución de lo pagado), regulando tiempos de cancelación sin costo,
 *   cobertura de incidencias logísticas y restitución de fondos en Dólares ($ USD).
 *
 * @resumen_contenido
 *   - Cabecera oficial Dark Velvet (#0E0E12) con badge tricolor ecuatoriano y border-white/10.
 *   - Pestañas interactivas: "Cancelación", "Incidencias", "Reintegros" y "Marco Legal".
 *   - Cancelación sin costo antes de preparación gastronómica o empaque en comercio.
 *   - Protocolo ante faltantes, derrames, empaque dañado y retraso logístico injustificado.
 *   - Canales y plazos de restitución en instituciones financieras autorizadas por la
 *     Superintendencia de Bancos del Ecuador (Pichincha, Guayaquil, Pacífico, Produbanco, Cooperativas).
 *   - Moneda exclusiva de curso legal: Dólares de los Estados Unidos de América ($ USD).
 *   - Acceso directo al Libro de Reclamaciones digital de Rapidy Ecuador.
 *
 * @dependencias_internas
 *   - Ninguna (Página legal modular autocontenida).
 *
 * @dependencias_externas
 *   - react (useState)
 *   - react-router (useNavigate)
 *   - lucide-react (ArrowLeft, Clock, CheckCircle2, ShieldCheck, AlertTriangle, ChevronRight,
 *     Landmark, Building2, DollarSign, FileText, BadgeCheck)
 */

import { useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  ShieldCheck,
  AlertTriangle,
  ChevronRight,
  Landmark,
  Building2,
  DollarSign,
  FileText,
  BadgeCheck,
} from "lucide-react";

export default function RefundPolicy() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"cancelacion" | "incidencias" | "reintegros" | "legal">("cancelacion");

  return (
    <div className="mobile-container max-w-2xl mx-auto bg-[#F7F7FA] min-h-screen pb-14 text-zinc-900">
      {/* Cabecera oficial estilo Rapidy: Dark Velvet con borde translúcido */}
      <header className="bg-[#0E0E12] px-4 pt-4 pb-8 border-b border-white/10 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => navigate(-1)}
            className="text-white/90 hover:text-white touch-target flex items-center gap-1.5 transition-colors cursor-pointer group"
            aria-label="Volver a la vista anterior"
          >
            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
            <span className="text-sm font-semibold">Volver</span>
          </button>

          <div className="flex items-center gap-1.5 bg-[#FF6A00]/20 border border-[#FF6A00]/30 text-[#FF6A00] px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider">
            <span>🇪🇨</span>
            <span>Ecuador • LODC Art. 46</span>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-black tracking-widest uppercase bg-white/10 text-zinc-300 px-2 py-0.5 rounded-md">
            Garantía Rapidy
          </span>
          <span className="text-[11px] text-zinc-400 font-medium flex items-center gap-1">
            <DollarSign className="w-3 h-3 text-[#FF6A00]" />
            Dólares ($ USD)
          </span>
        </div>

        <h1 className="text-2xl font-black text-white tracking-tight">
          Cancelaciones y Reembolsos
        </h1>
        <p className="text-zinc-400 text-xs mt-0.5">
          Política oficial de satisfacción, devoluciones y restitución de fondos
        </p>
      </header>

      {/* Contenedor superpuesto -mt-4 */}
      <main className="px-4 -mt-4 space-y-3.5">
        {/* Selector de pestañas interactivas */}
        <div className="bg-white rounded-2xl p-1.5 border border-zinc-200/80 shadow-xs grid grid-cols-4 gap-1">
          <button
            onClick={() => setActiveTab("cancelacion")}
            className={`py-2 px-1 text-xs font-bold rounded-xl transition-all cursor-pointer text-center ${
              activeTab === "cancelacion"
                ? "bg-[#FF6A00] text-white shadow-xs"
                : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
            }`}
          >
            Cancelación
          </button>
          <button
            onClick={() => setActiveTab("incidencias")}
            className={`py-2 px-1 text-xs font-bold rounded-xl transition-all cursor-pointer text-center ${
              activeTab === "incidencias"
                ? "bg-[#FF6A00] text-white shadow-xs"
                : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
            }`}
          >
            Incidencias
          </button>
          <button
            onClick={() => setActiveTab("reintegros")}
            className={`py-2 px-1 text-xs font-bold rounded-xl transition-all cursor-pointer text-center ${
              activeTab === "reintegros"
                ? "bg-[#FF6A00] text-white shadow-xs"
                : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
            }`}
          >
            Reintegros
          </button>
          <button
            onClick={() => setActiveTab("legal")}
            className={`py-2 px-1 text-xs font-bold rounded-xl transition-all cursor-pointer text-center ${
              activeTab === "legal"
                ? "bg-[#FF6A00] text-white shadow-xs"
                : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
            }`}
          >
            Marco Legal
          </button>
        </div>

        {/* Tab 1: Cancelación */}
        {activeTab === "cancelacion" && (
          <div className="space-y-3">
            {/* Cancelación sin costo */}
            <div className="bg-white rounded-3xl p-5 border border-zinc-200/80 border-l-4 border-l-[#FF6A00] shadow-xs">
              <div className="flex items-center gap-2 text-xs font-black text-zinc-900 mb-1.5">
                <CheckCircle2 className="w-4 h-4 text-[#FF6A00] shrink-0" />
                <span>Cancelación Sin Costo (100% Reembolso en $ USD)</span>
              </div>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Puedes cancelar tu orden sin cargo alguno siempre que el pedido se encuentre en estado{" "}
                <strong className="text-zinc-900">"Pendiente"</strong> o antes de que el comercio comience su preparación
                o empaque físico. En tal caso, la retención es liberada de inmediato o se reversa la totalidad del importe pagado.
              </p>
            </div>

            {/* Cocina en proceso */}
            <div className="bg-white rounded-2xl p-5 border border-zinc-200/80 border-l-4 border-l-amber-500 shadow-xs">
              <div className="flex items-center gap-2 text-xs font-black text-zinc-900 mb-1.5">
                <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                <span>Pedido en Preparación Gastronómica</span>
              </div>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Una vez que el establecimiento gastronómico inicia la cocción y preparación de alimentos a medida,
                no aplica la cancelación unilateral sin costo conforme a las excepciones legales para bienes perecederos
                de consumo inmediato, protegiendo los insumos ya elaborados por el comercio.
              </p>
            </div>

            {/* Cancelación por parte del local */}
            <div className="bg-white rounded-2xl p-5 border border-zinc-200/80 shadow-xs">
              <div className="flex items-center gap-2 text-xs font-black text-zinc-900 mb-1.5">
                <Building2 className="w-4 h-4 text-[#FF6A00] shrink-0" />
                <span>Cancelación por Imposibilidad del Comercio</span>
              </div>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Si el local asociado carece de disponibilidad, agotó el stock de un platillo o no puede procesar el pedido
                por causas operativas, la orden se anula automáticamente y se reintegra el{" "}
                <strong className="text-zinc-900">100% del dinero abonado en $ USD</strong> de manera inmediata.
              </p>
            </div>
          </div>
        )}

        {/* Tab 2: Incidencias */}
        {activeTab === "incidencias" && (
          <div className="space-y-3">
            <div className="bg-white rounded-3xl p-5 border border-zinc-200/80 shadow-xs">
              <h3 className="text-xs font-black text-zinc-900 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                <BadgeCheck className="w-4 h-4 text-[#FF6A00]" />
                Protocolo ante irregularidades en la entrega
              </h3>
              <ul className="text-xs text-zinc-600 space-y-2">
                <li className="p-3 bg-zinc-50 rounded-2xl border border-zinc-100 flex items-start gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#FF6A00] mt-1.5 shrink-0" />
                  <div>
                    <strong className="text-zinc-900 block mb-0.5">Producto o ítem faltante:</strong>
                    Reembolso proporcional exacto del valor del artículo omitido en $ USD más los impuestos proporcionales.
                  </div>
                </li>
                <li className="p-3 bg-zinc-50 rounded-2xl border border-zinc-100 flex items-start gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#FF6A00] mt-1.5 shrink-0" />
                  <div>
                    <strong className="text-zinc-900 block mb-0.5">Empaque dañado o producto derramado:</strong>
                    Restitución del monto total o reposición inmediata tras enviar fotografía del empaque o precinto vulnerado.
                  </div>
                </li>
                <li className="p-3 bg-zinc-50 rounded-2xl border border-zinc-100 flex items-start gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#FF6A00] mt-1.5 shrink-0" />
                  <div>
                    <strong className="text-zinc-900 block mb-0.5">Pedido incorrecto o cambiado:</strong>
                    Envío prioritario sin costo adicional de la orden correcta o restitución íntegra de los fondos a tu cuenta.
                  </div>
                </li>
                <li className="p-3 bg-zinc-50 rounded-2xl border border-zinc-100 flex items-start gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#FF6A00] mt-1.5 shrink-0" />
                  <div>
                    <strong className="text-zinc-900 block mb-0.5">Retraso injustificado en logística:</strong>
                    Si el repartidor incurre en una demora desproporcionada que altere la calidad e inocuidad del alimento, podrás rechazar la entrega y obtener la devolución completa.
                  </div>
                </li>
              </ul>
            </div>

            {/* Alerta de plazo de reclamo */}
            <div className="bg-amber-50/80 rounded-2xl border border-amber-200/90 p-4 shadow-xs">
              <div className="flex items-center gap-2 text-xs font-black text-amber-950 mb-1">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Plazo oficial para reportar incidencias</span>
              </div>
              <p className="text-xs text-amber-900/90 leading-relaxed">
                Por razones sanitarias y de trazabilidad con el restaurante, los reportes sobre alimentos preparados deben ingresarse dentro de las{" "}
                <strong>2 horas posteriores a la recepción</strong>. Para productos no perecederos, dispones de hasta 24 horas hábiles.
              </p>
            </div>
          </div>
        )}

        {/* Tab 3: Reintegros */}
        {activeTab === "reintegros" && (
          <div className="space-y-3">
            <div className="bg-white rounded-3xl p-5 border border-zinc-200/80 shadow-xs">
              <h3 className="text-xs font-black text-zinc-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Landmark className="w-4 h-4 text-[#FF6A00]" />
                Acreditación Bancaria en Ecuador ($ USD)
              </h3>
              <p className="text-xs text-zinc-600 mb-3 leading-relaxed">
                Los reintegros aprobados se efectúan en Dólares de los Estados Unidos de América a través de entidades autorizadas y supervisadas por la Superintendencia de Bancos del Ecuador y la SEPS:
              </p>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-3 bg-zinc-50 rounded-2xl border border-zinc-100">
                  <div>
                    <span className="font-bold text-zinc-900 block">Cancelación antes de captura</span>
                    <span className="text-[11px] text-zinc-500">Liberación de retención bancaria</span>
                  </div>
                  <span className="font-black text-[#FF6A00] text-xs">Inmediato</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-zinc-50 rounded-2xl border border-zinc-100">
                  <div>
                    <span className="font-bold text-zinc-900 block">Transferencia Directa (SPI / BCE)</span>
                    <span className="text-[11px] text-zinc-500">Banco Pichincha, Guayaquil, Pacífico, Produbanco, Coops</span>
                  </div>
                  <span className="font-bold text-zinc-800 text-xs">24 a 72 hs hábiles</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-zinc-50 rounded-2xl border border-zinc-100">
                  <div>
                    <span className="font-bold text-zinc-900 block">Tarjetas de Débito / Crédito</span>
                    <span className="text-[11px] text-zinc-500">Procesamiento vía pasarela ecuatoriana</span>
                  </div>
                  <span className="font-bold text-zinc-800 text-xs">3 a 5 días hábiles</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-zinc-50 rounded-2xl border border-zinc-100">
                  <div>
                    <span className="font-bold text-zinc-900 block">Billetera Rapidy Cash</span>
                    <span className="text-[11px] text-zinc-500">Saldo reutilizable o transferible</span>
                  </div>
                  <span className="font-black text-[#FF6A00] text-xs">Instantáneo</span>
                </div>
              </div>
            </div>

            {/* Aviso sobre moneda */}
            <div className="bg-[#0E0E12] text-white rounded-2xl p-4 border border-white/10 shadow-md flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-[#FF6A00]/20 border border-[#FF6A00]/40 flex items-center justify-center shrink-0 mt-0.5">
                <DollarSign className="w-4 h-4 text-[#FF6A00]" />
              </div>
              <div className="text-xs space-y-1">
                <span className="font-black text-white block">Moneda de Curso Legal: Dólares ($ USD)</span>
                <p className="text-zinc-400 leading-relaxed">
                  Todos los cobros y restituciones se procesan exclusivamente en Dólares ($ USD). Las cuentas receptoras deben pertenecer al titular de la cuenta o estar debidamente autorizadas ante el sistema financiero nacional.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Marco Legal */}
        {activeTab === "legal" && (
          <div className="space-y-3">
            <div className="bg-white rounded-3xl p-5 border border-zinc-200/80 border-l-4 border-l-[#FF6A00] shadow-xs">
              <div className="flex items-center gap-2 text-xs font-black text-zinc-900 mb-1.5">
                <FileText className="w-4 h-4 text-[#FF6A00] shrink-0" />
                <span>Ley Orgánica de Defensa del Consumidor (LODC)</span>
              </div>
              <p className="text-xs text-zinc-700 font-semibold mb-2">
                Artículo 46: Devolución de lo Pagado
              </p>
              <blockquote className="text-xs text-zinc-600 bg-zinc-50 p-3 rounded-2xl border-l-2 border-[#FF6A00] italic leading-relaxed">
                "En caso de que el proveedor no proporcione el bien o servicio contratado, o cuando las condiciones pactadas no fueren satisfechas, el consumidor tendrá derecho a la restitución inmediata y total del valor pagado en dinero en efectivo o acreditación según el medio utilizado."
              </blockquote>
              <p className="text-xs text-zinc-600 mt-2.5 leading-relaxed">
                Rapidy garantiza el cumplimiento estricto del Artículo 46 y demás disposiciones de la normativa de consumo ecuatoriana, asegurando la transparencia en cada orden emitida en el territorio nacional.
              </p>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-zinc-200/80 shadow-xs">
              <h3 className="text-xs font-black text-zinc-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Landmark className="w-4 h-4 text-[#FF6A00]" />
                Supervisión Regulatoria Nacional
              </h3>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Las operaciones de intermediación tecnológica y los flujos financieros de pago y reintegro cumplen con los estándares de la <strong>Superintendencia de Bancos del Ecuador</strong>, el <strong>Banco Central del Ecuador (BCE)</strong> y el <strong>Servicio de Rentas Internas (SRI)</strong> para la debida facturación electrónica.
              </p>
            </div>

            {/* Enlace al Libro de Reclamaciones */}
            <button
              onClick={() => navigate("/defensa-del-consumidor")}
              className="w-full bg-white border border-zinc-200/80 hover:border-[#FF6A00]/50 rounded-2xl p-4 flex items-center justify-between text-left shadow-xs hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#FF6A00]/15 flex items-center justify-center text-[#FF6A00] group-hover:scale-105 transition-transform">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-black tracking-wider text-[#FF6A00] block">
                    Libro Digital de Reclamaciones
                  </span>
                  <span className="text-xs font-bold text-zinc-900">
                    Defensa del Consumidor Ecuador
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-[#FF6A00] group-hover:translate-x-0.5 transition-all" />
            </button>
          </div>
        )}

        {/* Footer legal */}
        <div className="text-center pt-3 pb-6">
          <div className="flex items-center justify-center gap-1.5 text-xs text-zinc-400">
            <ShieldCheck className="w-4 h-4 text-[#FF6A00]" />
            <span>Garantía de Satisfacción LODC • Rapidy Ecuador</span>
          </div>
          <p className="text-[11px] text-zinc-400 mt-1">
            Supervisado por la normativa de comercio electrónico y protección al consumidor de la República del Ecuador.
          </p>
        </div>
      </main>
    </div>
  );
}
