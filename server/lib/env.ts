import "dotenv/config";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Errores de configuración detectados al cargar el módulo. Se agrupan para que
 * un despliegue roto falle una sola vez mostrando todo lo que falta, sin
 * exponer nunca los valores de los secretos.
 */
const problems: string[] = [];

function read(name: string): string {
  return process.env[name] ?? "";
}

function requireInProduction(name: string, current: string): void {
  if (isProduction && !current.trim()) {
    problems.push(`falta ${name}`);
  }
}

function parseInteger(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = read(name).trim();
  if (!raw) return fallback;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    if (isProduction) {
      problems.push(`${name} debe ser un entero entre ${min} y ${max}`);
      return fallback;
    }
    return fallback;
  }

  if (parsed < min || parsed > max) {
    if (isProduction) {
      problems.push(`${name} debe estar entre ${min} y ${max}`);
      return fallback;
    }
    // En desarrollo se conserva el comportamiento histórico de recortar.
    return Math.min(max, Math.max(min, parsed));
  }

  return parsed;
}

function parseBoolean(name: string, fallback: boolean): boolean {
  const raw = read(name).trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;

  if (isProduction) {
    problems.push(`${name} debe ser true o false`);
  }
  return fallback;
}

function validateDatabaseUrl(databaseUrl: string): void {
  if (!databaseUrl.trim()) return;

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    problems.push("DATABASE_URL no es una URL válida");
    return;
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    problems.push("DATABASE_URL debe usar el esquema postgres:// o postgresql://");
  }
  if (!parsed.hostname) {
    problems.push("DATABASE_URL debe incluir un host");
  }
  if (!parsed.pathname.replace(/^\/+/, "")) {
    problems.push("DATABASE_URL debe incluir el nombre de la base de datos");
  }

  if (!isProduction) return;

  if (
    /(^|\/\/)(user|usuario):(pass|password|contraseña)@|host:port|@example\.(com|org)|change[_-]?me/i.test(
      databaseUrl,
    )
  ) {
    problems.push("DATABASE_URL contiene un placeholder; configura la cadena real");
  }
}

function validateNeurochatUrl(baseUrl: string): void {
  if (!baseUrl.trim()) return;

  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    problems.push("NEUROCHAT_BASE_URL no es una URL válida");
    return;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    problems.push("NEUROCHAT_BASE_URL debe usar http:// o https://");
  }
  if (isProduction && parsed.protocol !== "https:") {
    problems.push("NEUROCHAT_BASE_URL debe usar https:// en producción");
  }
}

function validateAdmin(email: string, password: string, secret: string): void {
  if (email) {
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      problems.push("ADMIN_EMAIL no es un email válido");
    }
    if (
      /@(example\.(com|org|net)|admin\.com|tudominio\.com|yourdomain\.com)$|change[_-]?me/i.test(
        email,
      )
    ) {
      problems.push("ADMIN_EMAIL contiene un placeholder; usa un buzón real");
    }
  }

  if (password) {
    if (password.length < 12) {
      problems.push("ADMIN_PASSWORD debe tener al menos 12 caracteres en producción");
    }
    if (/^(admin|password|changeme|change_me|rapidy|quickgo)/i.test(password)) {
      problems.push("ADMIN_PASSWORD es demasiado predecible; usa una contraseña única");
    }
    if (secret && password === secret) {
      problems.push("ADMIN_PASSWORD no debe ser igual a APP_SECRET");
    }
  }
}

// ── Lectura ──────────────────────────────────────────────────────────────────

const appId = read("APP_ID");
const appSecret = read("APP_SECRET");
const databaseUrl = read("DATABASE_URL");
const ownerUnionId = read("OWNER_UNION_ID").trim();
const adminEmail = read("ADMIN_EMAIL").trim();
const adminPassword = read("ADMIN_PASSWORD");
const adminName = read("ADMIN_NAME").trim() || "Admin";
const neurochatApiKey = read("NEUROCHAT_API_KEY").trim();
const neurochatOtpFrom = read("NEUROCHAT_OTP_FROM").trim();
const neurochatBaseUrl =
  read("NEUROCHAT_BASE_URL").trim() || "https://api.neurochat.com.ec/api/v1";
const neurochatTimeoutMs = parseInteger("NEUROCHAT_TIMEOUT_MS", 8_000, 2_000, 20_000);

const otpLength = parseInteger("OTP_LENGTH", 6, 4, 8);
const otpExpiryMinutes = parseInteger("OTP_EXPIRY_MINUTES", 5, 1, 30);
const otpDevFallbackFlag = parseBoolean("OTP_DEV_FALLBACK", false);

// ── Validación de producción ─────────────────────────────────────────────────

if (isProduction) {
  requireInProduction("APP_ID", appId);
  requireInProduction("APP_SECRET", appSecret);
  requireInProduction("DATABASE_URL", databaseUrl);
  requireInProduction("ADMIN_EMAIL", adminEmail);
  requireInProduction("ADMIN_PASSWORD", adminPassword);

  if (appSecret) {
    if (appSecret.length < 32) {
      problems.push("APP_SECRET debe tener al menos 32 caracteres en producción");
    }
    if (
      /your[_-]?(jwt|secret)|change[_-]?me|example|secret[_-]?here|rapidy[_-]?dev|quickgo[_-]?dev|development[_-]?secret/i.test(
        appSecret,
      )
    ) {
      problems.push("APP_SECRET parece un placeholder; genera un secreto único");
    }
    if (new Set(appSecret).size < 8) {
      problems.push("APP_SECRET tiene muy poca entropía; usa un valor aleatorio");
    }
    if (appId && appSecret === appId) {
      problems.push("APP_SECRET no debe ser igual a APP_ID");
    }
  }

  if (adminEmail && adminPassword) {
    validateAdmin(adminEmail, adminPassword, appSecret);
  }

  if (otpDevFallbackFlag) {
    problems.push(
      "OTP_DEV_FALLBACK no puede estar activo en producción; configura NEUROCHAT_API_KEY",
    );
  }
}

validateDatabaseUrl(databaseUrl);
validateNeurochatUrl(neurochatBaseUrl);

if (problems.length > 0) {
  throw new Error(
    `Configuración de entorno inválida${isProduction ? " para producción" : ""}:\n- ${problems.join("\n- ")}`,
  );
}

if (isProduction) {
  if (!neurochatApiKey) {
    console.warn(
      "[env] NEUROCHAT_API_KEY no está configurada: el envío de OTP fallará (OTP_DEV_FALLBACK está deshabilitado en producción).",
    );
  }
  if (!ownerUnionId) {
    console.warn(
      "[env] OWNER_UNION_ID no está configurada: se usará el valor local por defecto al crear el admin.",
    );
  }
}

// En producción el fallback de OTP nunca puede quedar activo, ni siquiera si
// NEUROCHAT_API_KEY falta. En desarrollo se mantiene el comportamiento previo:
// sin API Key se imprime el código en consola.
const otpDevFallback = isProduction
  ? false
  : otpDevFallbackFlag || !neurochatApiKey;

export const env = {
  appId,
  appSecret,
  isProduction,
  databaseUrl,
  ownerUnionId,
  adminEmail,
  adminPassword,
  adminName,
  neurochatApiKey,
  neurochatOtpFrom,
  neurochatBaseUrl,
  neurochatTimeoutMs,
  otpLength,
  otpExpiryMinutes,
  otpDevFallback,
};