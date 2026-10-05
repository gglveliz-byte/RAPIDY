import { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Lock, MapPin, Eye, Trash2, ShieldCheck, Globe, ChevronDown, ChevronUp } from "lucide-react";

export default function PrivacyPolicy() {
  const navigate = useNavigate();
  const [selectedCountry, setSelectedCountry] = useState<"all" | "ec" | "ar">("all");
  const [openSection, setOpenSection] = useState<number | null>(null);

  const toggle = (i: number) => setOpenSection(openSection === i ? null : i);

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
            Seguridad & Datos
          </span>
          <span className="text-[11px] text-white/80">Google Play Safe</span>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight mt-1">
          Política de Privacidad
        </h1>
        <p className="text-white/80 text-xs mt-0.5">
          Protección de Datos Personales • Ecuador y Argentina
        </p>
      </div>

      {/* Contenedor superpuesto -mt-4 */}
      <div className="px-4 -mt-4 space-y-3">
        
        {/* Selector de país estilo chips */}
        <div className="bg-white rounded-2xl card-shadow p-3.5">
          <span className="text-xs font-semibold text-gray-700 flex items-center gap-1.5 mb-2">
            <Globe className="w-3.5 h-3.5 text-[#2E7D32]" /> Régimen de Privacidad:
          </span>
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
              🇪🇨 Ecuador (LOPDP)
            </button>
            <button
              onClick={() => setSelectedCountry("ar")}
              className={`h-9 px-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center text-center ${
                selectedCountry === "ar"
                  ? "bg-[#2E7D32] text-white shadow-xs"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              🇦🇷 Argentina (AAIP)
            </button>
          </div>
        </div>

        {/* Datos recopilados */}
        <div className="bg-white rounded-2xl card-shadow p-4 border-l-4 border-[#2E7D32]">
          <h2 className="text-sm font-bold text-gray-900 mb-2">
            1. Datos que Recopilamos y Finalidad
          </h2>
          <div className="space-y-2">
            <div className="p-3 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-900 mb-1">
                <Eye className="w-3.5 h-3.5 text-[#2E7D32]" />
                <span>Identificación y Contacto</span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                Nombre, apellido, número de teléfono y dirección para coordinar y despachar tus entregas.
              </p>
            </div>

            <div className="p-3 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-900 mb-1">
                <MapPin className="w-3.5 h-3.5 text-[#2E7D32]" />
                <span>Geolocalización en Tiempo Real</span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                Ubicación GPS mientras la aplicación está en uso para ubicar comercios cercanos, calcular el costo exacto de delivery y permitir que el cliente siga la ruta de su pedido en el mapa.
              </p>
            </div>
          </div>
        </div>

        {/* Compartición de datos */}
        <div className="bg-white rounded-2xl card-shadow p-4">
          <h2 className="text-sm font-bold text-gray-900 mb-1">
            2. Uso y Cero Venta de Información
          </h2>
          <p className="text-xs text-gray-600 leading-relaxed">
            <strong>Ya Llega no vende ni alquila tus datos personales a empresas de publicidad.</strong> Tu información solo se transmite al comercio aliado (para preparar tu pedido) y al repartidor independiente asignado (para la entrega física).
          </p>
        </div>

        {/* Marco normativo Ecuador */}
        {(selectedCountry === "all" || selectedCountry === "ec") && (
          <div className="bg-green-50/70 border border-green-200 rounded-2xl card-shadow p-4">
            <h2 className="text-xs font-bold text-green-950 flex items-center gap-1.5 mb-1">
              <span>🇪🇨</span> Derechos LOPDP de la República del Ecuador
            </h2>
            <p className="text-xs text-green-900/90 leading-relaxed">
              Conforme a la <strong>Ley Orgánica de Protección de Datos Personales</strong>, puedes ejercer tus derechos ARCO (Acceso, Rectificación, Cancelación y Oposición) directamente o solicitar el borrado de tu cuenta en <button onClick={() => navigate("/eliminar-cuenta")} className="underline font-bold text-green-950">/eliminar-cuenta</button>.
            </p>
          </div>
        )}

        {/* Marco normativo Argentina */}
        {(selectedCountry === "all" || selectedCountry === "ar") && (
          <div className="bg-blue-50/70 border border-blue-200 rounded-2xl card-shadow p-4">
            <h2 className="text-xs font-bold text-blue-950 flex items-center gap-1.5 mb-1">
              <span>🇦🇷</span> Ley 25.326 y AAIP de la República Argentina
            </h2>
            <p className="text-xs text-blue-900/90 leading-relaxed">
              El titular tiene la facultad de ejercer el derecho de acceso en forma gratuita conforme al Art. 14 inc. 3 de la Ley 25.326. La <strong>Agencia de Acceso a la Información Pública (AAIP)</strong> es el Órgano de Control facultado para recibir denuncias sobre protección de datos.
            </p>
          </div>
        )}

        {/* Botón para solicitar eliminación */}
        <div className="bg-white rounded-2xl card-shadow p-4 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-gray-900">¿Deseas dar de baja tu cuenta?</h3>
            <p className="text-[11px] text-gray-500">Puedes solicitar el borrado definitivo de tus datos en cualquier momento.</p>
          </div>
          <button
            onClick={() => navigate("/eliminar-cuenta")}
            className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors flex-shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Eliminar</span>
          </button>
        </div>

        {/* Acordeones informativos */}
        <div className="bg-white rounded-2xl card-shadow overflow-hidden">
          <button
            onClick={() => toggle(1)}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
          >
            <span className="text-xs font-bold text-gray-900">
              3. Medidas de Seguridad y Cifrado
            </span>
            {openSection === 1 ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
          {openSection === 1 && (
            <div className="px-4 pb-4 text-xs text-gray-600 border-t border-gray-100 pt-2 leading-relaxed">
              Utilizamos canales cifrados HTTPS/TLS en todas las transferencias de datos entre tu teléfono y nuestros servidores. Los accesos internos están protegidos por tokens de autenticación seguros.
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl card-shadow overflow-hidden">
          <button
            onClick={() => toggle(2)}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
          >
            <span className="text-xs font-bold text-gray-900">
              4. Contacto de Privacidad
            </span>
            {openSection === 2 ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
          {openSection === 2 && (
            <div className="px-4 pb-4 text-xs text-gray-600 border-t border-gray-100 pt-2 leading-relaxed">
              Para consultas legales o pedidos de rectificación de datos, puedes escribir a <strong className="text-gray-900">soporte@yallega.app</strong>. Respondemos en un plazo máximo de 48 horas hábiles.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center pt-4 pb-6">
          <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
            <ShieldCheck className="w-4 h-4 text-[#2E7D32]" />
            <span>Tus datos están protegidos en Ya Llega</span>
          </div>
        </div>

      </div>
    </div>
  );
}
