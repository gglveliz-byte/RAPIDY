import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";
export type LogContext = Record<string, unknown>;

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  fatal(message: string, context?: LogContext): void;
  child(bindings: LogContext): Logger;
}

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

const LEVEL_NAMES = Object.keys(LEVEL_WEIGHT) as LogLevel[];
const REDACTED = "[REDACTED]";
const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 50;
const MAX_STRING_LENGTH = 4_000;

// Claves que nunca deben aparecer en claro. Se comparan normalizadas (sin
// guiones, guiones bajos ni espacios) para cubrir accessToken, api_key, etc.
const SECRET_KEY_FRAGMENTS = [
  "password",
  "passwd",
  "secret",
  "token",
  "authorization",
  "cookie",
  "apikey",
  "privatekey",
  "credential",
  "jwt",
  "otp",
  "verificationcode",
  "sessionid",
  "cardnumber",
  "cvv",
  "cvc",
];
const SECRET_EXACT_KEYS = new Set(["pwd", "pass", "pin", "session"]);
const PHONE_EXACT_KEYS = new Set(["tel"]);
const PHONE_KEY_FRAGMENTS = ["phone", "telefono", "celular", "mobile", "whatsapp", "msisdn"];
const EMAIL_KEY_FRAGMENTS = ["email", "correo"];

const JWT_PATTERN = /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const DATABASE_URL_PATTERN = /\b(postgres(?:ql)?:\/\/)([^:\s/@]+):([^@\s/]+)@/gi;
const PRIVATE_KEY_PATTERN =
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g;
const SECRET_ASSIGNMENT_PATTERN =
  /\b(password|passwd|pwd|secret|token|api[_-]?key|otp|authorization|cookie)\b(\s*[=:]\s*)("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s,;]+)/gi;
const INLINE_PHONE_PATTERN =
  /\b(phone|telefono|teléfono|tel|celular|whatsapp|mobile)\b([^\d+]{0,12})(\+?\d[\d\s().-]{5,}\d)/gi;
const INTERNATIONAL_PHONE_PATTERN = /(^|[^\d])(\+\d[\d\s().-]{5,}\d)(?!\d)/g;
const EMAIL_PATTERN = /\b([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g;

const SERVICE_NAME = process.env.LOG_SERVICE?.trim() || "rapidy-api";
const ENVIRONMENT = process.env.NODE_ENV || "development";
const APP_VERSION = process.env.APP_VERSION || process.env.GIT_SHA || "";

function parseLogLevel(value: string | undefined): LogLevel {
  const normalized = value?.trim().toLowerCase();
  if (normalized && LEVEL_NAMES.includes(normalized as LogLevel)) {
    return normalized as LogLevel;
  }
  return ENVIRONMENT === "test" ? "warn" : "info";
}

const minimumLevel = parseLogLevel(process.env.LOG_LEVEL);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSecretKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return (
    SECRET_EXACT_KEYS.has(normalized) ||
    SECRET_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment))
  );
}

function isPhoneKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return (
    PHONE_EXACT_KEYS.has(normalized) ||
    PHONE_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment))
  );
}

function isEmailKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return EMAIL_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

/** Conserva solo los dos últimos dígitos; el resto del teléfono se descarta. */
export function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return REDACTED;
  return `***${digits.slice(-2)}`;
}

/** Deja la primera letra y el dominio: j***@ejemplo.com */
export function maskEmail(value: string): string {
  const at = value.indexOf("@");
  if (at <= 0) return REDACTED;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  return `${local.slice(0, 1)}***@${domain}`;
}

function truncate(text: string): string {
  if (text.length <= MAX_STRING_LENGTH) return text;
  return `${text.slice(0, MAX_STRING_LENGTH)}…[truncated]`;
}

/**
 * Redacta secretos, teléfonos y correos dentro de un texto libre.
 * Es deliberadamente conservador: ante la duda, prefiere redactar.
 */
