import * as jose from "jose";
import { getDb } from "./queries/connection";
import { drivers } from "@db/schema";
import { eq } from "drizzle-orm";
import { env } from "./lib/env";
import { getSessionCookieOptions } from "./lib/cookies";

const JWT_ALG = "HS256";
const ACCESS_EXPIRY = "24 hours";
const REFRESH_EXPIRY = "30 days";

export async function signDriverTokens(driverId: number, sessionVersion = 0) {
  const secret = new TextEncoder().encode(env.appSecret);
  const accessPayload = { driverId, sessionVersion, type: "access" };
  const refreshPayload = {
    driverId,
    sessionVersion,
    type: "refresh",
    jti: crypto.randomUUID(),
  };

  const [access, refresh] = await Promise.all([
    new jose.SignJWT(accessPayload)
      .setProtectedHeader({ alg: JWT_ALG })
      .setIssuedAt()
      .setExpirationTime(ACCESS_EXPIRY)
      .sign(secret),
    new jose.SignJWT(refreshPayload)
      .setProtectedHeader({ alg: JWT_ALG })
      .setIssuedAt()
      .setExpirationTime(REFRESH_EXPIRY)
      .sign(secret),
  ]);
  return { access, refresh };
}

export interface DriverTokenPayload {
  driverId: number;
  sessionVersion: number | null;
}

export async function verifyDriverTokenPayload(token: string): Promise<DriverTokenPayload | null> {
  const secret = new TextEncoder().encode(env.appSecret);
  try {
    const { payload } = await jose.jwtVerify(token, secret, { algorithms: [JWT_ALG] });
    if (payload.type !== "access" || typeof payload.driverId !== "number") return null;
    return {
      driverId: payload.driverId,
      sessionVersion:
        typeof payload.sessionVersion === "number" ? payload.sessionVersion : null,
    };
  } catch {
    return null;
  }
}

export async function verifyDriverRefreshTokenPayload(
  token: string,
): Promise<DriverTokenPayload | null> {
  const secret = new TextEncoder().encode(env.appSecret);
  try {
    const { payload } = await jose.jwtVerify(token, secret, { algorithms: [JWT_ALG] });
    if (payload.type !== "refresh" || typeof payload.driverId !== "number") return null;
    return {
      driverId: payload.driverId,
      sessionVersion:
        typeof payload.sessionVersion === "number" ? payload.sessionVersion : null,
    };
  } catch {
    return null;
  }
}

export async function verifyDriverToken(token: string): Promise<number | null> {
  return (await verifyDriverTokenPayload(token))?.driverId ?? null;
}

export async function verifyDriverRefreshToken(token: string): Promise<number | null> {
  return (await verifyDriverRefreshTokenPayload(token))?.driverId ?? null;
}

function serializeCookie(name: string, value: string, opts: Record<string, string | number | boolean | Date>): string {
  let str = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
  if (opts.maxAge) str += `; Max-Age=${opts.maxAge}`;
  if (opts.path) str += `; Path=${opts.path}`;
  if (opts.httpOnly) str += "; HttpOnly";
  if (opts.secure) str += "; Secure";
  if (opts.sameSite) str += `; SameSite=${opts.sameSite}`;
  if (opts.expires) str += `; Expires=${(opts.expires as Date).toUTCString()}`;
  return str;
}

export async function setDriverCookies(resHeaders: Headers, reqHeaders: Headers, driverId: number) {
  const db = getDb();
  const result = await db.select().from(drivers).where(eq(drivers.id, driverId));
  if (result.length === 0) return null;
  const tokens = await signDriverTokens(driverId, result[0].sessionVersion ?? 0);
  const cookieOpts = getSessionCookieOptions(reqHeaders);
  resHeaders.append("Set-Cookie", serializeCookie("quickgo_driver_token", tokens.access, {
    ...cookieOpts,
    maxAge: 24 * 60 * 60,
    path: "/",
    httpOnly: true,
  }));
  resHeaders.append("Set-Cookie", serializeCookie("quickgo_driver_refresh", tokens.refresh, {
    ...cookieOpts,
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
    httpOnly: true,
  }));
  return result[0];
}

export async function clearDriverCookies(resHeaders: Headers) {
  resHeaders.append("Set-Cookie", `quickgo_driver_token=; Path=/; Max-Age=0; HttpOnly`);
  resHeaders.append("Set-Cookie", `quickgo_driver_refresh=; Path=/; Max-Age=0; HttpOnly`);
}

export async function refreshDriverAccessToken(
  refreshToken: string,
): Promise<{ access: string; refresh: string } | null> {
  const payload = await verifyDriverRefreshTokenPayload(refreshToken);
  if (!payload) return null;
  const db = getDb();
  const rows = await db.select().from(drivers).where(eq(drivers.id, payload.driverId));
  const driver = rows[0];
  if (!driver) return null;
  if (
    payload.sessionVersion !== null &&
    (driver.sessionVersion ?? 0) !== payload.sessionVersion
  ) {
    return null;
  }
  return signDriverTokens(driver.id, driver.sessionVersion ?? 0);
}
