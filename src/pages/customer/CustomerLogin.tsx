import { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Sparkles, LogIn } from "lucide-react";
import { useCustomerSession } from "@/hooks/useCustomerSession";
import { trpcMutate } from "@/hooks/useDeliveryData";
import PhoneInput from "@/components/PhoneInput";

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
        setError("No encontramos una cuenta con ese número. ¡Regístrate primero!");
      }
    } catch {
      setError("Error de conexión. Inténtalo de nuevo en unos momentos.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-[#121212] flex items-center justify-center sm:p-4 select-none">
      <div className="relative w-full min-h-[100dvh] sm:min-h-[auto] max-w-md bg-[#1C1C1C] text-white flex flex-col justify-between p-6 sm:p-8 overflow-hidden shadow-2xl sm:rounded-3xl border sm:border-white/10">
        
        {/* Ambient Top Glow */}
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-72 h-72 bg-[#FF6A00]/15 rounded-full blur-3xl pointer-events-none" />

        {/* Top Bar with Back Button and Brand */}
        <div className="relative z-10 flex items-center justify-between mb-4">
          <button
            onClick={() => navigate("/")}
            className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 text-white flex items-center justify-center hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          
          <div className="flex items-center gap-1.5 px-3 py-1 bg-white/5 border border-white/10 rounded-full">
            <Sparkles className="w-3.5 h-3.5 text-[#FF6A00]" />
            <span className="text-xs font-bold tracking-wider text-white uppercase">Acceso Clientes</span>
          </div>
          
          <div className="w-11" />
        </div>

        {/* Header / Brand Emblem */}
        <div className="relative z-10 flex flex-col items-center text-center my-auto py-4">
          <div className="relative mb-4">
            <div className="w-20 h-20 rounded-full p-1 bg-gradient-to-tr from-[#FF5E00] to-[#FF9E00] shadow-[0_0_30px_rgba(255,106,0,0.35)]">
              <img
                src="/image.png"
                alt="Rapidy Emblem"
                className="w-full h-full rounded-full object-cover"
              />
            </div>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-2">
            ¡Bienvenido de vuelta!
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-xs leading-relaxed">
            Ingresa tu número de celular para continuar con tus pedidos en <strong className="text-white font-bold">Rapidy</strong>
          </p>

          {/* Error Banner */}
          {error && (
            <div className="w-full mt-4 p-3.5 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-400 text-xs font-medium animate-in fade-in duration-200">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="w-full mt-6 space-y-5 text-left">
            <PhoneInput
              value={phone}
              onChange={(v) => setPhone(v)}
              dark={true}
              error={error}
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full h-14 bg-gradient-to-r from-[#FF5E00] to-[#FF7A00] hover:from-[#ff6b14] hover:to-[#ff8514] active:scale-[0.98] text-white font-black text-base tracking-wider uppercase rounded-2xl shadow-[0_4px_24px_rgba(255,106,0,0.5)] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 touch-target"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn className="w-5 h-5" />
                  <span>Ingresar a Rapidy</span>
                </>
              )}
            </button>
          </form>

          {/* Register Prompt */}
          <div className="mt-6 text-center text-xs sm:text-sm text-zinc-400">
            ¿Aún no tienes una cuenta?{" "}
            <button
              type="button"
              onClick={() => navigate("/register")}
              className="text-[#FF6A00] font-bold hover:underline transition-colors cursor-pointer ml-1"
            >
              Regístrate aquí
            </button>
          </div>
        </div>

        {/* Footer: Partner Switch Link */}
        <div className="relative z-10 pt-4 border-t border-white/5 text-center">
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            ¿Eres comercio, repartidor o administrador?{" "}
            <span className="text-[#FF6A00] font-semibold underline">Portal de Socios</span>
          </button>
        </div>

      </div>
    </div>
  );
}
