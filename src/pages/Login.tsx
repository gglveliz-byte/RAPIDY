/**
 * @archivo src/pages/Login.tsx
 * @modulo 01-identity-and-auth (Portal Profesional de Socios, Comercios y Repartidores)
 * @proposito
 *   Punto de acceso único y unificado para el personal operativo de Rapidy:
 *   Administradores generales, Comercios afiliados y Repartidores de última milla.
 *   Permite autenticación por Correo Electrónico (Admin/Merchant) y Celular (Driver).
 *
 * @resumen_contenido
 *   - Componente `Login`: Selector de pestaña interactivo entre modo Email y Celular,
 *     motor visual `RapidyCanvas` a 60 FPS, visor seguro de contraseña y despacho de sesión.
 *   - Manejador `handleLogin`: Valida las credenciales contra `login.login` y redirige
 *     al panel respectivo (`/admin`, `/commerce` o `/driver`).
 *
 * @dependencias_internas
 *   - `RapidyCanvas` (@/components/RapidyCanvas)
 *   - `PhoneInput` (@/components/PhoneInput)
 *   - `trpcMutate` (@/hooks/useDeliveryData)
 *
 * @dependencias_externas
 *   - `lucide-react` (iconografía de seguridad, correo y visibilidad)
 *   - `react-router` (redirección protegida por roles)
 *
 * @tablas_bd_o_redis
 *   - PostgreSQL (Neon): `users` (Admin/Merchant) y `drivers` (Repartidores)
 */

import { useState } from "react";
import { useNavigate } from "react-router";
import { Mail, Lock, ArrowLeft, Shield, Briefcase, Eye, EyeOff } from "lucide-react";
import PhoneInput from "@/components/PhoneInput";
import RapidyCanvas from "@/components/RapidyCanvas";
import { trpcMutate } from "@/hooks/useDeliveryData";
import { setRoleUser, setSession, type AppRole } from "@/hooks/useSessionSync";

