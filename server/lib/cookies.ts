import type { CookieOptions } from "hono/utils/cookie";

function hostnameOf(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwarded || headers.get("host") || "";
  try {
    // Soporta "localhost:3000", "127.0.0.1:3000" y "[::1]:3000".
    return new URL(`http://${host}`).hostname.replace(/^\[|\]$/g, "").toLowerCase();
  } catch {
    return host.toLowerCase();
  }
}

function isLocalhost(headers: Headers): boolean {
  const hostname = hostnameOf(headers);
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1" ||
    hostname === "::1"
  );
}

function isHttps(headers: Headers): boolean {
  const proto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (proto) return proto === "https";
  const forwarded = headers.get("forwarded")?.toLowerCase() ?? "";
  return /(?:^|[;,]\s*)proto=https(?:[;,]|$)/.test(forwarded);
}

export function getSessionCookieOptions(headers: Headers): CookieOptions {
  const localhost = isLocalhost(headers);
  const production = process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    path: "/",
    // La app es same-origin (incluida la WebView de Capacitor que carga el
    // dominio remoto), así que Lax basta y reduce la superficie CSRF.
    sameSite: "Lax",
    // En producción fallar cerrado si el proxy no informa HTTPS; en dev se
    // permite HTTP local/LAN y HTTPS por túnel.
    secure: production ? !localhost : isHttps(headers),
  };
}
