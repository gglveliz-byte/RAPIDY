import { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Clock, CheckCircle2, ShieldCheck, AlertTriangle, ChevronRight } from "lucide-react";

export default function RefundPolicy() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"general" | "problemas" | "reintegros">("general");

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
            Garantía Ya Llega
          </span>
          <span className="text-[11px] text-white/80">Protección al Consumidor</span>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight mt-1">
          Cancelaciones y Reembolsos
        </h1>
        <p className="text-white/80 text-xs mt-0.5">
          Términos de satisfacción en entregas y pedidos
        </p>
      </div>

      {/* Contenedor superpuesto -mt-4 */}
      <div className="px-4 -mt-4 space-y-3">
        
        {/* Selector de pestañas */}
        <div className="bg-white rounded-2xl card-shadow p-1.5 grid grid-cols-3 gap-1">
          <button
            onClick={() => setActiveTab("general")}
            className={`py-2 text-xs font-semibold rounded-xl transition-all ${
              activeTab === "general"
                ? "bg-[#2E7D32] text-white shadow-xs"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            Cancelación
          </button>
          <button
            onClick={() => setActiveTab("problemas")}
            className={`py-2 text-xs font-semibold rounded-xl transition-all ${
              activeTab === "problemas"
                ? "bg-[#2E7D32] text-white shadow-xs"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            Incidencias
          </button>
          <button
            onClick={() => setActiveTab("reintegros")}
            className={`py-2 text-xs font-semibold rounded-xl transition-all ${
              activeTab === "reintegros"
                ? "bg-[#2E7D32] text-white shadow-xs"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            Reintegros
          </button>
        </div>

        {activeTab === "general" && (
          <div className="space-y-3">
            <div className="bg-white rounded-2xl card-shadow p-4 border-l-4 border-green-500">
              <div className="flex items-center gap-1.5 text-xs font-bold text-green-900 mb-1">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span>Cancelación Sin Costo (100% Reembolso)</span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                Si cancelas el pedido <strong>antes de que el comercio comience a prepararlo</strong> (cuando aún está en estado "Pendiente"). No se genera cobro ni penalización alguna.
              </p>
            </div>

            <div className="bg-white rounded-2xl card-shadow p-4 border-l-4 border-amber-500">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900 mb-1">
                <Clock className="w-4 h-4 text-amber-600" />
                <span>Pedido en Preparación Gastronómica</span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                Una vez que la cocina inició la cocción de los alimentos perecederos hechos a tu medida, no es posible revocar o reembolsar la orden, conforme a las excepciones legales de productos de consumo perecedero inmediato.
              </p>
            </div>

            <div className="bg-white rounded-2xl card-shadow p-4">
              <h3 className="text-xs font-bold text-gray-900 mb-1">Cancelación por parte del Comercio</h3>
              <p className="text-xs text-gray-600 leading-relaxed">
                Si el local se queda sin stock o no puede procesar tu orden, el pedido se cancela de inmediato y se te reintegra el 100% de los fondos abonados.
              </p>
            </div>
          </div>
        )}

        {activeTab === "problemas" && (
          <div className="space-y-3">
            <div className="bg-white rounded-2xl card-shadow p-4">
              <h3 className="text-xs font-bold text-gray-900 mb-2">Protocolo ante fallas en la entrega:</h3>
              <ul className="text-xs text-gray-600 space-y-2">
                <li className="p-2.5 bg-gray-50 rounded-xl">
                  <strong>• Ítem o producto faltante:</strong> Reintegro proporcional del monto del producto que no llegó.
                </li>
                <li className="p-2.5 bg-gray-50 rounded-xl">
                  <strong>• Pedido erróneo o cambiado:</strong> Reenvío sin costo adicional del pedido correcto o restitución completa.
                </li>
                <li className="p-2.5 bg-gray-50 rounded-xl">
                  <strong>• Producto dañado o derramado:</strong> Reembolso íntegro tras enviar fotografía de evidencia por soporte.
                </li>
              </ul>
            </div>

            <div className="bg-red-50 rounded-2xl border border-red-200 card-shadow p-4">
              <div className="flex items-center gap-2 text-xs font-bold text-red-950 mb-1">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <span>Plazo para reportar problemas</span>
              </div>
              <p className="text-xs text-red-900/90 leading-relaxed">
                Los reclamos sobre alimentos preparados deben hacerse dentro de las <strong>2 horas posteriores a la entrega</strong> para garantizar la verificación con el restaurante.
              </p>
            </div>
          </div>
        )}

        {activeTab === "reintegros" && (
          <div className="space-y-3">
            <div className="bg-white rounded-2xl card-shadow p-4">
              <h3 className="text-xs font-bold text-gray-900 mb-2">Tiempos estimados de devolución:</h3>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl">
                  <span className="font-medium text-gray-800">Efectivo contra entrega</span>
                  <span className="font-bold text-[#2E7D32]">Anulación inmediata</span>
                </div>
                <div className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl">
                  <span className="font-medium text-gray-800">Transferencias</span>
                  <span className="font-semibold text-gray-700">24 a 48 hs hábiles</span>
                </div>
                <div className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl">
                  <span className="font-medium text-gray-800">Tarjetas de Débito/Crédito</span>
                  <span className="font-semibold text-gray-700">Según banco emisor</span>
                </div>
              </div>
            </div>

            {/* Enlace al botón de arrepentimiento */}
            <button
              onClick={() => navigate("/boton-de-arrepentimiento")}
              className="w-full bg-blue-50 border border-blue-200 rounded-2xl card-shadow p-4 flex items-center justify-between text-left hover:bg-blue-100/60 transition-colors"
            >
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-blue-700 block">Normativa Argentina</span>
                <span className="text-xs font-bold text-blue-950">Acceder al Botón de Arrepentimiento</span>
              </div>
              <ChevronRight className="w-4 h-4 text-blue-700" />
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="text-center pt-4 pb-6">
          <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
            <ShieldCheck className="w-4 h-4 text-[#2E7D32]" />
            <span>Compromiso de entrega garantizado • Ya Llega</span>
          </div>
        </div>

      </div>
    </div>
  );
}
