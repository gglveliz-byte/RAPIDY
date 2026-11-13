import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value ?? "";
}

const appSecret = required("APP_SECRET");
if (process.env.NODE_ENV === "production") {
  if (
    appSecret.length < 32 ||
    /your_jwt|change[_-]?me|example|secret_here/i.test(appSecret)
  ) {
    throw new Error(
      "APP_SECRET inseguro: usa un secreto único de al menos 32 caracteres en producción",
    );
  }
  const adminPassword = process.env.ADMIN_PASSWORD ?? "";
  if (adminPassword && adminPassword.length < 12) {
    throw new Error("ADMIN_PASSWORD debe tener al menos 12 caracteres en producción");
  }
}

export const env = {
  appId: required("APP_ID"),
  appSecret,
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: required("DATABASE_URL"),
  ownerUnionId: process.env.OWNER_UNION_ID ?? "",
  adminEmail: process.env.ADMIN_EMAIL ?? "",
  adminPassword: process.env.ADMIN_PASSWORD ?? "",
  adminName: process.env.ADMIN_NAME ?? "Admin",
  neurochatApiKey: process.env.NEUROCHAT_API_KEY ?? "",
  neurochatOtpFrom: process.env.NEUROCHAT_OTP_FROM ?? "",
  neurochatBaseUrl: process.env.NEUROCHAT_BASE_URL ?? "https://api.neurochat.com.ec/api/v1",
  otpLength: Math.min(8, Math.max(4, Number(process.env.OTP_LENGTH ?? 6))),
  otpExpiryMinutes: Math.min(30, Math.max(1, Number(process.env.OTP_EXPIRY_MINUTES ?? 5))),
  otpDevFallback: process.env.OTP_DEV_FALLBACK === "true" || (!process.env.NEUROCHAT_API_KEY && process.env.NODE_ENV !== "production"),
};
