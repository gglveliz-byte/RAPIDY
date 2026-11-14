#!/usr/bin/env node
/**
 * Smoke de producción para /api/health.
 *
 * Verifica disponibilidad, contrato mínimo, latencia y que la respuesta no
 * exponga secretos, PII ni detalles internos. No usa base de datos, no
 * reinicia el servidor y no modifica datos.
 *
 * Uso:
 *   node scripts/production-health-smoke.mjs
 *   HEALTH_BASE_URL=https://rapidy.example.com node scripts/production-health-smoke.mjs
 */
import "dotenv/config";

const BASE_URL =
  process.env.HEALTH_BASE_URL || process.env.E2E_BASE_URL || "http://localhost:3000";
const HEALTH_PATH = process.env.HEALTH_PATH || "/api/health";
const TIMEOUT_MS = readPositiveInt("HEALTH_TIMEOUT_MS", 10_000);
const MAX_LATENCY_MS = readPositiveInt("HEALTH_MAX_LATENCY_MS", 2_000);
const MAX_BODY_BYTES = 64 * 1024;

const results = [];

function readPositiveInt(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
}

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function describeError(error) {
  if (error?.name === "TimeoutError") return `timeout tras ${TIMEOUT_MS}ms`;
  const code = error?.code || error?.cause?.code || "";
  const message = String(error?.message || error)
    .replace(/postgres(ql)?:\/\/[^@\s]+@/gi, "postgres://[REDACTED]@")
    .replace(/\s+/g, " ")
    .slice(0, 180);
  return [code, message].filter(Boolean).join(": ");
}

const SENSITIVE_KEY =
  /(password|passwd|pwd|secret|token|authorization|cookie|api[-_]?key|private[-_]?key|otp|connection[-_]?string|database[-_]?url|session[-_]?id|phone|telefono|teléfono|email|correo|stack)/i;

function findSensitiveKeys(value, path = "$", depth = 0, found = []) {
  if (found.length >= 10 || depth > 8 || value === null || typeof value !== "object") {
    return found;
  }
  if (Array.isArray(value)) {
    value.slice(0, 100).forEach((item, index) => {
      findSensitiveKeys(item, `${path}[${index}]`, depth + 1, found);
    });
    return found;
  }
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (SENSITIVE_KEY.test(key)) {
      found.push(childPath);
      continue;
    }
    findSensitiveKeys(child, childPath, depth + 1, found);
  }
  return found;
}

const SECRET_ENV_KEYS = [
  "APP_SECRET",
  "DATABASE_URL",
  "ADMIN_PASSWORD",
  "NEUROCHAT_API_KEY",
  "FIREBASE_SERVICE_ACCOUNT_JSON",
  "METRICS_TOKEN",
  "SENTRY_DSN",
];

function scanEnvLeaks(text) {
  const leaked = [];
  for (const name of SECRET_ENV_KEYS) {
    const value = process.env[name];
    if (!value || value.length < 8) continue;

    if (text.includes(value)) {
      leaked.push(name);
      continue;
    }

    if (name === "DATABASE_URL") {
      try {
        const url = new URL(value);
        if (url.password && text.includes(url.password)) leaked.push(`${name} (password)`);
      } catch {
        // URL inválida en el entorno: no se puede comparar.
      }
    }

    if (name === "FIREBASE_SERVICE_ACCOUNT_JSON") {
      try {
        const parsed = JSON.parse(value);
        if (parsed?.private_key && text.includes(parsed.private_key)) {
          leaked.push(`${name} (private_key)`);
        }
      } catch {
        // JSON inválido en el entorno: no se puede comparar.
      }
    }
  }
  return leaked;
}

