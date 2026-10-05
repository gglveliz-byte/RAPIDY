import { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, User, MapPin, Navigation } from "lucide-react";
import { useCustomerSession } from "@/hooks/useCustomerSession";
import { registerCustomer } from "@/hooks/useDeliveryData";
import PhoneInput from "@/components/PhoneInput";

async function getAddressFromCoords(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&accept-language=es`,
      { headers: { "User-Agent": "YALlega-App/1.0" } }
    );
    const data = await res.json();
    if (data?.display_name) return data.display_name;
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  } catch {
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }
}

export default function Register() {
  const navigate = useNavigate();
  const { login } = useCustomerSession();
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "", address: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [geoLoading, setGeoLoading] = useState(false);

  const handleGetLocation = async () => {
    if (!navigator.geolocation) {
      setError("Tu navegador no soporta geolocalización");
      return;
    }
    setGeoLoading(true);
    setError("");
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
      );
      const { latitude, longitude } = pos.coords;
      const addr = await getAddressFromCoords(latitude, longitude);
      setForm((f) => ({ ...f, address: addr }));
    } catch {
      setError("No pudimos obtener tu ubicación. Escribila manualmente.");
    } finally {
      setGeoLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.firstName || !form.lastName || !form.phone || !form.address) {
      setError("Todos los campos son obligatorios");
      return;
    }
    setLoading(true);
    try {
      const result: any = await registerCustomer(form);
      if (result.success && result.customer) {
        login(result.customer);
        localStorage.setItem("qs_session", JSON.stringify({ role: "customer", ts: Date.now() }));
        navigate("/home");
      } else {
        setError(result?.message || "Error al registrar");
      }
    } catch (e) {
      console.error("[register] Error:", e);
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mobile-container bg-white min-h-screen">
      {/* Header */}
      <div className="bg-[#2E7D32] px-4 pt-4 pb-8">
        <button onClick={() => navigate("/")} className="text-white/80 hover:text-white mb-4 touch-target">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-2xl font-bold text-white">Crear cuenta</h1>
        <p className="text-white/70 text-sm mt-1">Regístrate con tu número de celular</p>
      </div>

      {/* Form */}
      <div className="px-4 -mt-4">
        <div className="bg-white rounded-2xl card-shadow p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Nombre</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  placeholder="Tu nombre"
                  className="w-full h-12 pl-10 pr-4 border border-gray-200 rounded-xl focus:border-[#2E7D32] focus:ring-1 focus:ring-[#2E7D32] outline-none text-sm"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Apellido</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  placeholder="Tu apellido"
                  className="w-full h-12 pl-10 pr-4 border border-gray-200 rounded-xl focus:border-[#2E7D32] focus:ring-1 focus:ring-[#2E7D32] outline-none text-sm"
                />
              </div>
            </div>

            <PhoneInput
              value={form.phone}
              onChange={(v) => setForm({ ...form, phone: v })}
            />

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Dirección principal</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <textarea
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="Calle, número, colonia, ciudad"
                  rows={3}
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:border-[#2E7D32] focus:ring-1 focus:ring-[#2E7D32] outline-none text-sm resize-none"
                />
              </div>
              <button
                type="button"
                onClick={handleGetLocation}
                disabled={geoLoading}
                className="mt-2 w-full h-10 border border-gray-200 rounded-xl text-sm text-gray-600 font-medium flex items-center justify-center gap-2 hover:bg-gray-50 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                <Navigation className="w-4 h-4 text-[#2E7D32]" />
                {geoLoading ? "Obteniendo ubicación..." : "Usar mi ubicación actual"}
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-[#2E7D32] text-white font-medium rounded-xl hover:bg-[#1B5E20] active:scale-[0.98] transition-all disabled:opacity-50 touch-target mt-6"
            >
              {loading ? "Registrando..." : "Crear cuenta"}
            </button>

            <p className="text-center text-[11px] text-gray-500 mt-3 leading-snug">
              Al registrarte, aceptas nuestros{" "}
              <button
                type="button"
                onClick={() => navigate("/terminos-y-condiciones")}
                className="text-[#2E7D32] underline font-medium hover:text-[#1B5E20]"
              >
                Términos y Condiciones
              </button>{" "}
              y la{" "}
              <button
                type="button"
                onClick={() => navigate("/politica-de-privacidad")}
                className="text-[#2E7D32] underline font-medium hover:text-[#1B5E20]"
              >
                Política de Privacidad
              </button>.
            </p>
          </form>
          <p className="text-center text-sm text-gray-500 mt-6">
            ¿Ya tenés cuenta?{" "}
            <button onClick={() => navigate("/customer-login")} className="text-[#2E7D32] font-semibold underline hover:text-green-700">
              Iniciá sesión
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
