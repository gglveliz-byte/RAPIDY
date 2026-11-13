import { useNavigate } from "react-router";
import { Clock, Timer, ShieldCheck } from "lucide-react";

export default function Welcome() {
  const navigate = useNavigate();

  return (
    <div className="mobile-container relative min-h-[100dvh] bg-[#1C1C1C] flex flex-col justify-between overflow-x-hidden select-none">
      {/* Background Hero Image (Motorcycle rider + city, fading seamlessly to #1C1C1C) */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <img
          src="/welcome-clean-bg.jpg"
          alt="Rapidy Hero Background"
          className="w-full h-full object-cover object-top"
        />
        {/* Subtle gradient to ensure bottom content readability on any viewport */}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#1C1C1C] via-[#1C1C1C]/90 to-transparent" />
      </div>

      {/* Top spacer (leaves room for the top logo and rider in the background) */}
      <div className="relative z-10 flex-1 min-h-[38vh] sm:min-h-[42vh]" />

      {/* Bottom Content Area: Logo, Slogan, Feature Pills, and Interactive Buttons */}
      <div className="relative z-10 w-full px-6 pb-6 pt-2 flex flex-col items-center">
        {/* Stylized Brand Logo */}
        <div className="flex items-center justify-center tracking-tight mb-1.5">
          <span className="text-3xl sm:text-4xl font-black italic text-white tracking-wider">
            RAPID
          </span>
          <span className="text-3xl sm:text-4xl font-black italic text-[#FF6A00] tracking-wider">
            Y
          </span>
        </div>

        {/* Brand Slogan */}
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white text-center leading-tight tracking-tight max-w-xs mb-4">
          Todo lo que quieras,<br />en un solo pedido
        </h1>

        {/* 3 Distintivos Informativos (Pills) */}
        <div className="flex items-center justify-center gap-2 mb-6 w-full max-w-xs">
          <div className="bg-[#242424]/90 border border-white/10 px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm">
            <Clock className="w-3.5 h-3.5 text-[#FF7A00]" />
            <span className="text-[11px] sm:text-xs font-medium text-white/90 whitespace-nowrap">
              Envío rápido
            </span>
          </div>

          <div className="bg-[#242424]/90 border border-white/10 px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm">
            <Timer className="w-3.5 h-3.5 text-[#FF7A00]" />
            <span className="text-[11px] sm:text-xs font-medium text-white/90 whitespace-nowrap">
              En minutos
            </span>
          </div>

          <div className="bg-[#242424]/90 border border-white/10 px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm">
            <ShieldCheck className="w-3.5 h-3.5 text-[#FF7A00]" />
            <span className="text-[11px] sm:text-xs font-medium text-white/90 whitespace-nowrap">
              Calidad
            </span>
          </div>
        </div>

        {/* Action Buttons & Links */}
        <div className="w-full max-w-sm space-y-3">
          {/* Botón Principal: CREAR CUENTA */}
          <button
            onClick={() => navigate("/register")}
            className="w-full h-14 bg-gradient-to-r from-[#FF5E00] to-[#FF7A00] hover:from-[#ff6b14] hover:to-[#ff8514] active:scale-[0.98] text-white font-black text-base tracking-wider uppercase rounded-full shadow-[0_4px_24px_rgba(255,106,0,0.5)] transition-all touch-target flex items-center justify-center cursor-pointer"
          >
            Crear cuenta
          </button>

          {/* Botón Secundario: INICIAR SESIÓN */}
          <button
            onClick={() => navigate("/customer-login")}
            className="w-full h-14 bg-transparent hover:bg-white/10 active:scale-[0.98] border-2 border-white text-white font-black text-base tracking-wider uppercase rounded-full transition-all touch-target flex items-center justify-center cursor-pointer backdrop-blur-xs"
          >
            Iniciar sesión
          </button>

          {/* Enlace para Socios / Repartidores */}
          <div className="pt-2 text-center">
            <button
              onClick={() => navigate("/login")}
              className="text-sm font-medium text-[#FF7A00] hover:text-[#ff9233] transition-colors cursor-pointer"
            >
              ¿Eres comercio o repartidor?{" "}
              <span className="underline font-semibold">Ingresa aquí</span>
            </button>
          </div>

          {/* Enlaces Legales Inferiores */}
          <div className="pt-4 text-center text-xs text-white/40 space-x-2">
            <button
              onClick={() => navigate("/terminos-y-condiciones")}
              className="hover:underline hover:text-white/70 transition-colors"
            >
              Términos
            </button>
            <span>•</span>
            <button
              onClick={() => navigate("/politica-de-privacidad")}
              className="hover:underline hover:text-white/70 transition-colors"
            >
              Privacidad
            </button>
            <span>•</span>
            <button
              onClick={() => navigate("/legal")}
              className="hover:underline hover:text-white/70 transition-colors"
            >
              Centro Legal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
