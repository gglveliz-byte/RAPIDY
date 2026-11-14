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

/**
 * El proveedor se consulta con timeout y un reintento acotado. Los valores se
 * leen de process.env porque env.ts es un archivo compartido fuera de este
 * frente; se documentan en docs/production/OTP.md.
 */
function boundedInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

const PROVIDER_TIMEOUT_MS = boundedInt(process.env.NEUROCHAT_TIMEOUT_MS, 8_000, 2_000, 20_000);
const SEND_ATTEMPTS = 2;
const RETRY_BASE_DELAY_MS = 400;
const MAX_RETRY_DELAY_MS = 2_000;
const RETRYABLE_STATUSES = new Set([502, 503, 504]);

/** OTP_DEV_FALLBACK nunca se aplica en producción, aunque la variable esté en "true". */
if (env.isProduction && env.otpDevFallback) {
  // Fail-fast: mejor no arrancar que emitir OTP locales en producción.
  throw new Error(
    "OTP_DEV_FALLBACK está prohibido en producción. Elimínalo o ponlo en false y configura NEUROCHAT_API_KEY.",
  );
}
const DEV_FALLBACK_ENABLED =
  env.otpDevFallback &&
  !env.isProduction &&
  // Fail-closed: staging o NODE_ENV ausente nunca exponen devCode.
  (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

/** Logs sin teléfono, OTP ni payload: solo el resultado técnico del proveedor. */
function logProviderFailure(
  operation: string,
  status: number | null,
  providerCode: string | null,
  attempt: number,
): void {
  const statusLabel = status ? `HTTP ${status}` : "sin respuesta";
  const codeLabel = providerCode ? ` código ${providerCode}` : "";
  console.warn(`[OTP] fallo de NeuroChat en ${operation} (${statusLabel}${codeLabel}, intento ${attempt})`);
}

function retryDelayMs(res: Response, attempt: number): number {
  const retryAfter = res.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.min(seconds * 1_000, MAX_RETRY_DELAY_MS);
    }
    const date = Date.parse(retryAfter);
    if (!Number.isNaN(date)) {
      return Math.min(Math.max(0, date - Date.now()), MAX_RETRY_DELAY_MS);
    }
  }
  return Math.min(RETRY_BASE_DELAY_MS * attempt, MAX_RETRY_DELAY_MS);
}

function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUSES.has(status);
}

/** Acepta ISO 8601 o epoch en segundos/milisegundos; devuelve null si es inválido. */
function parseProviderExpiry(value: unknown): Date | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value < 1e12 ? value * 1_000 : value);
  }
  if (typeof value === "string" && value.trim()) {
    const trimmed = value.trim();
    if (/^\d{10,13}$/.test(trimmed)) {
      const numeric = Number(trimmed);
      return new Date(numeric < 1e12 ? numeric * 1_000 : numeric);
    }
    return new Date(trimmed);
  }
  return null;
}

/** Errores claros y estables para el cliente; nunca se reenvía el mensaje crudo del proveedor. */
function providerError(status: number, providerCode: string | undefined): never {
  const normalized = (providerCode || "").toUpperCase();
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
  if (status === 401 || status === 403) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "El servicio de códigos no está disponible en este momento. Contacta a soporte.",
    });
  }
  if (status >= 500) {
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "El servicio de WhatsApp no está disponible. Intenta de nuevo en unos segundos.",
    });
  }
  throw new TRPCError({
    code: "BAD_GATEWAY",
    message: "El proveedor de WhatsApp no respondió correctamente. Intenta de nuevo.",
  });
}

interface NeurochatRequestOptions {
  /** Total de intentos, incluido el primero. Por defecto 1 (sin reintento). */
  attempts?: number;
}

