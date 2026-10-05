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
} from "lucide-react";

export default function LegalHub() {
  const navigate = useNavigate();

  const legalDocuments = [
    {
      title: "Términos y Condiciones",
      description: "Reglas de la app, precios, comercios y repartidores en Ecuador y Argentina.",
      path: "/terminos-y-condiciones",
      icon: FileText,
      badge: "General",
      iconBg: "bg-green-100 text-[#2E7D32]",
    },
    {
      title: "Política de Privacidad",
      description: "Tratamiento de datos, ubicación GPS en vivo y leyes LOPDP & 25.326.",
      path: "/politica-de-privacidad",
      icon: Shield,
      badge: "Privacidad",
      iconBg: "bg-emerald-100 text-emerald-700",
    },
    {
      title: "Cancelaciones y Reembolsos",
      description: "Tiempos de reintegro de dinero y protocolo ante demoras o faltantes.",
      path: "/politica-de-reembolso",
      icon: RefreshCw,
      badge: "Garantía",
      iconBg: "bg-teal-100 text-teal-700",
    },
    {
      title: "Botón de Arrepentimiento",
      description: "Mecanismo oficial de revocación conforme a la Res. 424/2020 de Argentina.",
      path: "/boton-de-arrepentimiento",
      icon: Undo2,
      badge: "🇦🇷 Argentina",
      iconBg: "bg-blue-100 text-blue-700",
    },
    {
      title: "Defensa del Consumidor",
      description: "Canales oficiales de reclamos de Ecuador y Argentina + Libro Digital.",
      path: "/defensa-del-consumidor",
      icon: Scale,
      badge: "Reclamos",
      iconBg: "bg-amber-100 text-amber-700",
    },
    {
      title: "Eliminación de Cuenta",
      description: "Solicitud directa de baja y borrado de datos (Google Play Data Safety).",
      path: "/eliminar-cuenta",
      icon: Trash2,
      badge: "Google Play",
      iconBg: "bg-red-100 text-red-600",
    },
  ];

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
            Transparencia & Legal
          </span>
          <span className="text-[11px] text-white/80">Ecuador & Argentina</span>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight mt-1">
          Centro Legal Ya Llega
        </h1>
        <p className="text-white/80 text-xs mt-0.5">
          Toda la documentación regulatoria y protección al usuario
        </p>
      </div>

      {/* Contenedor superpuesto -mt-4 */}
      <div className="px-4 -mt-4 space-y-3">
        
        {/* Tarjeta de bienvenida legal */}
        <div className="bg-white rounded-2xl card-shadow p-4">
          <p className="text-xs text-gray-600 leading-relaxed">
            En <strong>Ya Llega</strong> operamos con total apego a la legislación de comercio electrónico, protección al consumidor y resguardo de datos personales vigente en la <strong>República del Ecuador 🇪🇨</strong> y la <strong>República Argentina 🇦🇷</strong>.
          </p>
        </div>

        {/* Lista de enlaces estilo Ya Llega */}
        <div className="space-y-2">
          {legalDocuments.map((doc) => {
            const Icon = doc.icon;
            return (
              <button
                key={doc.path}
                onClick={() => navigate(doc.path)}
                className="w-full bg-white rounded-2xl card-shadow p-3.5 flex items-center justify-between text-left hover:bg-gray-50 transition-all active:scale-[0.99] group"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${doc.iconBg}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-xs font-bold text-gray-900 group-hover:text-[#2E7D32] transition-colors">
                        {doc.title}
                      </span>
                      <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-600">
                        {doc.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 line-clamp-1">
                      {doc.description}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-[#2E7D32] group-hover:translate-x-0.5 transition-all flex-shrink-0 ml-2" />
              </button>
            );
          })}
        </div>

        {/* Contacto directo soporte */}
        <div className="bg-white rounded-2xl card-shadow p-4 flex items-center justify-between mt-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-700">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-gray-900 block">Soporte y Consultas</span>
              <span className="text-[11px] text-gray-500">soporte@yallega.app</span>
            </div>
          </div>
          <a
            href="mailto:soporte@yallega.app"
            className="px-3 py-1.5 bg-[#2E7D32]/10 text-[#2E7D32] rounded-xl text-xs font-semibold hover:bg-[#2E7D32]/20 transition-colors"
          >
            Contactar
          </a>
        </div>

        {/* Footer */}
        <div className="text-center pt-4 pb-6">
          <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
            <ShieldCheck className="w-4 h-4 text-[#2E7D32]" />
            <span>Ya Llega App • Transparencia garantizada</span>
          </div>
        </div>

      </div>
    </div>
  );
}