export function redactText(input: string): string {
  let text = truncate(String(input ?? ""));
  text = text.replace(PRIVATE_KEY_PATTERN, "[REDACTED_PRIVATE_KEY]");
  text = text.replace(DATABASE_URL_PATTERN, "$1$2:[REDACTED]@");
  text = text.replace(JWT_PATTERN, "[REDACTED_JWT]");
  text = text.replace(BEARER_PATTERN, "Bearer [REDACTED]");
  text = text.replace(SECRET_ASSIGNMENT_PATTERN, "$1$2[REDACTED]");
  text = text.replace(
    INLINE_PHONE_PATTERN,
    (_match, label: string, separator: string, phone: string) => {
      return `${label}${separator}${maskPhone(phone)}`;
    },
  );
  text = text.replace(
    INTERNATIONAL_PHONE_PATTERN,
    (_match, prefix: string, phone: string) => `${prefix}${maskPhone(phone)}`,
  );
  text = text.replace(EMAIL_PATTERN, "$1***@$2");
  return text;
}

function phoneValue(value: unknown): unknown {
  if (typeof value === "string") return maskPhone(value);
  if (typeof value === "number" && Number.isFinite(value)) {
    return maskPhone(String(value));
  }
  if (typeof value === "bigint") return maskPhone(value.toString());
  return REDACTED;
}

function emailValue(value: unknown): unknown {
  if (typeof value === "string") return maskEmail(value);
  return REDACTED;
}

function isNumericOtp(value: unknown): boolean {
  if (typeof value === "number") {
    return Number.isInteger(value) && String(value).length >= 4 && String(value).length <= 8;
  }
  return typeof value === "string" && /^\d{4,8}$/.test(value.trim());
}

function errorToObject(error: Error, depth: number): Record<string, unknown> {
  const record: Record<string, unknown> = {
    name: error.name,
    message: redactText(error.message),
  };
  if (error.stack) record.stack = redactText(error.stack);
  if (error.cause !== undefined && depth < 3) {
    record.cause =
      error.cause instanceof Error
        ? errorToObject(error.cause, depth + 1)
        : redactInternal(error.cause, depth + 1, new WeakSet());
  }
  return record;
}

function redactInternal(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactText(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return `${value.toString()}n`;
  if (typeof value === "function") return "[Function]";
  if (typeof value === "symbol") return "[Symbol]";

  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return errorToObject(value, 0);

  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) {
    return `<Buffer ${value.length} bytes>`;
  }

  if (typeof value !== "object") return String(value);
  if (depth >= MAX_DEPTH) return "[MaxDepth]";
  if (value instanceof Map) return `[Map(${value.size})]`;
  if (value instanceof Set) return `[Set(${value.size})]`;

  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_ITEMS).map((item) => redactInternal(item, depth + 1, seen));
    if (value.length > MAX_ARRAY_ITEMS) {
      items.push(`[...${value.length - MAX_ARRAY_ITEMS} more]`);
    }
    return items;
  }

  const output: Record<string, unknown> = {};
  let keys: string[];
  try {
    keys = Object.keys(value);
  } catch {
    return "[Unreadable]";
  }

  for (const key of keys) {
    // No ejecutar getters arbitrarios al serializar.
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) {
      output[key] = "[Getter]";
      continue;
    }
    const child = descriptor.value;

    if (isSecretKey(key)) {
      output[key] = REDACTED;
      continue;
    }
    if (isPhoneKey(key)) {
      output[key] = phoneValue(child);
      continue;
    }
    if (isEmailKey(key)) {
      output[key] = emailValue(child);
      continue;
    }
    // Muchos flujos llaman "code" al OTP. Redactar solo si es numérico de 4-8
    // dígitos, para no ocultar códigos de error/estado.
    if (normalizeKey(key) === "code" && isNumericOtp(child)) {
      output[key] = REDACTED;
      continue;
    }

    output[key] = redactInternal(child, depth + 1, seen);
  }

  return output;
}

/** Devuelve una copia segura para logs de cualquier valor de contexto. */
export function redact(value: unknown): unknown {
  return redactInternal(value, 0, new WeakSet<object>());
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) return errorToObject(error, 0);
  return { value: redact(error) };
}

