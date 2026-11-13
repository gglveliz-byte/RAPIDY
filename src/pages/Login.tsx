import { useState } from "react";
import { useNavigate } from "react-router";
import { Mail, Lock, ArrowLeft, Shield, Briefcase, Eye, EyeOff } from "lucide-react";
import PhoneInput from "@/components/PhoneInput";
import { trpcMutate } from "@/hooks/useDeliveryData";

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
        const role = result.role;
        if (result.user && role === "merchant") {
          localStorage.setItem("merchant_user", JSON.stringify(result.user));
        }
        if (result.user && role === "driver") {
          localStorage.setItem("driver_user", JSON.stringify(result.user));
        }
        localStorage.setItem("qs_session", JSON.stringify({ role, ts: Date.now() }));
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
    <div className="min-h-[100dvh] w-full bg-[#121212] flex items-center justify-center sm:p-4 select-none">
      <div className="relative w-full min-h-[100dvh] sm:min-h-[auto] max-w-md bg-[#1C1C1C] text-white flex flex-col justify-between p-6 sm:p-8 overflow-hidden shadow-2xl sm:rounded-3xl border sm:border-white/10">
        
        {/* Ambient Top Glow */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-80 bg-[#FF6A00]/15 rounded-full blur-3xl pointer-events-none" />

        {/* Top Header */}
        <div className="relative z-10 flex items-center justify-between mb-2">
          <button
            onClick={() => navigate("/")}
            className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 text-white flex items-center justify-center hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          
          <div className="flex items-center gap-1.5 px-3 py-1 bg-white/5 border border-white/10 rounded-full">
            <Briefcase className="w-3.5 h-3.5 text-[#FF6A00]" />
            <span className="text-xs font-bold tracking-wider text-white uppercase">Portal Socios</span>
          </div>
          
          <div className="w-11" />
        </div>

        {/* Content Box */}
        <div className="relative z-10 flex flex-col items-center text-center my-auto py-2">
          {/* Rapidy Emblem */}
          <div className="relative mb-3">
            <div className="w-16 h-16 rounded-full p-1 bg-gradient-to-tr from-[#FF5E00] to-[#FF9E00] shadow-[0_0_25px_rgba(255,106,0,0.35)]">
              <img
                src="/image.png"
                alt="Rapidy Emblem"
                className="w-full h-full rounded-full object-cover"
              />
            </div>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-1">
            Acceso Profesional
          </h1>
          <p className="text-xs text-zinc-400 max-w-xs mb-5">
            Administración, Comercios Aliados y Repartidores
          </p>

          {/* Type Selector (Pills) */}
          <div className="w-full bg-[#242426] p-1 rounded-2xl flex border border-white/10 mb-5">
            <button
              type="button"
              onClick={() => { setLoginType("email"); setError(""); }}
              className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                loginType === "email"
                  ? "bg-[#FF6A00] text-white shadow-md"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Email (Admin / Comercio)</span>
            </button>
            <button
              type="button"
              onClick={() => { setLoginType("phone"); setError(""); }}
              className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                loginType === "phone"
                  ? "bg-[#FF6A00] text-white shadow-md"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Celular (Repartidor)</span>
            </button>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="w-full mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-400 text-xs font-medium animate-in fade-in duration-200">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="w-full space-y-4 text-left">
            {loginType === "email" ? (
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-300 mb-2 block">
                  Correo Electrónico
                </label>
                <div className="relative flex rounded-2xl bg-[#242426] border border-white/10 focus-within:border-[#FF6A00] focus-within:ring-2 focus-within:ring-[#FF6A00]/25 transition-all">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@rapidy.app"
                    className="w-full h-13 sm:h-14 pl-11 pr-4 bg-transparent text-white placeholder-zinc-500 text-sm font-medium outline-none rounded-2xl"
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
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-300 mb-2 block">
                Contraseña
              </label>
              <div className="relative flex rounded-2xl bg-[#242426] border border-white/10 focus-within:border-[#FF6A00] focus-within:ring-2 focus-within:ring-[#FF6A00]/25 transition-all">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-13 sm:h-14 pl-11 pr-11 bg-transparent text-white placeholder-zinc-500 text-sm font-medium outline-none rounded-2xl"
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
              className="w-full h-14 mt-2 bg-gradient-to-r from-[#FF5E00] to-[#FF7A00] hover:from-[#ff6b14] hover:to-[#ff8514] active:scale-[0.98] text-white font-black text-base tracking-wider uppercase rounded-2xl shadow-[0_4px_24px_rgba(255,106,0,0.5)] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 touch-target"
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
        <div className="relative z-10 pt-4 border-t border-white/5 text-center">
          <button
            type="button"
            onClick={() => navigate("/customer-login")}
            className="text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            ¿Eres cliente?{" "}
            <span className="text-[#FF6A00] font-semibold underline">Iniciar sesión como cliente</span>
          </button>
        </div>

      </div>
    </div>
  );
}
