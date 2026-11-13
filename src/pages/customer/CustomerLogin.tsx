/**
 * @archivo src/pages/customer/CustomerLogin.tsx
 * @modulo 01-identity-and-auth (Acceso Directo de Clientes)
 * @proposito
 *   Pantalla de inicio de sesión simplificada para clientes finales de Rapidy.
 *   Permite el acceso rápido mediante número telefónico internacional,
 *   recupera la sesión persistente y redirige al catálogo principal (`/home`).
 *
 * @resumen_contenido
 *   - Componente `CustomerLogin`: Tarjeta de cristal flotante con efecto *Glassmorphism*,
 *     fondo interactivo `RapidyCanvas`, selector de código de país y entrada de celular.
 *   - Manejador `handleLogin`: Valida y envía el teléfono al procedimiento `customer.login`.
 *
 * @dependencias_internas
 *   - `RapidyCanvas` (@/components/RapidyCanvas)
 *   - `PhoneInput` (@/components/PhoneInput)
 *   - `useCustomerSession` (@/hooks/useCustomerSession)
 *   - `trpcMutate` (@/hooks/useDeliveryData)
 *
 * @dependencias_externas
 *   - `lucide-react` (iconografía de interfaz y navegación)
 *   - `react-router` (enrutamiento cliente)
 *
 * @tablas_bd_o_redis
 *   - PostgreSQL (Neon): `customers` (Búsqueda por teléfono o coincidencia difusa)
 */

import { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import { useCustomerSession } from "@/hooks/useCustomerSession";
import { trpcMutate } from "@/hooks/useDeliveryData";
import PhoneInput from "@/components/PhoneInput";
import RapidyCanvas from "@/components/RapidyCanvas";

export default function CustomerLogin() {
  const navigate = useNavigate();
  const { login } = useCustomerSession();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!phone.trim()) {
      setError("Por favor ingresa tu número de celular");
      return;
    }
    setLoading(true);
    try {
      const result: any = await trpcMutate("customer.login", { phone: phone.trim() });
      if (result?.success && result.customer) {
        login(result.customer);
        localStorage.setItem("qs_session", JSON.stringify({ role: "customer", ts: Date.now() }));
        navigate("/home");
      } else {
        setError("No encontramos una cuenta con ese número. ¡Regístrate gratis!");
      }
    } catch {
      setError("Error de conexión al servidor. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 w-full h-[100dvh] max-h-[100dvh] bg-[#0A0A0D] overflow-hidden flex items-center justify-center p-3 sm:p-6 select-none">
      {/* Living Interactive Constellation Canvas */}
      <RapidyCanvas />

      {/* Floating Glassmorphic Authentication Card */}
      <div className="relative z-10 w-full max-w-[430px] max-h-[96dvh] bg-[#141418]/75 backdrop-blur-2xl rounded-3xl border border-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.85)] p-6 sm:p-8 flex flex-col justify-between overflow-hidden ring-1 ring-white/5">
        
        {/* Subtle Top Specular Sheen */}
        <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#FF6A00]/40 to-transparent pointer-events-none" />

        {/* Top Header Bar */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate("/")}
            className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 text-white flex items-center justify-center hover:bg-white/10 active:scale-95 transition-all cursor-pointer backdrop-blur-md"
            aria-label="Volver"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>

          <div className="flex items-center gap-1.5 px-3 py-1 bg-white/5 border border-white/10 rounded-full backdrop-blur-md shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-[#FF6A00]" />
            <span className="text-[11px] font-black tracking-widest text-zinc-200 uppercase">
              Cliente Rapidy
            </span>
          </div>

          <div className="w-10" />
        </div>

        {/* Center Hero Section */}
        <div className="flex flex-col items-center text-center my-auto py-2">
          {/* 3D Radiant Rapidy Emblem */}
          <div className="relative mb-3 group cursor-pointer" onClick={() => navigate("/")}>
            <div className="absolute -inset-1.5 rounded-full bg-gradient-to-tr from-[#FF5E00] to-[#FFA000] opacity-50 blur-lg group-hover:opacity-80 transition-opacity duration-500 animate-pulse" />
            <div className="relative w-20 h-20 rounded-full p-1 bg-gradient-to-tr from-[#FF5E00] via-[#FF8500] to-[#FFB829] shadow-[0_0_35px_rgba(255,106,0,0.6)] ring-2 ring-white/20">
              <img
                src="/image.png"
                alt="Rapidy Emblem"
                className="w-full h-full rounded-full object-cover"
              />
            </div>
          </div>

          {/* Sculptural Typography */}
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight">
            Iniciar Sesión
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-xs mx-auto mt-1 leading-relaxed">
            Ingresa tu número de celular para ordenar y rastrear en vivo en <span className="text-[#FF6A00] font-bold">Rapidy</span>
          </p>

          {/* Error Banner */}
          {error && (
            <div className="w-full mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-400 text-xs font-semibold animate-in fade-in duration-200">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="w-full mt-4 space-y-4 text-left">
            <PhoneInput
              value={phone}
              onChange={(v) => setPhone(v)}
              dark={true}
              error={error}
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full h-13 sm:h-14 bg-gradient-to-r from-[#FF5E00] via-[#FF6A00] to-[#FF8500] hover:brightness-110 active:scale-[0.98] text-white font-black text-sm sm:text-base tracking-wider uppercase rounded-2xl shadow-[0_8px_30px_rgba(255,106,0,0.45)] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 touch-target"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Continuar</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Registration Prompt */}
          <div className="mt-4 text-center text-xs sm:text-sm text-zinc-400">
            ¿Primera vez en Rapidy?{" "}
            <button
              type="button"
              onClick={() => navigate("/register")}
              className="text-[#FF6A00] font-bold hover:underline transition-colors cursor-pointer ml-1"
            >
              Crear cuenta gratis
            </button>
          </div>
        </div>

        {/* Footer Link */}
        <div className="pt-3 border-t border-white/5 text-center">
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            ¿Eres comercio, repartidor o administrador?{" "}
            <span className="text-[#FF6A00] font-semibold underline ml-1">Portal de Socios</span>
          </button>
        </div>

      </div>
    </div>
  );
}
