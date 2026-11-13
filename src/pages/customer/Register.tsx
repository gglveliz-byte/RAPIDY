/**
 * @archivo src/pages/customer/Register.tsx
 * @modulo 01-identity-and-auth (Registro de Clientes con OTP)
 * @proposito
 *   Registro de clientes verificando el teléfono por WhatsApp. El usuario
 *   completa sus datos, recibe un código y la cuenta se crea solo después
 *   de validar que el número le pertenece.
 */

import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import {
  ArrowLeft,
  ArrowRight,
  KeyRound,
  MapPin,
  MessageCircle,
  Navigation,
  ShieldCheck,
  Sparkles,
  User,
} from "lucide-react";
import { useCustomerSession } from "@/hooks/useCustomerSession";
import { trpcMutate } from "@/hooks/useDeliveryData";
import { getAddressFromCoords } from "@/lib/locationUtils";
import PhoneInput from "@/components/PhoneInput";
import RapidyCanvas from "@/components/RapidyCanvas";

type Step = "details" | "code";
type NavState = { phone?: string; registrationToken?: string } | null;

export default function Register() {
  const navigate = useNavigate();
  const location = useLocation();
  const navState = (location.state ?? null) as NavState;
  const { login, customer } = useCustomerSession();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: navState?.phone ?? "",
    address: "",
  });
  const [registrationToken, setRegistrationToken] = useState(
    navState?.registrationToken ?? "",
  );
  const [step, setStep] = useState<Step>("details");
  const [otpId, setOtpId] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState("");
  const [notice, setNotice] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [geoLoading, setGeoLoading] = useState(false);

  const phoneVerified = Boolean(registrationToken);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setInterval(() => setResendIn((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendIn]);

  if (customer) {
    return <Navigate to="/home" replace />;
  }

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

  const validateDetails = () => {
    if (
      !form.firstName.trim() ||
      !form.lastName.trim() ||
      !form.phone.trim() ||
      !form.address.trim()
    ) {
      setError("Todos los campos son obligatorios para tu entrega");
      return false;
    }
    return true;
  };

  const completeRegistration = async (token?: string) => {
    const tokenToUse = token ?? registrationToken;
    if (!tokenToUse) {
      setError("Verifica tu número de WhatsApp antes de crear la cuenta.");
      setStep("details");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await trpcMutate<any>("customer.register", {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        registrationToken: tokenToUse,
      });
      if (result?.customer) {
        login(result.customer);
        navigate("/home", { replace: true });
      } else {
        setError(result?.message || "No pudimos crear la cuenta.");
      }
    } catch (err: any) {
      setError(err?.message || "Error al registrar la cuenta.");
    } finally {
      setLoading(false);
    }
  };

  const requestCode = async (event?: React.FormEvent) => {
    event?.preventDefault();
    setError("");
    if (!validateDetails()) return;
    setLoading(true);
    try {
      const result = await trpcMutate<any>("customer.requestOtp", {
        phone: form.phone.trim(),
        purpose: "register",
      });
      setOtpId(result.otpId);
      setDevCode(result.devCode ?? "");
      setCode("");
      setStep("code");
      setResendIn(45);
      setNotice(`Enviamos un código de 6 dígitos a ${form.phone.trim()}`);
    } catch (err: any) {
      setError(err?.message || "No pudimos enviar el código. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    const cleanCode = code.replace(/\D/g, "");
    if (cleanCode.length < 4) {
      setError("Ingresa el código que recibiste por WhatsApp");
      return;
    }
    setLoading(true);
    try {
      const result = await trpcMutate<any>("customer.verifyOtp", {
        phone: form.phone.trim(),
        otpId,
        code: cleanCode,
      });
      if (result?.customer) {
        // El teléfono ya tenía cuenta; el OTP prueba propiedad, así que puede entrar.
        login(result.customer);
        navigate("/home", { replace: true });
        return;
      }
      if (result?.isNew && result.registrationToken) {
        setRegistrationToken(result.registrationToken);
        await completeRegistration(result.registrationToken);
        return;
      }
      setError("No pudimos verificar el código. Inténtalo de nuevo.");
    } catch (err: any) {
      setError(err?.message || "Código incorrecto o expirado.");
    } finally {
      setLoading(false);
    }
  };

  const handleDetailsSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validateDetails()) return;
    if (phoneVerified) {
      await completeRegistration();
      return;
    }
    await requestCode();
  };

  const back = () => {
    if (step === "code") {
      setStep("details");
      setError("");
      return;
    }
    navigate(-1);
  };

  return (
    <div className="fixed inset-0 w-full h-[100dvh] max-h-[100dvh] bg-ink-soft overflow-hidden flex items-center justify-center p-3 sm:p-6 select-none">
      <RapidyCanvas />

      <div className="relative z-10 w-full max-w-[440px] max-h-[96dvh] bg-[#141418]/80 backdrop-blur-2xl rounded-3xl border border-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.85)] p-5 sm:p-7 flex flex-col justify-between overflow-y-auto no-scrollbar ring-1 ring-white/5">
        <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-brand/40 to-transparent pointer-events-none" />

        <div className="flex items-center justify-between">
          <button
            onClick={back}
            className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 text-white flex items-center justify-center hover:bg-white/10 active:scale-95 transition-all cursor-pointer backdrop-blur-md"
            aria-label="Volver"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>

          <div className="flex items-center gap-1.5 px-3 py-1 bg-white/5 border border-white/10 rounded-full backdrop-blur-md">
            <Sparkles className="w-3.5 h-3.5 text-brand" />
            <span className="text-[11px] font-black tracking-widest text-zinc-200 uppercase">
              {step === "code" ? "Verificación" : "Registro Rapidy"}
            </span>
          </div>

          <div className="w-10" />
        </div>

        <div className="flex flex-col items-center text-center my-auto py-2">
          <div className="relative mb-2 group cursor-pointer" onClick={() => navigate("/")}>
            <div className="absolute -inset-1 rounded-full bg-gradient-to-tr from-[#FF5E00] to-[#FFA000] opacity-50 blur-lg group-hover:opacity-80 transition-opacity duration-500 animate-pulse" />
            <div className="relative w-14 h-14 rounded-full p-1 bg-gradient-to-tr from-[#FF5E00] via-[#FF8500] to-[#FFB829] shadow-[0_0_25px_rgba(255,106,0,0.5)] ring-2 ring-white/20">
              <img src="/image.png" alt="Rapidy" className="w-full h-full rounded-full object-cover" />
            </div>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight">
            {step === "code" ? "Verifica tu WhatsApp" : "Crear Cuenta"}
          </h1>
          <p className="text-xs text-zinc-400 max-w-xs mt-1 mb-3">
            {step === "code" ? (
              <>Escribe el código que enviamos a tu WhatsApp para confirmar tu número.</>
            ) : (
              <>
                Únete a <span className="text-brand font-bold">Rapidy</span> y recibe tus pedidos en minutos
              </>
            )}
          </p>

          {notice && step === "code" && (
            <div className="w-full mb-3 p-3 bg-emerald-500/10 border border-emerald-500/25 rounded-2xl text-emerald-300 text-xs font-semibold flex items-start gap-2 text-left">
              <MessageCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{notice}</span>
            </div>
          )}

          {devCode && step === "code" && (
            <div className="w-full mb-3 p-2.5 bg-amber-500/10 border border-amber-500/25 rounded-2xl text-amber-300 text-[11px] font-semibold">
              Modo desarrollo: tu código es <span className="font-black tracking-widest">{devCode}</span>
            </div>
          )}

          {error && (
            <div className="w-full mb-3 p-3 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-400 text-xs font-semibold animate-in fade-in duration-200">
              {error}
            </div>
          )}

          {step === "details" ? (
            <form onSubmit={handleDetailsSubmit} className="w-full space-y-3 text-left">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-300 mb-1 block">
                    Nombre
                  </label>
                  <div className="relative flex rounded-2xl bg-[#242426] border border-white/10 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25 transition-all">
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
                  <div className="relative flex rounded-2xl bg-[#242426] border border-white/10 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25 transition-all">
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

              {phoneVerified ? (
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-300 mb-1 block">
                    Número verificado
                  </label>
                  <div className="flex items-center gap-2 h-13 sm:h-14 px-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-sm font-bold">
                    <ShieldCheck className="w-4 h-4" />
                    <span>{form.phone}</span>
                  </div>
                </div>
              ) : (
                <PhoneInput
                  value={form.phone}
                  onChange={(v) => setForm({ ...form, phone: v })}
                  dark={true}
                  error={error}
                />
              )}

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-300 block">
                    Dirección de Entrega
                  </label>
                  <button
                    type="button"
                    onClick={handleGetLocation}
                    disabled={geoLoading}
                    className="text-[11px] text-brand hover:text-[#FFA000] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50 transition-colors"
                  >
                    <Navigation className={`w-3 h-3 ${geoLoading ? "animate-spin" : ""}`} />
                    <span>{geoLoading ? "Localizando..." : "GPS actual"}</span>
                  </button>
                </div>

                <div className="relative flex rounded-2xl bg-[#242426] border border-white/10 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25 transition-all">
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
                className="w-full min-h-[52px] mt-2 bg-gradient-to-r from-[#FF5E00] via-brand to-[#FF8500] hover:brightness-110 active:scale-[0.98] text-white font-black text-sm sm:text-base tracking-wider uppercase rounded-2xl shadow-[0_6px_24px_rgba(255,106,0,0.45)] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 touch-target"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>{phoneVerified ? "Crear mi cuenta" : "Continuar"}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <p className="text-center text-[11px] text-zinc-400 mt-2 leading-tight">
                Al continuar aceptas los{" "}
                <button type="button" onClick={() => navigate("/terminos-y-condiciones")} className="text-brand hover:underline">
                  Términos
                </button>{" "}
                y la{" "}
                <button type="button" onClick={() => navigate("/politica-de-privacidad")} className="text-brand hover:underline">
                  Privacidad
                </button>{" "}
                de Rapidy.
              </p>
            </form>
          ) : (
            <form onSubmit={verifyCode} className="w-full space-y-3 text-left">
              <div className="relative">
                <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 8))}
                  placeholder="000000"
                  aria-label="Código de verificación"
                  className="w-full h-16 pl-12 pr-4 text-center text-2xl font-black tracking-[0.45em] bg-[#242426] border border-white/10 rounded-2xl text-white placeholder-zinc-600 outline-none focus:border-brand focus:ring-2 focus:ring-brand/25 transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[52px] bg-gradient-to-r from-[#FF5E00] via-brand to-[#FF8500] hover:brightness-110 active:scale-[0.98] text-white font-black text-sm sm:text-base tracking-wider uppercase rounded-2xl shadow-[0_6px_24px_rgba(255,106,0,0.45)] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 touch-target"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Verificar y crear cuenta</span>
                  </>
                )}
              </button>

              <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
                <button type="button" onClick={() => setStep("details")} className="hover:text-white transition-colors">
                  Editar datos
                </button>
                <button
                  type="button"
                  onClick={() => requestCode()}
                  disabled={loading || resendIn > 0}
                  className="font-bold text-brand disabled:text-zinc-600 disabled:cursor-not-allowed hover:underline transition-colors"
                >
                  {resendIn > 0 ? `Reenviar en ${resendIn}s` : "Reenviar código"}
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="pt-2 border-t border-white/5 text-center">
          <button
            type="button"
            onClick={() => navigate("/customer-login")}
            className="text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            ¿Ya tienes cuenta?{" "}
            <span className="text-brand font-semibold underline ml-1">Iniciar sesión</span>
          </button>
        </div>
      </div>
    </div>
  );
}