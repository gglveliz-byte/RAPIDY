import { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, ShieldCheck, ChevronDown, ChevronUp, Globe } from "lucide-react";

export default function TermsAndConditions() {
  const navigate = useNavigate();
  const [selectedCountry, setSelectedCountry] = useState<"all" | "ec" | "ar">("all");
  const [expandedSection, setExpandedSection] = useState<number | null>(null);

  const toggleSection = (idx: number) => {
    setExpandedSection(expandedSection === idx ? null : idx);
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
            Legal & Regulatorio
          </span>
          <span className="text-[11px] text-white/80">Versión 2.0</span>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight mt-1">
          Términos y Condiciones
        </h1>
        <p className="text-white/80 text-xs mt-0.5">
          Plataforma de Intermediación Tecnológica "Ya Llega"
        </p>
      </div>

      {/* Contenedor superpuesto -mt-4 idéntico al resto de la app */}
      <div className="px-4 -mt-4 space-y-3">
        
        {/* Selector de país estilo chips / pills de Ya Llega */}
        <div className="bg-white rounded-2xl card-shadow p-3.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-[#2E7D32]" /> Marco Normativo Aplicable:
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              onClick={() => setSelectedCountry("all")}
              className={`h-9 px-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center text-center ${
                selectedCountry === "all"
                  ? "bg-[#2E7D32] text-white shadow-xs"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              General
            </button>
            <button
              onClick={() => setSelectedCountry("ec")}
              className={`h-9 px-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center text-center ${
                selectedCountry === "ec"
                  ? "bg-[#2E7D32] text-white shadow-xs"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              🇪🇨 Ecuador
            </button>
            <button
              onClick={() => setSelectedCountry("ar")}
              className={`h-9 px-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center text-center ${
                selectedCountry === "ar"
                  ? "bg-[#2E7D32] text-white shadow-xs"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              🇦🇷 Argentina
            </button>
          </div>
        </div>

        {/* Resumen de naturaleza del servicio */}
        <div className="bg-white rounded-2xl card-shadow p-4 border-l-4 border-[#2E7D32]">
          <h2 className="text-sm font-bold text-gray-900">
            1. Naturaleza del Servicio y Objeto
          </h2>
          <p className="text-xs text-gray-600 mt-1 leading-relaxed">
            <strong>Ya Llega</strong> actúa exclusivamente como una plataforma tecnológica de intermediación que conecta a 
            <strong> usuarios consumidores</strong> con <strong>comercios gastronómicos/tiendas aliadas</strong> y 
            <strong> repartidores independientes</strong>.
          </p>
          <div className="bg-amber-50 rounded-xl p-2.5 mt-2.5 text-[11px] text-amber-900 border border-amber-200/70">
            <strong>Aviso importante:</strong> Ya Llega no produce, cocina, manipula ni empaqueta alimentos. La calidad, sabor, inocuidad y correcta entrega bromatológica es responsabilidad directa del comercio elaborador.
          </div>
        </div>

        {/* Cláusula 2: Capacidad y Registro */}
        <div className="bg-white rounded-2xl card-shadow p-4">
          <h2 className="text-sm font-bold text-gray-900">
            2. Capacidad Legal y Cuenta de Usuario
          </h2>
          <p className="text-xs text-gray-600 mt-1 leading-relaxed">
            Para ordenar a través de Ya Llega, debes ser mayor de 18 años y aportar datos verídicos (nombre, teléfono y dirección). Las credenciales de acceso son de uso personal e intransferible.
          </p>
        </div>

        {/* Cláusula 3: Precios y Medios de Pago */}
        <div className="bg-white rounded-2xl card-shadow p-4">
          <h2 className="text-sm font-bold text-gray-900">
            3. Precios, Costo de Envío y Pagos
          </h2>
          <ul className="text-xs text-gray-600 mt-2 space-y-1.5 list-disc pl-4">
            <li><strong>Precios:</strong> Los precios son fijados por cada comercio e incluyen los impuestos aplicables (IVA en Ecuador y Argentina).</li>
            <li><strong>Tarifa de entrega:</strong> Se calcula de manera transparente según la distancia hasta tu ubicación.</li>
            <li><strong>Medios de pago:</strong> Efectivo contra entrega al repartidor, transferencias o medios digitales habilitados en tu localidad.</li>
          </ul>
        </div>

        {/* Anexo Ecuador si está seleccionado */}
        {(selectedCountry === "all" || selectedCountry === "ec") && (
          <div className="bg-green-50/70 rounded-2xl border border-green-200 card-shadow p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-base">🇪🇨</span>
              <h2 className="text-sm font-bold text-green-950">
                Regulaciones de la República del Ecuador
              </h2>
            </div>
            <div className="text-xs text-green-900/90 space-y-1.5 leading-relaxed">
              <p>
                • <strong>Ley Orgánica de Defensa del Consumidor (LODC):</strong> Derecho a información clara y precios finales expresados en Dólares (USD).
              </p>
              <p>
                • <strong>Art. 45 LODC:</strong> Derecho a la restitución inmediata del importe abonado o reemplazo sin costo ante productos defectuosos, no entregados o en mal estado.
              </p>
              <p>
                • <strong>Protección de Datos (LOPDP):</strong> Tus datos están protegidos y puedes solicitar su acceso o eliminación en cualquier momento.
              </p>
            </div>
          </div>
        )}

        {/* Anexo Argentina si está seleccionado */}
        {(selectedCountry === "all" || selectedCountry === "ar") && (
          <div className="bg-blue-50/70 rounded-2xl border border-blue-200 card-shadow p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-base">🇦🇷</span>
              <h2 className="text-sm font-bold text-blue-950">
                Regulaciones de la República Argentina
              </h2>
            </div>
            <div className="text-xs text-blue-900/90 space-y-1.5 leading-relaxed">
              <p>
                • <strong>Ley N° 24.240 y CCCN:</strong> Relaciones de consumo transparentes y de buena fe.
              </p>
              <p>
                • <strong>Resolución 424/2020 (Botón de Arrepentimiento):</strong> Dispones de un canal visible para revocar la compra conforme al Art. 34 de la Ley 24.240 antes de que inicie la preparación gastronómica.
              </p>
              <p>
                • <strong>Organismo de Control:</strong> Dirección Nacional de Defensa del Consumidor (Línea Gratuita 0800-666-1518).
              </p>
            </div>
          </div>
        )}

        {/* Cláusula 4: Desplegable con resto de términos */}
        <div className="bg-white rounded-2xl card-shadow overflow-hidden">
          <button
            onClick={() => toggleSection(1)}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
          >
            <span className="text-xs font-bold text-gray-900">
              4. Responsabilidad por Alimentos y Alérgenos
            </span>
            {expandedSection === 1 ? (
              <ChevronUp className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-500" />
            )}
          </button>
          {expandedSection === 1 && (
            <div className="px-4 pb-4 text-xs text-gray-600 border-t border-gray-100 pt-2 leading-relaxed">
              Los comercios afiliados son responsables de indicar los ingredientes y advertencias de alérgenos (celiaquía, frutos secos, mariscos, etc.). Si tienes alguna condición alimentaria específica, debes aclararla en las notas del pedido antes de confirmar.
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl card-shadow overflow-hidden">
          <button
            onClick={() => toggleSection(2)}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
          >
            <span className="text-xs font-bold text-gray-900">
              5. Tiempos de Entrega y Tolerancia
            </span>
            {expandedSection === 2 ? (
              <ChevronUp className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </button>
          {expandedSection === 2 && (
            <div className="px-4 pb-4 text-xs text-gray-600 border-t border-gray-100 pt-2 leading-relaxed">
              Los tiempos mostrados en la app son estimaciones aproximadas basadas en el tráfico y cocina. El repartidor esperará un máximo de 10 minutos en el domicilio antes de considerar el pedido ausente por causa imputable al cliente.
            </div>
          )}
        </div>

        {/* Acceso a otros documentos */}
        <div className="pt-4 flex flex-wrap gap-2 justify-center text-xs">
          <button
            onClick={() => navigate("/politica-de-privacidad")}
            className="px-3 py-1.5 rounded-xl bg-white border border-gray-200 text-[#2E7D32] font-medium hover:bg-gray-50"
          >
            Privacidad
          </button>
          <button
            onClick={() => navigate("/politica-de-reembolso")}
            className="px-3 py-1.5 rounded-xl bg-white border border-gray-200 text-[#2E7D32] font-medium hover:bg-gray-50"
          >
            Reembolsos
          </button>
          <button
            onClick={() => navigate("/legal")}
            className="px-3 py-1.5 rounded-xl bg-white border border-gray-200 text-gray-700 font-medium hover:bg-gray-50"
          >
            Centro Legal Completo
          </button>
        </div>

        <div className="text-center pt-2 pb-6">
          <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
            <ShieldCheck className="w-4 h-4 text-[#2E7D32]" />
            <span>Ya Llega App • Todos los derechos reservados</span>
          </div>
        </div>

      </div>
    </div>
  );
}
