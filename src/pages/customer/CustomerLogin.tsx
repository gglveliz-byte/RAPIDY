import { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, ShoppingBag } from "lucide-react";
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
    if (!phone.trim()) { setError("Ingresá tu número de celular"); return; }
    setLoading(true);
    try {
      const result: any = await trpcMutate("customer.login", { phone: phone.trim() });
      if (result?.success && result.customer) {
        login(result.customer);
        localStorage.setItem("qs_session", JSON.stringify({ role: "customer", ts: Date.now() }));
        navigate("/home");
      } else {
        setError("No encontramos una cuenta con ese número. Registrate primero.");
      }
    } catch {
      setError("Error de conexión. Intentalo de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mobile-container bg-gray-50 min-h-screen flex flex-col pb-safe">
      <div className="bg-[#2E7D32] px-4 pt-safe pb-10 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <button 
            onClick={() => navigate("/")} 
            className="w-10 h-10 rounded-xl bg-white/15 text-white flex items-center justify-center active:scale-90 transition-transform"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-white" />
            <span className="text-white font-bold tracking-tight">YA LLEGA</span>
          </div>
          <div className="w-10" />
        </div>
        <h1 className="text-2xl font-bold text-white text-center">Iniciar sesión</h1>
        <p className="text-white/80 text-sm text-center mt-1">Ingresá tu número de celular</p>
      </div>

      <div className="px-4 -mt-6">
        <div className="bg-white rounded-2xl card-shadow p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>
          )}
          <form onSubmit={handleLogin} className="space-y-4">
            <PhoneInput
              value={phone}
              onChange={(v) => setPhone(v)}
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-[#2E7D32] text-white font-medium rounded-xl hover:bg-[#1B5E20] active:scale-[0.98] transition-all disabled:opacity-50 touch-target"
            >
              {loading ? "Ingresando..." : "Entrar"}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            ¿No tenés cuenta?{" "}
            <button onClick={() => navigate("/register")} className="text-[#2E7D32] font-medium hover:underline">
              Registrate
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}