async function neurochatRequest(
  path: string,
  body?: Record<string, unknown>,
  options: NeurochatRequestOptions = {},
) {
  const attempts = Math.max(1, options.attempts ?? 1);
  const url = `${env.neurochatBaseUrl.replace(/\/$/, "")}${path}`;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(url, {
        method: body ? "POST" : "GET",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.neurochatApiKey,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      });

      const json = (await res.json().catch(() => null)) as any;
      const providerCode = json?.error?.code || json?.code || undefined;

      if (!res.ok || !json?.success) {
        if (attempt < attempts && isRetryableStatus(res.status)) {
          logProviderFailure(path, res.status, providerCode ?? null, attempt);
          await sleep(retryDelayMs(res, attempt));
          continue;
        }
        logProviderFailure(path, res.status, providerCode ?? null, attempt);
        providerError(res.status, providerCode);
      }
      return json.data;
    } catch (error) {
      if (error instanceof TRPCError) throw error;

      if (isTimeoutError(error)) {
        logProviderFailure(path, null, "TIMEOUT", attempt);
        throw new TRPCError({
          code: "GATEWAY_TIMEOUT",
          message:
            "El servicio de WhatsApp tardó demasiado en responder. Intenta de nuevo en unos segundos.",
        });
      }

      logProviderFailure(path, null, "NETWORK_ERROR", attempt);
      if (attempt < attempts) {
        await sleep(RETRY_BASE_DELAY_MS * attempt);
        continue;
      }
      throw new TRPCError({
        code: "SERVICE_UNAVAILABLE",
        message: "No pudimos contactar al servicio de WhatsApp. Intenta de nuevo en unos segundos.",
      });
    }
  }

  throw new TRPCError({
    code: "SERVICE_UNAVAILABLE",
    message: "No pudimos contactar al servicio de WhatsApp. Intenta de nuevo en unos segundos.",
  });
}

export async function sendOtp(phone: string): Promise<OtpSendResult> {
  if (!env.neurochatApiKey) {
    if (env.isProduction || !DEV_FALLBACK_ENABLED) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: env.isProduction
          ? "La verificación por WhatsApp no está configurada. Contacta a soporte."
          : "La verificación por WhatsApp no está configurada.",
      });
    }
    const code = String(crypto.randomInt(10 ** (env.otpLength - 1), 10 ** env.otpLength));
    const expiresAt = new Date(Date.now() + env.otpExpiryMinutes * 60_000);
    // Sin teléfono ni código: el devCode viaja solo en la respuesta de desarrollo.
    console.info(`[OTP][DEV] código de desarrollo generado (expira ${expiresAt.toISOString()})`);
    return {
      provider: "dev",
      otpId: `local:${crypto.randomUUID()}`,
      expiresAt,
      devCode: code,
    };
  }

  const data = await neurochatRequest(
    "/otp/send",
    {
      to: phone,
      length: env.otpLength,
      expiry: env.otpExpiryMinutes,
      ...(env.neurochatOtpFrom ? { from: env.neurochatOtpFrom } : {}),
    },
    { attempts: SEND_ATTEMPTS },
  );

  if (!data?.otp_id) {
    console.warn("[OTP] NeuroChat devolvió una respuesta sin otp_id");
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message: "El proveedor de WhatsApp devolvió una respuesta inválida. Intenta de nuevo.",
    });
  }

  const parsedExpiry = parseProviderExpiry(data?.expires_at);
  const localMaxExpiry = new Date(Date.now() + env.otpExpiryMinutes * 60_000);
  const expiresAt =
    parsedExpiry && !Number.isNaN(parsedExpiry.getTime())
      ? // Nunca extender la vigencia local, aunque el proveedor devuelva más tiempo.
        new Date(Math.min(parsedExpiry.getTime(), localMaxExpiry.getTime()))
      : localMaxExpiry;

  return {
    provider: "neurochat",
    otpId: String(data.otp_id),
    expiresAt,
  };
}

export async function verifyOtpWithProvider(otpId: string, code: string): Promise<OtpVerifyResult> {
  // Sin reintento: cada verificación puede consumir un intento en el proveedor.
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