import * as jose from "jose";
import { getDb } from "./queries/connection";
import { users } from "@db/schema";
import { eq } from "drizzle-orm";
import { env } from "./lib/env";
import { getSessionCookieOptions } from "./lib/cookies";

const JWT_ALG = "HS256";
const ACCESS_EXPIRY = "15 minutes";
const REFRESH_EXPIRY = "7 days";
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60;

export interface AdminTokenPayload {
  userId: number;
  sessionVersion: number | null;
}

export async function signAdminToken(userId: number, sessionVersion = 0) {
  const secret = new TextEncoder().encode(env.appSecret);
  return new jose.SignJWT({ userId, role: "admin", sessionVersion, type: "access" })
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setExpirationTime(ACCESS_EXPIRY)
    .sign(secret);
}

export async function signAdminRefreshToken(userId: number, sessionVersion = 0) {
  const secret = new TextEncoder().encode(env.appSecret);
  return new jose.SignJWT({
    userId,
    role: "admin",
    sessionVersion,
    type: "refresh",
    jti: crypto.randomUUID(),
  })
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setExpirationTime(REFRESH_EXPIRY)
    .sign(secret);
}

export async function verifyAdminTokenPayload(
  token: string,
): Promise<AdminTokenPayload | null> {
  const secret = new TextEncoder().encode(env.appSecret);
  try {
    const { payload } = await jose.jwtVerify(token, secret, { algorithms: [JWT_ALG] });
    if (
      payload.type !== "access" ||
      payload.role !== "admin" ||
      typeof payload.userId !== "number"
    ) {
      return null;
    }
    return {
      userId: payload.userId,
      sessionVersion:
        typeof payload.sessionVersion === "number" ? payload.sessionVersion : null,
    };
  } catch {
    return null;
  }
}

export async function verifyAdminRefreshTokenPayload(
  token: string,
): Promise<AdminTokenPayload | null> {
  const secret = new TextEncoder().encode(env.appSecret);
  try {
    const { payload } = await jose.jwtVerify(token, secret, { algorithms: [JWT_ALG] });
    if (
      payload.type !== "refresh" ||
      payload.role !== "admin" ||
      typeof payload.userId !== "number"
    ) {
      return null;
    }
    return {
      userId: payload.userId,
      sessionVersion:
        typeof payload.sessionVersion === "number" ? payload.sessionVersion : null,
    };
  } catch {
    return null;
  }
}

export async function verifyAdminToken(token: string): Promise<number | null> {
  return (await verifyAdminTokenPayload(token))?.userId ?? null;
}

export async function verifyAdminRefreshToken(token: string): Promise<number | null> {
  return (await verifyAdminRefreshTokenPayload(token))?.userId ?? null;
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

export async function setAdminCookie(resHeaders: Headers, reqHeaders: Headers, userId: number) {
  const db = getDb();
  const result = await db.select().from(users).where(eq(users.id, userId));
  if (result.length === 0 || result[0].role !== "admin") return null;
  const sessionVersion = result[0].sessionVersion ?? 0;
  const token = await signAdminToken(userId, sessionVersion);
  const refreshToken = await signAdminRefreshToken(userId, sessionVersion);
  const cookieOpts = getSessionCookieOptions(reqHeaders);
  resHeaders.append("Set-Cookie", serializeCookie("quickgo_admin_token", token, {
    ...cookieOpts,
    maxAge: 15 * 60,
    path: "/",
    httpOnly: true,
  }));
  resHeaders.append("Set-Cookie", serializeCookie("quickgo_admin_refresh", refreshToken, {
    ...cookieOpts,
    maxAge: REFRESH_MAX_AGE,
    path: "/",
    httpOnly: true,
  }));
  return result[0];
}

export async function clearAdminCookie(resHeaders: Headers) {
  resHeaders.append("Set-Cookie", `quickgo_admin_token=; Path=/; Max-Age=0; HttpOnly`);
  resHeaders.append("Set-Cookie", `quickgo_admin_refresh=; Path=/; Max-Age=0; HttpOnly`);
}

export async function clearAdminRefreshCookie(resHeaders: Headers) {
  resHeaders.append("Set-Cookie", `quickgo_admin_refresh=; Path=/; Max-Age=0; HttpOnly`);
}