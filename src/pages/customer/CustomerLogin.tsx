/**
 * @archivo src/pages/customer/CustomerLogin.tsx
 * @modulo 01-identity-and-auth (Acceso de Clientes por OTP)
 * @proposito
 *   Inicio de sesión sin contraseña para clientes: el usuario ingresa su
 *   teléfono, recibe un código por WhatsApp (NeuroChat) y lo valida.
 *   Si el teléfono no tiene cuenta, se le guía al registro con un token
 *   de verificación de corta vida.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, ArrowRight, KeyRound, MessageCircle, ShieldCheck, Sparkles } from "lucide-react";
import { useCustomerSession } from "@/hooks/useCustomerSession";
import { trpcMutate } from "@/hooks/useDeliveryData";
import PhoneInput from "@/components/PhoneInput";
import RapidyCanvas from "@/components/RapidyCanvas";

type Step = "phone" | "code";

export default function CustomerLogin() {
  const navigate = useNavigate();
  const { login } = useCustomerSession();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otpId, setOtpId] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState("");
  const [notice, setNotice] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setInterval(() => setResendIn((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendIn]);

  const requestCode = async (event?: React.FormEvent) => {
    event?.preventDefault();
    setError("");
    if (!phone.trim() || phone.replace(/\D/g, "").length < 7) {
      setError("Por favor ingresa tu número de celular");
      return;
    }
    setLoading(true);
    try {
      const result = await trpcMutate<any>("customer.requestOtp", {
        phone: phone.trim(),
        purpose: "login",
      });
      setOtpId(result.otpId);
      setDevCode(result.devCode ?? "");
      setCode("");
      setStep("code");
      setResendIn(45);
      setNotice(`Enviamos un código de 6 dígitos a ${phone.trim()}`);
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
        phone: phone.trim(),
        otpId,
        code: cleanCode,
      });
      if (result?.customer) {
        login(result.customer);
        navigate("/home", { replace: true });
        return;
      }
      if (result?.isNew) {
        navigate("/register", {
          replace: true,
          state: {
            phone: result.phone,
            registrationToken: result.registrationToken,
          },
        });
        return;
      }
      setError("No pudimos verificar el código. Inténtalo de nuevo.");
    } catch (err: any) {
      setError(err?.message || "Código incorrecto o expirado.");
    } finally {
      setLoading(false);
    }
  };

  const backToPhone = () => {
    setStep("phone");
    setCode("");
    setOtpId("");
    setDevCode("");
    setNotice("");
    setError("");
  };

  return (
    <div className="fixed inset-0 w-full h-[100dvh] max-h-[100dvh] bg-ink-soft overflow-hidden flex items-center justify-center p-3 sm:p-6 select-none">
      <RapidyCanvas />

      <div className="relative z-10 w-full max-w-[430px] max-h-[96dvh] bg-[#141418]/75 backdrop-blur-2xl rounded-3xl border border-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.85)] p-6 sm:p-8 flex flex-col justify-between overflow-hidden ring-1 ring-white/5">
        <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-brand/40 to-transparent pointer-events-none" />

        <div className="flex items-center justify-between">
          <button
            onClick={() => (step === "code" ? backToPhone() : navigate("/"))}
            className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 text-white flex items-center justify-center hover:bg-white/10 active:scale-95 transition-all cursor-pointer backdrop-blur-md"
            aria-label={step === "code" ? "Cambiar número" : "Volver"}
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>

          <div className="flex items-center gap-1.5 px-3 py-1 bg-white/5 border border-white/10 rounded-full backdrop-blur-md shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-brand" />
            <span className="text-[11px] font-black tracking-widest text-zinc-200 uppercase">
              Cliente Rapidy
            </span>
          </div>

          <div className="w-10" />
        </div>

        <div className="flex flex-col items-center text-center my-auto py-2">
          <div className="relative mb-3 group cursor-pointer" onClick={() => navigate("/")}>
            <div className="absolute -inset-1.5 rounded-full bg-gradient-to-tr from-[#FF5E00] to-[#FFA000] opacity-50 blur-lg group-hover:opacity-80 transition-opacity duration-500 animate-pulse" />
            <div className="relative w-20 h-20 rounded-full p-1 bg-gradient-to-tr from-[#FF5E00] via-[#FF8500] to-[#FFB829] shadow-[0_0_35px_rgba(255,106,0,0.6)] ring-2 ring-white/20">
              <img src="/image.png" alt="Rapidy" className="w-full h-full rounded-full object-cover" />
            </div>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight">
            {step === "phone" ? "Iniciar Sesión" : "Verifica tu WhatsApp"}
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-xs mx-auto mt-1 leading-relaxed">
            {step === "phone" ? (
              <>
                Ingresa tu celular y te enviaremos un código seguro por{" "}
                <span className="text-[#00A884] font-bold">WhatsApp</span>.
              </>
            ) : (
              <>Escribe el código que enviamos a tu WhatsApp para entrar a Rapidy.</>
            )}
          </p>

          {notice && step === "code" && (
            <div className="w-full mt-3 p-3 bg-emerald-500/10 border border-emerald-500/25 rounded-2xl text-emerald-300 text-xs font-semibold flex items-start gap-2 text-left">
              <MessageCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{notice}</span>
            </div>
          )}

          {devCode && step === "code" && (
            <div className="w-full mt-2 p-2.5 bg-amber-500/10 border border-amber-500/25 rounded-2xl text-amber-300 text-[11px] font-semibold">
              Modo desarrollo: tu código es <span className="font-black tracking-widest">{devCode}</span>
            </div>
          )}

          {error && (
            <div className="w-full mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-400 text-xs font-semibold animate-in fade-in duration-200">
              {error}
            </div>
          )}

          {step === "phone" ? (
            <form onSubmit={requestCode} className="w-full mt-4 space-y-4 text-left">
              <PhoneInput value={phone} onChange={setPhone} dark={true} error={error} />

              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[52px] bg-gradient-to-r from-[#FF5E00] via-brand to-[#FF8500] hover:brightness-110 active:scale-[0.98] text-white font-black text-sm sm:text-base tracking-wider uppercase rounded-2xl shadow-[0_8px_30px_rgba(255,106,0,0.45)] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 touch-target"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Enviar código</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={verifyCode} className="w-full mt-4 space-y-3 text-left">
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
                className="w-full min-h-[52px] bg-gradient-to-r from-[#FF5E00] via-brand to-[#FF8500] hover:brightness-110 active:scale-[0.98] text-white font-black text-sm sm:text-base tracking-wider uppercase rounded-2xl shadow-[0_8px_30px_rgba(255,106,0,0.45)] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 touch-target"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Verificar y entrar</span>
                  </>
                )}
              </button>

              <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
                <button type="button" onClick={backToPhone} className="hover:text-white transition-colors">
                  Cambiar número
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

          <div className="mt-4 text-center text-xs sm:text-sm text-zinc-400">
            ¿Primera vez en Rapidy?{" "}
            <button
              type="button"
              onClick={() => navigate("/register")}
              className="text-brand font-bold hover:underline transition-colors cursor-pointer ml-1"
            >
              Crear cuenta gratis
            </button>
          </div>
        </div>

        <div className="pt-3 border-t border-white/5 text-center">
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            ¿Eres comercio, repartidor o administrador?{" "}
            <span className="text-brand font-semibold underline ml-1">Portal de Socios</span>
          </button>
        </div>
      </div>
    </div>
  );
}