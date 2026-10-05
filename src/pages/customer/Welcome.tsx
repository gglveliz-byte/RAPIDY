import { useNavigate } from "react-router";
import { Truck, Clock, Star } from "lucide-react";

export default function Welcome() {
  const navigate = useNavigate();

  return (
    <div className="mobile-container bg-white min-h-screen flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <img
          src="/logotipo.jpeg"
          alt="YA LLEGA"
          className="w-28 h-28 object-contain mb-5 rounded-2xl"
        />
        <h1 className="text-4xl font-bold text-[#2E7D32] mb-2 tracking-tight">
          YA LLEGA
        </h1>
        <p className="text-gray-500 text-base mb-8">
          Todo lo que necesitás, a un toque de distancia
        </p>

        {/* Features */}
        <div className="grid grid-cols-3 gap-6 w-full max-w-xs mb-12">
          <div className="flex flex-col items-center gap-2">
            <div className="w-14 h-14 bg-[#2E7D32] rounded-2xl flex items-center justify-center">
              <Truck className="w-7 h-7 text-white" />
            </div>
            <span className="text-gray-700 text-sm font-medium">Envío rápido</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="w-14 h-14 bg-[#2E7D32] rounded-2xl flex items-center justify-center">
              <Clock className="w-7 h-7 text-white" />
            </div>
            <span className="text-gray-700 text-sm font-medium">En minutos</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="w-14 h-14 bg-[#2E7D32] rounded-2xl flex items-center justify-center">
              <Star className="w-7 h-7 text-white" />
            </div>
            <span className="text-gray-700 text-sm font-medium">Calidad</span>
          </div>
        </div>
      </div>

      <div className="px-8 pb-10 space-y-3">
        <button
          onClick={() => navigate("/register")}
          className="w-full h-14 bg-[#2E7D32] text-white font-semibold text-base rounded-2xl shadow-md hover:bg-[#1B5E20] active:scale-[0.98] transition-all touch-target"
        >
          Crear cuenta
        </button>
        <button
          onClick={() => navigate("/customer-login")}
          className="w-full h-12 bg-transparent text-[#2E7D32] font-medium text-sm rounded-2xl border border-[#2E7D32]/30 hover:bg-[#2E7D32]/5 active:scale-[0.98] transition-all touch-target"
        >
          Iniciar sesión
        </button>
        <button
          onClick={() => navigate("/login")}
          className="pt-4 w-full text-center text-sm text-gray-400 hover:text-[#2E7D32] transition-colors font-medium"
        >
          ¿Eres comercio o repartidor? <span className="underline">Ingresa aquí</span>
        </button>

        <div className="pt-2 text-center text-xs text-gray-400 space-x-2">
          <button onClick={() => navigate("/terminos-y-condiciones")} className="hover:underline hover:text-gray-600">
            Términos
          </button>
          <span>•</span>
          <button onClick={() => navigate("/politica-de-privacidad")} className="hover:underline hover:text-gray-600">
            Privacidad
          </button>
          <span>•</span>
          <button onClick={() => navigate("/legal")} className="hover:underline hover:text-gray-600">
            Centro Legal
          </button>
        </div>
      </div>
    </div>
  );
}
