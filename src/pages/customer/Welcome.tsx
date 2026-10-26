import { useNavigate } from "react-router";
import { Truck, Clock, Star } from "lucide-react";

export default function Welcome() {
  const navigate = useNavigate();

  return (
    <div className="mobile-container bg-white min-h-screen flex flex-col pt-safe pb-safe">
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center py-4">
        <img
          src="/logotipo.jpeg"
          alt="YA LLEGA"
          className="w-24 h-24 sm:w-28 sm:h-28 object-contain mb-4 rounded-2xl shadow-sm"
        />
        <h1 className="text-3xl sm:text-4xl font-bold text-[#2E7D32] mb-1.5 tracking-tight">
          YA LLEGA
        </h1>
        <p className="text-gray-500 text-sm sm:text-base mb-6 max-w-xs">
          Todo lo que necesitás, a un toque de distancia
        </p>

        {/* Features */}
        <div className="grid grid-cols-3 gap-3 sm:gap-6 w-full max-w-xs mb-8">
          <div className="flex flex-col items-center gap-1.5">
            <div className="w-12 h-12 sm:w-14 sm:h-14 bg-[#2E7D32] rounded-2xl flex items-center justify-center shadow-sm">
              <Truck className="w-6 h-6 text-white" />
            </div>
            <span className="text-gray-700 text-xs sm:text-sm font-medium">Envío rápido</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <div className="w-12 h-12 sm:w-14 sm:h-14 bg-[#2E7D32] rounded-2xl flex items-center justify-center shadow-sm">
              <Clock className="w-6 h-6 text-white" />
            </div>
            <span className="text-gray-700 text-xs sm:text-sm font-medium">En minutos</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <div className="w-12 h-12 sm:w-14 sm:h-14 bg-[#2E7D32] rounded-2xl flex items-center justify-center shadow-sm">
              <Star className="w-6 h-6 text-white" />
            </div>
            <span className="text-gray-700 text-xs sm:text-sm font-medium">Calidad</span>
          </div>
        </div>
      </div>

      <div className="px-6 pb-6 space-y-3">
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
