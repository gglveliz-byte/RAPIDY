import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { Customer, User, Driver } from "@db/schema";
import { verifyAccessToken } from "./customer-auth";
import { verifyAdminToken, verifyAdminRefreshToken, setAdminCookie } from "./admin-auth";
import { verifyDriverToken, refreshDriverAccessToken } from "./driver-auth";
import { verifyMerchantToken, verifyMerchantRefreshToken } from "./merchant-auth";
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
  
  if (token) {
    customerId = await verifyAccessToken(token);
  }

  if (!customerId && refreshToken) {
    const { verifyRefreshToken, setCustomerCookies } = await import("./customer-auth");
    customerId = await verifyRefreshToken(refreshToken);
    if (customerId) {
      await setCustomerCookies(resHeaders, headers, customerId);
    }
  }
  
  if (!customerId) return null;
  
  const db = getDb();
  const result = await db.select().from(customers).where(eq(customers.id, customerId));
  return result[0] || null;
}

async function getAdminFromCookie(headers: Headers, resHeaders?: Headers): Promise<User | null> {
  const cookies = cookie.parse(headers.get("cookie") || "");
  const token = cookies["quickgo_admin_token"];
  const refreshToken = cookies["quickgo_admin_refresh"];

  let adminId: number | null = null;
  if (token) {
    adminId = await verifyAdminToken(token);
  }

  if (!adminId && refreshToken) {
    adminId = await verifyAdminRefreshToken(refreshToken);
    if (adminId && resHeaders) {
      await setAdminCookie(resHeaders, headers, adminId);
    }
  }

  if (!adminId) return null;

  const db = getDb();
  const result = await db.select().from(users).where(eq(users.id, adminId));
  const user = result[0];
  return user?.role === "admin" ? user : null;
}

async function getDriverFromCookie(headers: Headers, resHeaders: Headers): Promise<Driver | null> {
  const cookies = cookie.parse(headers.get("cookie") || "");
  const token = cookies["quickgo_driver_token"];
  const refreshToken = cookies["quickgo_driver_refresh"];

  let driverId: number | null = null;

  if (token) {
    driverId = await verifyDriverToken(token);
  }

  // If access token expired, try refresh token and set new cookies
  if (!driverId && refreshToken) {
    const tokens = await refreshDriverAccessToken(refreshToken);
    if (tokens) {
      driverId = await verifyDriverToken(tokens.access);
      if (driverId) {
        const cookieOpts = getSessionCookieOptions(headers);
        resHeaders.append("Set-Cookie", serializeCookie("quickgo_driver_token", tokens.access, { ...cookieOpts, maxAge: 24 * 60 * 60, path: "/", httpOnly: true }));
        resHeaders.append("Set-Cookie", serializeCookie("quickgo_driver_refresh", tokens.refresh, { ...cookieOpts, maxAge: 30 * 24 * 60 * 60, path: "/", httpOnly: true, sameSite: "None" }));
      }
    }
  }

  if (!driverId) return null;

  const db = getDb();
  const result = await db.select().from(drivers).where(eq(drivers.id, driverId));
  return result[0] || null;
}

async function getMerchantFromCookie(headers: Headers, resHeaders: Headers): Promise<User | null> {
  const cookies = cookie.parse(headers.get("cookie") || "");
  const token = cookies["quickgo_merchant_token"];
  const refreshToken = cookies["quickgo_merchant_refresh"];

  let userId: number | null = null;

  if (token) {
    userId = await verifyMerchantToken(token);
  }

  if (!userId && refreshToken) {
    userId = await verifyMerchantRefreshToken(refreshToken);
    if (userId) {
      const db = getDb();
      const result = await db.select().from(users).where(and(eq(users.id, userId), eq(users.role, "merchant")));
      if (result.length > 0) {
        const { setMerchantCookie } = await import("./merchant-auth");
        await setMerchantCookie(resHeaders, headers, userId);
      }
    }
  }

  if (!userId) return null;

  const db = getDb();
  const result = await db.select().from(users).where(and(eq(users.id, userId), eq(users.role, "merchant")));
  return result[0] || null;
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
  } catch {}
  return ctx;
}