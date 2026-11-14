import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { Customer, User, Driver } from "@db/schema";
import { verifyAccessTokenPayload, verifyRefreshTokenPayload, setCustomerCookies } from "./customer-auth";
import {
  verifyAdminTokenPayload,
  verifyAdminRefreshTokenPayload,
  setAdminCookie,
} from "./admin-auth";
import {
  verifyDriverTokenPayload,
  verifyDriverRefreshTokenPayload,
  refreshDriverAccessToken,
} from "./driver-auth";
import {
  verifyMerchantTokenPayload,
  verifyMerchantRefreshTokenPayload,
  setMerchantCookie,
} from "./merchant-auth";
import { getDb } from "./queries/connection";
import { customers, users, drivers } from "@db/schema";
import { eq, and } from "drizzle-orm";
import { getSessionCookieOptions } from "./lib/cookies";
import * as cookie from "cookie";

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

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  customer?: Customer;
  admin?: User;
  driver?: Driver;
  merchant?: User;
};

async function getCustomerFromCookie(headers: Headers, resHeaders: Headers): Promise<Customer | null> {
  const cookies = cookie.parse(headers.get("cookie") || "");
  const token = cookies["quickgo_token"];
  const refreshToken = cookies["refresh_token"];
  
  let customerId: number | null = null;
  let expectedSessionVersion: number | null = null;

  if (token) {
    const payload = await verifyAccessTokenPayload(token);
    customerId = payload?.customerId ?? null;
    expectedSessionVersion = payload?.sessionVersion ?? null;
  }

  if (!customerId && refreshToken) {
    const payload = await verifyRefreshTokenPayload(refreshToken);
    customerId = payload?.customerId ?? null;
    expectedSessionVersion = payload?.sessionVersion ?? null;
    if (customerId) {
      await setCustomerCookies(resHeaders, headers, customerId);
    }
  }

  if (!customerId) return null;

  const db = getDb();
  const result = await db.select().from(customers).where(eq(customers.id, customerId));
  const customer = result[0];
  if (!customer || customer.deletedAt) return null;
  if (expectedSessionVersion !== null && (customer.sessionVersion ?? 0) !== expectedSessionVersion) {
    return null;
  }
  return customer;
}

async function getAdminFromCookie(headers: Headers, resHeaders?: Headers): Promise<User | null> {
  const cookies = cookie.parse(headers.get("cookie") || "");
  const token = cookies["quickgo_admin_token"];
  const refreshToken = cookies["quickgo_admin_refresh"];

  let adminId: number | null = null;
  let expectedSessionVersion: number | null = null;

  if (token) {
    const payload = await verifyAdminTokenPayload(token);
    adminId = payload?.userId ?? null;
    expectedSessionVersion = payload?.sessionVersion ?? null;
  }

  if (!adminId && refreshToken) {
    const payload = await verifyAdminRefreshTokenPayload(refreshToken);
    adminId = payload?.userId ?? null;
    expectedSessionVersion = payload?.sessionVersion ?? null;
    if (adminId && resHeaders) {
      await setAdminCookie(resHeaders, headers, adminId);
    }
  }

  if (!adminId) return null;

  const db = getDb();
  const result = await db.select().from(users).where(eq(users.id, adminId));
  const user = result[0];
  if (!user || user.role !== "admin") return null;
  if (
    expectedSessionVersion !== null &&
    (user.sessionVersion ?? 0) !== expectedSessionVersion
  ) {
    return null;
  }
  return user;
}

async function getDriverFromCookie(headers: Headers, resHeaders: Headers): Promise<Driver | null> {
  const cookies = cookie.parse(headers.get("cookie") || "");
  const token = cookies["quickgo_driver_token"];
  const refreshToken = cookies["quickgo_driver_refresh"];

  let driverId: number | null = null;
  let expectedSessionVersion: number | null = null;

  if (token) {
    const payload = await verifyDriverTokenPayload(token);
    driverId = payload?.driverId ?? null;
    expectedSessionVersion = payload?.sessionVersion ?? null;
  }

  // If access token expired, try refresh token and set new cookies
  if (!driverId && refreshToken) {
    const payload = await verifyDriverRefreshTokenPayload(refreshToken);
    driverId = payload?.driverId ?? null;
    expectedSessionVersion = payload?.sessionVersion ?? null;
    if (driverId) {
      const tokens = await refreshDriverAccessToken(refreshToken);
      if (!tokens) return null;
      const cookieOpts = getSessionCookieOptions(headers);
      resHeaders.append("Set-Cookie", serializeCookie("quickgo_driver_token", tokens.access, { ...cookieOpts, maxAge: 24 * 60 * 60, path: "/", httpOnly: true }));
      resHeaders.append("Set-Cookie", serializeCookie("quickgo_driver_refresh", tokens.refresh, { ...cookieOpts, maxAge: 30 * 24 * 60 * 60, path: "/", httpOnly: true }));
    }
  }

  if (!driverId) return null;

  const db = getDb();
  const result = await db.select().from(drivers).where(eq(drivers.id, driverId));
  const driver = result[0];
  if (!driver) return null;
  if (
    expectedSessionVersion !== null &&
    (driver.sessionVersion ?? 0) !== expectedSessionVersion
  ) {
    return null;
  }
  return driver;
}

async function getMerchantFromCookie(headers: Headers, resHeaders: Headers): Promise<User | null> {
  const cookies = cookie.parse(headers.get("cookie") || "");
  const token = cookies["quickgo_merchant_token"];
  const refreshToken = cookies["quickgo_merchant_refresh"];

  let userId: number | null = null;
  let expectedSessionVersion: number | null = null;

  if (token) {
    const payload = await verifyMerchantTokenPayload(token);
    userId = payload?.userId ?? null;
    expectedSessionVersion = payload?.sessionVersion ?? null;
  }

  if (!userId && refreshToken) {
    const payload = await verifyMerchantRefreshTokenPayload(refreshToken);
    userId = payload?.userId ?? null;
    expectedSessionVersion = payload?.sessionVersion ?? null;
    if (userId) {
      const db = getDb();
      const result = await db.select().from(users).where(and(eq(users.id, userId), eq(users.role, "merchant")));
      if (result.length > 0) {
        await setMerchantCookie(resHeaders, headers, userId);
      }
    }
  }

  if (!userId) return null;

  const db = getDb();
  const result = await db.select().from(users).where(and(eq(users.id, userId), eq(users.role, "merchant")));
  const user = result[0];
  if (!user) return null;
  if (
    expectedSessionVersion !== null &&
    (user.sessionVersion ?? 0) !== expectedSessionVersion
  ) {
    return null;
  }
  return user;
}

export async function createContext(
  opts: FetchCreateContextFnOptions,
): Promise<TrpcContext> {
  const ctx: TrpcContext = { req: opts.req, resHeaders: opts.resHeaders };
  try {
    ctx.customer = await getCustomerFromCookie(opts.req.headers, opts.resHeaders) ?? undefined;
    ctx.admin = await getAdminFromCookie(opts.req.headers, opts.resHeaders) ?? undefined;
    ctx.driver = await getDriverFromCookie(opts.req.headers, opts.resHeaders) ?? undefined;
    ctx.merchant = await getMerchantFromCookie(opts.req.headers, opts.resHeaders) ?? undefined;
  } catch (err) {
    console.warn("[context] No se pudo resolver la sesión:", (err as Error)?.message);
  }
  return ctx;
}