export default function Login() {
  const navigate = useNavigate();
  const [loginType, setLoginType] = useState<"email" | "phone">("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!password.trim()) {
      setError("La contraseña es obligatoria");
      return;
    }
    setLoading(true);
    try {
      const input: any = { password };
      if (loginType === "email") {
        if (!email.trim()) {
          setError("El correo electrónico es requerido");
          setLoading(false);
          return;
        }
        input.email = email.trim();
      } else {
        if (!phone.trim()) {
          setError("El número de teléfono es requerido");
          setLoading(false);
          return;
        }
        input.phone = phone.trim();
      }

      const result = await trpcMutate<any>("login.login", input);

      if (result?.success) {
        const role = result.role as AppRole;
        if (!["admin", "driver", "merchant", "customer"].includes(role)) {
          setError("Este tipo de cuenta no tiene acceso al panel profesional.");
          return;
        }
        if (result.user) {
          setRoleUser(role, result.user);
          setSession(role, result.user.id);
        }
        if (role === "admin") navigate("/admin");
        else if (role === "driver") navigate("/driver");
        else if (role === "merchant") navigate("/commerce");
        else navigate("/home");
      } else {
        setError(result?.message || "Credenciales incorrectas. Verifica tus datos.");
      }
    } catch {
      setError("Error de conexión al servidor");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 w-full h-[100dvh] max-h-[100dvh] bg-[#0A0A0D] overflow-hidden flex items-center justify-center p-3 sm:p-6 select-none">
      {/* Living Interactive Constellation Canvas */}
      <RapidyCanvas />

      {/* Floating Glassmorphic Authentication Card */}
      <div className="relative z-10 w-full max-w-[430px] max-h-[96dvh] bg-[#141418]/75 backdrop-blur-2xl rounded-3xl border border-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.85)] p-5 sm:p-7 flex flex-col justify-between overflow-y-auto no-scrollbar ring-1 ring-white/5">
        
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
          
          <div className="flex items-center gap-1.5 px-3 py-1 bg-white/5 border border-white/10 rounded-full backdrop-blur-md">
            <Briefcase className="w-3.5 h-3.5 text-[#FF6A00]" />
            <span className="text-[11px] font-black tracking-widest text-zinc-200 uppercase">
              Portal Socios
            </span>
          </div>
          
          <div className="w-10" />
        </div>

        {/* Content Box */}
        <div className="flex flex-col items-center text-center my-auto py-2">
          {/* Rapidy Emblem */}
          <div className="relative mb-3 group cursor-pointer" onClick={() => navigate("/")}>
            <div className="absolute -inset-1.5 rounded-full bg-gradient-to-tr from-[#FF5E00] to-[#FFA000] opacity-50 blur-lg group-hover:opacity-80 transition-opacity duration-500 animate-pulse" />
            <div className="relative w-16 h-16 rounded-full p-1 bg-gradient-to-tr from-[#FF5E00] via-[#FF8500] to-[#FFB829] shadow-[0_0_30px_rgba(255,106,0,0.5)] ring-2 ring-white/20">
              <img
                src="/image.png"
                alt="Rapidy Emblem"
                className="w-full h-full rounded-full object-cover"
              />
            </div>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight">
            Acceso Profesional
          </h1>
          <p className="text-xs text-zinc-400 max-w-xs mt-1 mb-4">
            Administración, Comercios Aliados y Repartidores
          </p>

          {/* Type Selector (Pills) */}
          <div className="w-full bg-[#1F1F24] p-1 rounded-2xl flex border border-white/10 mb-4">
            <button
              type="button"
              onClick={() => { setLoginType("email"); setError(""); }}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                loginType === "email"
                  ? "bg-[#FF6A00] text-white shadow-[0_2px_12px_rgba(255,106,0,0.4)]"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Email (Admin / Comercio)</span>
            </button>
            <button
              type="button"
              onClick={() => { setLoginType("phone"); setError(""); }}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                loginType === "phone"
                  ? "bg-[#FF6A00] text-white shadow-[0_2px_12px_rgba(255,106,0,0.4)]"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Celular (Repartidor)</span>
            </button>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="w-full mb-3 p-3 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-400 text-xs font-semibold animate-in fade-in duration-200">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="w-full space-y-3.5 text-left">
            {loginType === "email" ? (
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-300 mb-1.5 block">
                  Correo Electrónico
                </label>
                <div className="relative flex rounded-2xl bg-[#242426] border border-white/10 focus-within:border-[#FF6A00] focus-within:ring-2 focus-within:ring-[#FF6A00]/25 transition-all">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu-correo@empresa.com"
                    autoComplete="username"
                    maxLength={320}
                    required
                    className="w-full h-12 sm:h-13 pl-11 pr-4 bg-transparent text-white placeholder-zinc-500 text-sm font-medium outline-none rounded-2xl"
                  />
                </div>
              </div>
            ) : (
              <PhoneInput
                value={phone}
                onChange={(v) => setPhone(v)}
                dark={true}
                error={error}
              />
            )}

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-300 mb-1.5 block">
                Contraseña
              </label>
              <div className="relative flex rounded-2xl bg-[#242426] border border-white/10 focus-within:border-[#FF6A00] focus-within:ring-2 focus-within:ring-[#FF6A00]/25 transition-all">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  maxLength={200}
                  required
                  className="w-full h-12 sm:h-13 pl-11 pr-11 bg-transparent text-white placeholder-zinc-500 text-sm font-medium outline-none rounded-2xl"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-13 sm:h-14 mt-1 bg-gradient-to-r from-[#FF5E00] via-[#FF6A00] to-[#FF8500] hover:brightness-110 active:scale-[0.98] text-white font-black text-sm sm:text-base tracking-wider uppercase rounded-2xl shadow-[0_6px_24px_rgba(255,106,0,0.45)] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 touch-target"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <span>Ingresar al Panel</span>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-white/5 text-center">
          <button
            type="button"
            onClick={() => navigate("/customer-login")}
            className="text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            ¿Eres cliente?{" "}
            <span className="text-[#FF6A00] font-semibold underline ml-1">Iniciar sesión como cliente</span>
          </button>
        </div>

      </div>
    </div>
  );
}
