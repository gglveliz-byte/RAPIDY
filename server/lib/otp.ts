import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { TRPCError } from "@trpc/server";
import { env } from "./env";

/**
 * Normaliza un teléfono a dígitos E.164 sin "+" ni separadores.
 * Acepta formatos del PhoneInput ("+593 0991234567"), E.164 ("+593991234567")
 * y números locales ecuatorianos ("0991234567").
 */
const DIAL_PREFIXES = [
  "1809", "593", "591", "598", "595", "507", "506", "502",
  "54", "57", "51", "56", "52", "58", "34", "55", "1",
].sort((a, b) => b.length - a.length);

export function normalizePhone(raw: string): string {
  const input = String(raw ?? "").trim();
  const isInternational = input.startsWith("+");
  let digits = input.replace(/\D/g, "");

  if (isInternational) {
    const prefix = DIAL_PREFIXES.find((p) => digits.startsWith(p));
    if (prefix) {
      let national = digits.slice(prefix.length);
      if (national.startsWith("0")) national = national.slice(1);
      digits = prefix + national;
    }
  } else if (digits.startsWith("0") && digits.length >= 9 && digits.length <= 10) {
    // Ecuador por defecto para números locales con 0 inicial.
    digits = "593" + digits.slice(1);
  } else if (digits.length === 9 && digits.startsWith("9")) {
    digits = "593" + digits;
  }

  if (digits.length < 8 || digits.length > 15) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Número de teléfono inválido. Usa el formato internacional.",
    });
  }
  return digits;
}

export function maskPhone(phone: string): string {
  if (phone.length <= 4) return "****";
  return `${phone.slice(0, 3)}****${phone.slice(-3)}`;
}

export interface OtpSendResult {
  provider: "neurochat" | "dev";
  otpId: string;
  expiresAt: Date;
  /** Solo se devuelve en fallback de desarrollo. Nunca en producción. */
  devCode?: string;
}

export interface OtpVerifyResult {
  valid: boolean;
  status: string;
  attemptsLeft?: number;
}

function providerError(status: number, code: string | undefined, message: string): never {
  const normalized = (code || "").toUpperCase();
  if (status === 429 || normalized === "RATE_LIMIT_OTP_SEND") {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Demasiados intentos. Espera un minuto antes de pedir otro código.",
    });
  }
  if (normalized === "QUOTA_EXCEEDED" || normalized === "SUBSCRIPTION_REQUIRED") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "El servicio de códigos no está disponible en este momento. Contacta a soporte.",
    });
  }
  if (
    normalized === "NO_PHONE_NUMBER" ||
    normalized === "SENDER_NOT_FOUND" ||
    normalized === "TEMPLATES_NOT_APPROVED"
  ) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "No pudimos enviar el código por WhatsApp. Intenta más tarde.",
    });
  }
  throw new TRPCError({
    code: "BAD_GATEWAY",
    message: message || "El proveedor de WhatsApp no respondió correctamente.",
  });
}

async function neurochatRequest(path: string, body?: Record<string, unknown>) {
  const res = await fetch(`${env.neurochatBaseUrl.replace(/\/$/, "")}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.neurochatApiKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json().catch(() => null) as any;
  if (!res.ok || !json?.success) {
    const code = json?.error?.code || json?.code;
    const message = json?.error?.message || json?.message || `HTTP ${res.status}`;
    providerError(res.status, code, message);
  }
  return json.data;
}

export async function sendOtp(phone: string): Promise<OtpSendResult> {
  if (!env.neurochatApiKey) {
    if (!env.otpDevFallback) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "La verificación por WhatsApp no está configurada.",
      });
    }
    const code = String(crypto.randomInt(10 ** (env.otpLength - 1), 10 ** env.otpLength));
    const expiresAt = new Date(Date.now() + env.otpExpiryMinutes * 60_000);
    console.info(`[OTP][DEV] ${maskPhone(phone)} -> ${code} (expira ${expiresAt.toISOString()})`);
    return {
      provider: "dev",
      otpId: `local:${crypto.randomUUID()}`,
      expiresAt,
      devCode: code,
    };
  }

  const data = await neurochatRequest("/otp/send", {
    to: phone,
    length: env.otpLength,
    expiry: env.otpExpiryMinutes,
    ...(env.neurochatOtpFrom ? { from: env.neurochatOtpFrom } : {}),
  });

  return {
    provider: "neurochat",
    otpId: String(data.otp_id),
    expiresAt: new Date(data.expires_at ?? Date.now() + env.otpExpiryMinutes * 60_000),
  };
}

export async function verifyOtpWithProvider(otpId: string, code: string): Promise<OtpVerifyResult> {
  const data = await neurochatRequest("/otp/verify", { otp_id: otpId, code });
  return {
    valid: data?.valid === true,
    status: String(data?.status ?? "pending"),
    attemptsLeft: typeof data?.attempts_left === "number" ? data.attempts_left : undefined,
  };
}

export async function hashOtpCode(code: string): Promise<string> {
  return bcrypt.hash(code, 10);
}

export async function compareOtpCode(code: string, hash: string | null): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(code, hash);
}

export function isDevOtpId(otpId: string): boolean {
  return otpId.startsWith("local:");
}