interface RequestStore {
  requestId: string;
}

const requestStorage = new AsyncLocalStorage<RequestStore>();

/** Genera un id de correlación apto para headers y logs. */
export function newRequestId(): string {
  return randomUUID();
}

/** Acepta ids alfanuméricos de 8 a 128 caracteres; evita inyección en logs. */
export function normalizeRequestId(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Reutiliza x-request-id / x-correlation-id, luego el trace-id de W3C
 * traceparent, y si no hay ninguno genera uno nuevo.
 */
export function requestIdFromHeaders(headers: Headers): string {
  const direct =
    normalizeRequestId(headers.get("x-request-id")) ??
    normalizeRequestId(headers.get("x-correlation-id"));
  if (direct) return direct;

  const traceparent = headers.get("traceparent");
  if (traceparent) {
    const parts = traceparent.split("-");
    const traceId = parts[1];
    if (traceId && /^[0-9a-f]{32}$/i.test(traceId) && !/^0+$/.test(traceId)) {
      return traceId;
    }
  }

  return newRequestId();
}

/** Ejecuta un handler con un requestId disponible para el logger. */
export function runWithRequestId<T>(requestId: string, fn: () => T): T {
  const normalized = normalizeRequestId(requestId) ?? newRequestId();
  return requestStorage.run({ requestId: normalized }, fn);
}

export function getRequestId(): string | undefined {
  return requestStorage.getStore()?.requestId;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeStringify(entry: Record<string, unknown>): string {
  try {
    return JSON.stringify(entry);
  } catch {
    try {
      return JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "error",
        msg: "log_serialization_failed",
        service: SERVICE_NAME,
      });
    } catch {
      return '{"level":"error","msg":"log_serialization_failed"}';
    }
  }
}

function writeLine(level: LogLevel, line: string): void {
  const stream = level === "warn" || level === "error" || level === "fatal"
    ? process.stderr
    : process.stdout;
  try {
    stream.write(`${line}\n`);
  } catch {
    // Nunca dejar que un fallo de logging tumbe el request.
  }
}

function createLoggerWithBindings(bindings: LogContext): Logger {
  const log = (level: LogLevel, message: string, context?: LogContext): void => {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[minimumLevel]) return;

    const safeBindings = redact(bindings);
    const safeContext = context === undefined ? {} : redact(context);
    const boundFields = isPlainRecord(safeBindings) ? safeBindings : { bindings: safeBindings };
    const contextFields = isPlainRecord(safeContext) ? safeContext : { context: safeContext };

    const explicitRequestId =
      typeof boundFields.requestId === "string" ? boundFields.requestId : undefined;
    const requestId = explicitRequestId ?? getRequestId();

    // Los campos reservados se escriben al final para que el contexto no los pise.
    const entry: Record<string, unknown> = {
      ...boundFields,
      ...contextFields,
      timestamp: new Date().toISOString(),
      level,
      msg: redactText(message),
      service: SERVICE_NAME,
      env: ENVIRONMENT,
      ...(APP_VERSION ? { version: APP_VERSION } : {}),
      ...(requestId ? { requestId } : {}),
    };

    writeLine(level, safeStringify(entry));
  };

  return {
    debug: (message, context) => log("debug", message, context),
    info: (message, context) => log("info", message, context),
    warn: (message, context) => log("warn", message, context),
    error: (message, context) => log("error", message, context),
    fatal: (message, context) => log("fatal", message, context),
    child: (childBindings) => createLoggerWithBindings({ ...bindings, ...childBindings }),
  };
}

export function createLogger(bindings: LogContext = {}): Logger {
  return createLoggerWithBindings(bindings);
}

/** Logger raíz. Usar `logger.child({ requestId })` o runWithRequestId. */
export const logger: Logger = createLogger();

/** Serializa un error con stack redactado, sin volcar datos extraños. */
export function logError(error: unknown): Record<string, unknown> {
  return serializeError(error);
}

/** Nivel efectivo (útil para health/diagnóstico). */
export function getLogLevel(): LogLevel {
  return minimumLevel;
}