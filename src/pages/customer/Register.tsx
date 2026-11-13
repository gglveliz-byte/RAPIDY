/**
 * @archivo src/pages/customer/Register.tsx
 * @modulo 01-identity-and-auth (Registro y Onboarding de Clientes)
 * @proposito
 *   Pantalla de registro de nuevos clientes en la plataforma Rapidy.
 *   Provee captura de datos de contacto (nombre, apellido, celular) y
 *   geolocalización en un solo toque mediante OpenStreetMap Nominatim
 *   con persistencia en PostgreSQL (Neon) y sesión automática.
 *
 * @resumen_contenido
 *   - Componente `Register`: Formulario interactivo con tarjeta de cristal esmerilado,
 *     motor de constelaciones `RapidyCanvas` a 60 FPS, autocompletado GPS y validaciones.
 *   - Manejador `handleGetLocation`: Invoca la API Geolocation del navegador y traduce a dirección física.
 *   - Manejador `handleSubmit`: Envía los datos sanitizados al endpoint tRPC `customer.register`.
 *
 * @dependencias_internas
 *   - `RapidyCanvas` (@/components/RapidyCanvas)
 *   - `PhoneInput` (@/components/PhoneInput)
 *   - `getAddressFromCoords` (@/lib/locationUtils)
 *   - `useCustomerSession` (@/hooks/useCustomerSession)
 *   - `registerCustomer` (@/hooks/useDeliveryData)
 *
 * @dependencias_externas
 *   - `lucide-react` (iconografía de usuario, navegación y mapa)
 *   - `react-router` (navegación declarativa)
 *
 * @tablas_bd_o_redis
 *   - PostgreSQL (Neon): `customers` (Inserción y autenticación de nuevo cliente)
 */

import { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, User, MapPin, Navigation, Sparkles, ArrowRight } from "lucide-react";
import { useCustomerSession } from "@/hooks/useCustomerSession";
import { registerCustomer } from "@/hooks/useDeliveryData";
import { getAddressFromCoords } from "@/lib/locationUtils";
import PhoneInput from "@/components/PhoneInput";
import RapidyCanvas from "@/components/RapidyCanvas";

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
      setError("No pudimos obtener tu ubicación. Por favor escríbela manualmente.");
    } finally {
      setGeoLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.firstName.trim() || !form.lastName.trim() || !form.phone.trim() || !form.address.trim()) {
      setError("Todos los campos son obligatorios para tu entrega");
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
        setError(result?.message || "Error al registrar la cuenta");
      }
    } catch (e) {
      console.error("[register] Error:", e);
      setError("Error de conexión al servidor. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 w-full h-[100dvh] max-h-[100dvh] bg-[#0A0A0D] overflow-hidden flex items-center justify-center p-3 sm:p-6 select-none">
      {/* Living Interactive Constellation Canvas */}
      <RapidyCanvas />

      {/* Floating Glassmorphic Registration Card */}
      <div className="relative z-10 w-full max-w-[440px] max-h-[96dvh] bg-[#141418]/80 backdrop-blur-2xl rounded-3xl border border-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.85)] p-5 sm:p-7 flex flex-col justify-between overflow-y-auto no-scrollbar ring-1 ring-white/5">
        
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
            <Sparkles className="w-3.5 h-3.5 text-[#FF6A00]" />
            <span className="text-[11px] font-black tracking-widest text-zinc-200 uppercase">
              Registro Rapidy
            </span>
          </div>

          <div className="w-10" />
        </div>

        {/* Form Body */}
        <div className="flex flex-col items-center text-center my-auto py-2">
          {/* Rapidy Emblem */}
          <div className="relative mb-2 group cursor-pointer" onClick={() => navigate("/")}>
            <div className="absolute -inset-1 rounded-full bg-gradient-to-tr from-[#FF5E00] to-[#FFA000] opacity-50 blur-lg group-hover:opacity-80 transition-opacity duration-500 animate-pulse" />
            <div className="relative w-14 h-14 rounded-full p-1 bg-gradient-to-tr from-[#FF5E00] via-[#FF8500] to-[#FFB829] shadow-[0_0_25px_rgba(255,106,0,0.5)] ring-2 ring-white/20">
              <img
                src="/image.png"
                alt="Rapidy Emblem"
                className="w-full h-full rounded-full object-cover"
              />
            </div>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight">
            Crear Cuenta
          </h1>
          <p className="text-xs text-zinc-400 max-w-xs mt-1 mb-3">
            Únete a <span className="text-[#FF6A00] font-bold">Rapidy</span> y recibe tus pedidos en minutos
          </p>

          {/* Error Banner */}
          {error && (
            <div className="w-full mb-3 p-3 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-400 text-xs font-semibold animate-in fade-in duration-200">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="w-full space-y-3 text-left">
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-300 mb-1 block">
                  Nombre
                </label>
                <div className="relative flex rounded-2xl bg-[#242426] border border-white/10 focus-within:border-[#FF6A00] focus-within:ring-2 focus-within:ring-[#FF6A00]/25 transition-all">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="text"
                    value={form.firstName}
                    onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                    placeholder="Lautaro"
                    className="w-full h-11 pl-9 pr-3 bg-transparent text-white placeholder-zinc-500 text-sm font-medium outline-none rounded-2xl"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-300 mb-1 block">
                  Apellido
                </label>
                <div className="relative flex rounded-2xl bg-[#242426] border border-white/10 focus-within:border-[#FF6A00] focus-within:ring-2 focus-within:ring-[#FF6A00]/25 transition-all">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="text"
                    value={form.lastName}
                    onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                    placeholder="Ezequiel"
                    className="w-full h-11 pl-9 pr-3 bg-transparent text-white placeholder-zinc-500 text-sm font-medium outline-none rounded-2xl"
                  />
                </div>
              </div>
            </div>

            <PhoneInput
              value={form.phone}
              onChange={(v) => setForm({ ...form, phone: v })}
              dark={true}
              error={error}
            />

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-300 block">
                  Dirección de Entrega
                </label>
                <button
                  type="button"
                  onClick={handleGetLocation}
                  disabled={geoLoading}
                  className="text-[11px] text-[#FF6A00] hover:text-[#FFA000] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50 transition-colors"
                >
                  <Navigation className={`w-3 h-3 ${geoLoading ? "animate-spin" : ""}`} />
                  <span>{geoLoading ? "Localizando..." : "GPS actual"}</span>
                </button>
              </div>

              <div className="relative flex rounded-2xl bg-[#242426] border border-white/10 focus-within:border-[#FF6A00] focus-within:ring-2 focus-within:ring-[#FF6A00]/25 transition-all">
                <MapPin className="absolute left-3 top-3 w-4 h-4 text-zinc-500" />
                <textarea
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="Calle, número, ciudad o referencia..."
                  rows={2}
                  className="w-full pl-9 pr-3 py-2.5 bg-transparent text-white placeholder-zinc-500 text-sm font-medium outline-none rounded-2xl resize-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-13 mt-2 bg-gradient-to-r from-[#FF5E00] via-[#FF6A00] to-[#FF8500] hover:brightness-110 active:scale-[0.98] text-white font-black text-sm sm:text-base tracking-wider uppercase rounded-2xl shadow-[0_6px_24px_rgba(255,106,0,0.45)] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 touch-target"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Registrarme y Comenzar</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <p className="text-center text-[11px] text-zinc-400 mt-2 leading-tight">
              Al continuar aceptas los{" "}
              <button
                type="button"
                onClick={() => navigate("/terminos-y-condiciones")}
                className="text-[#FF6A00] hover:underline"
              >
                Términos
              </button>{" "}
              y la{" "}
              <button
                type="button"
                onClick={() => navigate("/politica-de-privacidad")}
                className="text-[#FF6A00] hover:underline"
              >
                Privacidad
              </button>{" "}
              de Rapidy.
            </p>
          </form>
        </div>

        {/* Footer */}
        <div className="pt-2 border-t border-white/5 text-center">
          <button
            type="button"
            onClick={() => navigate("/customer-login")}
            className="text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            ¿Ya tienes cuenta?{" "}
            <span className="text-[#FF6A00] font-semibold underline ml-1">Iniciar sesión</span>
          </button>
        </div>

      </div>
    </div>
  );
}
