import { useState } from "react";
import { useNavigate } from "react-router";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, Lock, ArrowLeft, ShoppingBag } from "lucide-react";
import PhoneInput from "@/components/PhoneInput";
import { trpcMutate } from "@/hooks/useDeliveryData";

export default function Login() {
  const navigate = useNavigate();
  const [loginType, setLoginType] = useState<"email" | "phone">("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const input: any = { password };
      if (loginType === "email") {
        if (!email) { setError("Email requerido"); setLoading(false); return; }
        input.email = email;
      } else {
        if (!phone) { setError("Teléfono requerido"); setLoading(false); return; }
        input.phone = phone;
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
        setError(result?.message || "Credenciales inválidas");
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mobile-container bg-white min-h-screen flex flex-col">
      <div className="bg-[#2E7D32] px-4 pt-4 pb-12">
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => navigate("/")} className="text-white/80 hover:text-white touch-target">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-white" />
            <span className="text-white font-semibold">RAPIDY</span>
          </div>
          <div className="w-10" />
        </div>
        <h1 className="text-2xl font-bold text-white text-center">Iniciar sesión</h1>
      </div>

      <div className="px-4 -mt-6">
        <Card className="shadow-lg">
          <CardHeader className="pb-2">
            <div className="flex bg-gray-100 rounded-xl p-1">
              <button
                onClick={() => setLoginType("email")}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${loginType === "email" ? "bg-white shadow-sm text-gray-800" : "text-gray-500"}`}
              >
                Email
              </button>
              <button
                onClick={() => setLoginType("phone")}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${loginType === "phone" ? "bg-white shadow-sm text-gray-800" : "text-gray-500"}`}
              >
                Teléfono
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              {error && (
                <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>
              )}

              {loginType === "email" ? (
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@admin.com"
                      className="w-full h-12 pl-10 pr-4 border border-gray-200 rounded-xl focus:border-[#2E7D32] focus:ring-1 focus:ring-[#2E7D32] outline-none text-sm"
                    />
                  </div>
                </div>
              ) : (
                <PhoneInput
                  value={phone}
                  onChange={(v) => setPhone(v)}
                />
              )}

              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Contraseña</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••"
                    className="w-full h-12 pl-10 pr-4 border border-gray-200 rounded-xl focus:border-[#2E7D32] focus:ring-1 focus:ring-[#2E7D32] outline-none text-sm"
                  />
                </div>
              </div>

              <p className="text-xs text-gray-400 text-center">
                {loginType === "email" ? "Admin y comercios usan email" : "Repartidores usan teléfono"}
              </p>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 bg-[#2E7D32] text-white font-medium rounded-xl hover:bg-[#1B5E20] transition-all touch-target"
              >
                {loading ? "Ingresando..." : "Iniciar sesión"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}