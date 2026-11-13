import * as jose from "jose";
import { getDb } from "./queries/connection";
import { drivers } from "@db/schema";
import { eq } from "drizzle-orm";
import { env } from "./lib/env";
import { getSessionCookieOptions } from "./lib/cookies";

const JWT_ALG = "HS256";
const ACCESS_EXPIRY = "24 hours";
const REFRESH_EXPIRY = "30 days";

export async function signDriverTokens(driverId: number) {
  const secret = new TextEncoder().encode(env.appSecret);
  const accessPayload = { driverId, type: "access" };
  const refreshPayload = { driverId, type: "refresh", jti: crypto.randomUUID() };

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

export async function verifyDriverToken(token: string): Promise<number | null> {
  const secret = new TextEncoder().encode(env.appSecret);
  try {
    const { payload } = await jose.jwtVerify(token, secret, { algorithms: [JWT_ALG] });
    if (payload.type !== "access") return null;
    return payload.driverId as number;
  } catch {
    return null;
  }
}

export async function verifyDriverRefreshToken(token: string): Promise<number | null> {
  const secret = new TextEncoder().encode(env.appSecret);
  try {
    const { payload } = await jose.jwtVerify(token, secret, { algorithms: [JWT_ALG] });
    if (payload.type !== "refresh") return null;
    return payload.driverId as number;
  } catch {
    return null;
  }
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
  const tokens = await signDriverTokens(driverId);
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

export async function refreshDriverAccessToken(refreshToken: string): Promise<{ access: string; refresh: string } | null> {
  const driverId = await verifyDriverRefreshToken(refreshToken);
  if (!driverId) return null;
  return signDriverTokens(driverId);
}
