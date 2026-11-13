import * as jose from "jose";
import { getDb } from "./queries/connection";
import { customers } from "@db/schema";
import { eq } from "drizzle-orm";
import { env } from "./lib/env";
import { getSessionCookieOptions } from "./lib/cookies";

const JWT_ALG = "HS256";
const ACCESS_EXPIRY = "15 minutes";
const REFRESH_EXPIRY = "365 days";
const REGISTRATION_EXPIRY = "10 minutes";

export interface CustomerTokenPayload {
  customerId: number;
  sessionVersion: number;
}

export async function signCustomerTokens(customerId: number, sessionVersion = 0) {
  const secret = new TextEncoder().encode(env.appSecret);
  const accessPayload = { customerId, sessionVersion, type: "access" };
  const refreshPayload = {
    customerId,
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

export async function verifyAccessTokenPayload(token: string): Promise<CustomerTokenPayload | null> {
  const secret = new TextEncoder().encode(env.appSecret);
  try {
    const { payload } = await jose.jwtVerify(token, secret, { algorithms: [JWT_ALG] });
    if (payload.type !== "access" || typeof payload.customerId !== "number") return null;
    return {
      customerId: payload.customerId,
      sessionVersion: typeof payload.sessionVersion === "number" ? payload.sessionVersion : 0,
    };
  } catch {
    return null;
  }
}

export async function verifyRefreshTokenPayload(token: string): Promise<CustomerTokenPayload | null> {
  const secret = new TextEncoder().encode(env.appSecret);
  try {
    const { payload } = await jose.jwtVerify(token, secret, { algorithms: [JWT_ALG] });
    if (payload.type !== "refresh" || typeof payload.customerId !== "number") return null;
    return {
      customerId: payload.customerId,
      sessionVersion: typeof payload.sessionVersion === "number" ? payload.sessionVersion : 0,
    };
  } catch {
    return null;
  }
}

export async function verifyAccessToken(token: string): Promise<number | null> {
  return (await verifyAccessTokenPayload(token))?.customerId ?? null;
}

export async function verifyRefreshToken(token: string): Promise<number | null> {
  return (await verifyRefreshTokenPayload(token))?.customerId ?? null;
}

/** Token de corta vida emitido tras verificar el teléfono por OTP. */
export async function signRegistrationToken(phone: string): Promise<string> {
  const secret = new TextEncoder().encode(env.appSecret);
  return new jose.SignJWT({ phone, type: "registration" })
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setExpirationTime(REGISTRATION_EXPIRY)
    .sign(secret);
}

export async function verifyRegistrationToken(token: string): Promise<string | null> {
  const secret = new TextEncoder().encode(env.appSecret);
  try {
    const { payload } = await jose.jwtVerify(token, secret, { algorithms: [JWT_ALG] });
    if (payload.type !== "registration" || typeof payload.phone !== "string") return null;
    return payload.phone;
  } catch {
    return null;
  }
}

function serializeCookie(
  name: string,
  value: string,
  opts: Record<string, string | number | boolean | Date>,
): string {
  let str = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
  if (opts.maxAge !== undefined) str += `; Max-Age=${opts.maxAge}`;
  if (opts.path) str += `; Path=${opts.path}`;
  if (opts.httpOnly) str += "; HttpOnly";
  if (opts.secure) str += "; Secure";
  if (opts.sameSite) str += `; SameSite=${opts.sameSite}`;
  if (opts.expires) str += `; Expires=${(opts.expires as Date).toUTCString()}`;
  return str;
}

export async function setCustomerCookies(
  resHeaders: Headers,
  reqHeaders: Headers,
  customerId: number,
) {
  const db = getDb();
  const result = await db.select().from(customers).where(eq(customers.id, customerId));
  if (result.length === 0) return;
  const customer = result[0];
  if (customer.deletedAt) return;

  const tokens = await signCustomerTokens(customerId, customer.sessionVersion ?? 0);
  const cookieOpts = getSessionCookieOptions(reqHeaders);

  resHeaders.append("Set-Cookie", serializeCookie("quickgo_token", tokens.access, {
    ...cookieOpts,
    maxAge: 15 * 60,
    path: "/",
    httpOnly: true,
  }));
  resHeaders.append("Set-Cookie", serializeCookie("refresh_token", tokens.refresh, {
    ...cookieOpts,
    maxAge: 365 * 24 * 60 * 60,
    path: "/",
    httpOnly: true,
  }));
  return customer;
}

export async function clearCustomerCookies(resHeaders: Headers, reqHeaders?: Headers) {
  const cookieOpts = reqHeaders ? getSessionCookieOptions(reqHeaders) : {};
  resHeaders.append("Set-Cookie", serializeCookie("quickgo_token", "", {
    ...cookieOpts,
    maxAge: 0,
    path: "/",
    httpOnly: true,
  }));
  resHeaders.append("Set-Cookie", serializeCookie("refresh_token", "", {
    ...cookieOpts,
    maxAge: 0,
    path: "/",
    httpOnly: true,
  }));
}