const LEAK_PATTERNS = [
  { label: "connection string postgres", pattern: /postgres(ql)?:\/\//i },
  { label: "clave privada PEM", pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i },
  {
    label: "JWT",
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  },
  { label: "Bearer token", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/i },
  {
    label: "API key de proveedor",
    pattern: /\b(AIza[0-9A-Za-z_-]{35}|AKIA[0-9A-Z]{16}|sk_(live|test)_[0-9A-Za-z]{10,})\b/,
  },
  { label: "stack trace", pattern: /(?:^|\n|\\n)\s*at\s+[A-Za-z0-9_.$]+\s+\(/ },
  {
    label: "error interno de base de datos",
    pattern: /\b(password authentication failed|ECONNREFUSED|relation ".*" does not exist|getaddrinfo)\b/i,
  },
];

function isOkStatus(value) {
  return (
    typeof value === "string" &&
    ["ok", "healthy", "up"].includes(value.trim().toLowerCase())
  );
}

function failingChecks(body) {
  if (!body || typeof body !== "object" || !body.checks || typeof body.checks !== "object") {
    return [];
  }
  return Object.entries(body.checks)
    .map(([name, check]) => {
      const status = typeof check === "string" ? check : check?.status;
      return { name, status };
    })
    .filter(({ status }) => !isOkStatus(status))
    .map(({ name, status }) => `${name}=${String(status ?? "missing")}`);
}

function finish() {
  const failed = results.filter((result) => !result.ok);
  console.log(`\nRESULT ${results.length - failed.length}/${results.length} PASS`);
  if (failed.length > 0) {
    console.log("Revisa docs/production/OBSERVABILITY.md y el estado de /api/health.");
    process.exitCode = 1;
  }
}

async function main() {
  const targetUrl = new URL(HEALTH_PATH, BASE_URL);
  const target = `${targetUrl.protocol}//${targetUrl.host}${targetUrl.pathname}`;
  console.log(`Health smoke -> ${target} (timeout ${TIMEOUT_MS}ms)`);

  const sentRequestId = `health-smoke-${Date.now().toString(36)}`;
  const started = Date.now();
  let response;
  try {
    response = await fetch(targetUrl, {
      method: "GET",
      redirect: "manual",
      headers: {
        accept: "application/json",
        "user-agent": "rapidy-production-health-smoke/1.0",
        "x-request-id": sentRequestId,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    record("Endpoint /api/health responde", false, describeError(error));
    console.log(
      "Sugerencia: verifica el proceso y el puerto. Este script no reinicia localhost:3000.",
    );
    return;
  }

  const latencyMs = Date.now() - started;
  const contentType = response.headers.get("content-type") || "";
  const cacheControl = response.headers.get("cache-control") || "";
  const responseRequestId = response.headers.get("x-request-id") || "";
  const text = await response.text();
  const bodyBytes = Buffer.byteLength(text, "utf8");

  record(
    "HTTP 200",
    response.status === 200,
    `status=${response.status} latency=${latencyMs}ms`,
  );
  if (response.status === 404) {
    console.log(
      "Sugerencia: /api/health aún no está integrado. server/boot.ts pertenece a Seguridad; ver OBSERVABILITY.md.",
    );
  }
  if (response.status >= 300 && response.status < 400) {
    record("Sin redirecciones", false, `location=${response.headers.get("location") || "?"}`);
  }

  record(
    "Content-Type JSON",
    contentType.toLowerCase().includes("application/json") ||
      contentType.toLowerCase().includes("+json"),
    contentType || "ausente",
  );
  record(
    "Cache-Control no-store",
    /(?:^|,)\s*no-store\b/i.test(cacheControl),
    cacheControl || "ausente",
  );
  if (responseRequestId) {
    record(
      "X-Request-Id válido",
      /^[A-Za-z0-9._:-]{8,128}$/.test(responseRequestId),
      responseRequestId,
    );
  }
  record(
    "Tiempo de respuesta aceptable",
    latencyMs <= MAX_LATENCY_MS,
    `${latencyMs}ms (límite ${MAX_LATENCY_MS}ms)`,
  );
  record(
    "Respuesta acotada",
    bodyBytes <= MAX_BODY_BYTES,
    `${bodyBytes} bytes (máximo ${MAX_BODY_BYTES})`,
  );
  record(
    "Sin Set-Cookie",
    !response.headers.has("set-cookie"),
    response.headers.has("set-cookie") ? "la respuesta intenta crear sesión" : "",
  );
  record(
    "Sin X-Powered-By",
    !response.headers.has("x-powered-by"),
    response.headers.get("x-powered-by") || "",
  );

  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  record(
    "JSON válido y objeto",
    body !== null && typeof body === "object" && !Array.isArray(body),
  );

  if (body && typeof body === "object" && !Array.isArray(body)) {
    record(
      "status saludable",
      isOkStatus(body.status),
      `status=${String(body.status ?? "missing")}`,
    );

    const uptime = body.uptimeSeconds ?? body.uptime ?? body.uptime_s;
    if (uptime !== undefined) {
      record(
        "uptime numérico",
        typeof uptime === "number" && Number.isFinite(uptime) && uptime >= 0,
        String(uptime),
      );
    }

    const timestamp = body.timestamp ?? body.checkedAt;
    if (timestamp !== undefined) {
      record(
        "timestamp ISO válido",
        typeof timestamp === "string" && !Number.isNaN(Date.parse(timestamp)),
        typeof timestamp === "string" ? timestamp : "inválido",
      );
    }

    if (body.service !== undefined) {
      record(
        "service declarado",
        typeof body.service === "string" && body.service.trim().length > 0,
        typeof body.service === "string" ? body.service : "inválido",
      );
    }

    if (body.checks !== undefined || body.db !== undefined) {
      const dbCheck = body.checks?.db ?? body.db;
      const dbStatus = typeof dbCheck === "string" ? dbCheck : dbCheck?.status;
      record(
        "Check de base de datos ok",
        isOkStatus(dbStatus),
        String(dbStatus ?? "missing"),
      );

      const failing = failingChecks(body);
      record(
        "Todos los checks ok",
        failing.length === 0,
        failing.length > 0 ? `fallan: ${failing.join(", ")}` : "",
      );
    }
  }

  const envLeaks = scanEnvLeaks(text);
  record(
    "Sin valores de entorno sensibles",
    envLeaks.length === 0,
    envLeaks.length > 0 ? `expone: ${envLeaks.join(", ")}` : "",
  );

  const patternLeaks = LEAK_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(
    ({ label }) => label,
  );
  record(
    "Sin patrones de secretos o stack traces",
    patternLeaks.length === 0,
    patternLeaks.length > 0 ? `detectado: ${patternLeaks.join(", ")}` : "",
  );

  const sensitiveKeys = findSensitiveKeys(body);
  record(
    "Sin claves sensibles en el JSON",
    sensitiveKeys.length === 0,
    sensitiveKeys.length > 0 ? `encontradas: ${sensitiveKeys.join(", ")}` : "",
  );
}

try {
  await main();
} catch (error) {
  record("Smoke ejecutado", false, describeError(error));
}

finish();