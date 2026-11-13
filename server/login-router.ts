import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { users, drivers, commerces, customers } from "@db/schema";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { env } from "./lib/env";
import { setAdminCookie, clearAdminCookie, verifyAdminRefreshToken } from "./admin-auth";
import {
  setDriverCookies,
  clearDriverCookies,
  verifyDriverRefreshTokenPayload,
} from "./driver-auth";
import { setMerchantCookie, clearMerchantCookie, verifyMerchantRefreshToken } from "./merchant-auth";
import { clearCustomerCookies, setCustomerCookies, verifyRefreshTokenPayload } from "./customer-auth";

const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_FAILURES = 8;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;
const LOGIN_MAX_ENTRIES = 2_000;

interface LoginAttempt {
  count: number;
  firstAt: number;
  blockedUntil?: number;
}

const loginAttempts = new Map<string, LoginAttempt>();
// Hash válido para igualar el coste de bcrypt cuando el email/teléfono no existe.
const DUMMY_HASH = bcrypt.hashSync("rapidy-dummy-password", 10);

function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") || "local";
}

function loginKey(req: Request, identifier: string): string {
  return `${clientIp(req)}:${identifier || "unknown"}`;
}

function assertLoginAllowed(key: string) {
  const now = Date.now();
  const attempt = loginAttempts.get(key);
  if (!attempt) return;
  if (attempt.blockedUntil && attempt.blockedUntil > now) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Demasiados intentos fallidos. Espera unos minutos antes de volver a intentar.",
    });
  }
  if (now - attempt.firstAt > LOGIN_WINDOW_MS) {
    loginAttempts.delete(key);
  }
}

function recordLoginFailure(key: string) {
  const now = Date.now();
  const current = loginAttempts.get(key);
  if (!current || now - current.firstAt > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAt: now });
    return;
  }
  current.count += 1;
  if (current.count >= LOGIN_MAX_FAILURES) {
    current.blockedUntil = now + LOGIN_BLOCK_MS;
  }
  loginAttempts.set(key, current);

  if (loginAttempts.size > LOGIN_MAX_ENTRIES) {
    for (const [entryKey, entry] of loginAttempts) {
      if ((entry.blockedUntil ?? 0) < now && now - entry.firstAt > LOGIN_WINDOW_MS) {
        loginAttempts.delete(entryKey);
      }
    }
  }
}

function clearLoginFailures(key: string) {
  loginAttempts.delete(key);
}

export async function seedAdminUser() {
  if (!env.adminEmail || !env.adminPassword) return;
  const db = getDb();
  const existing = await db.select().from(users).where(eq(users.email, env.adminEmail));
  if (existing.length > 0) return;
  const hash = await bcrypt.hash(env.adminPassword, 10);
  await db.insert(users).values({
    unionId: env.ownerUnionId || "admin-local",
    name: env.adminName,
    email: env.adminEmail,
    passwordHash: hash,
    role: "admin",
  });
  console.log("[seed] Admin user created:", env.adminEmail);
}

export const loginRouter = createRouter({
  login: publicQuery
    .input(z.object({
      email: z.string().email().optional(),
      phone: z.string().optional(),
      password: z.string().min(1, "Contraseña requerida").max(200),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const identifier = input.email?.trim().toLowerCase()
        || input.phone?.replace(/\D/g, "")
        || "unknown";
      const attemptKey = loginKey(ctx.req, identifier);
      assertLoginAllowed(attemptKey);

      if (input.email) {
        const email = input.email.trim().toLowerCase();
        const userResult = await db.select().from(users).where(eq(users.email, email));
        const user = userResult[0];
        // Se compara siempre, incluso sin usuario, para no filtrar por timing
        // si el email existe.
        const valid = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
        if (user && user.passwordHash && valid) {
          if (user.role !== "admin" && user.role !== "merchant") {
            recordLoginFailure(attemptKey);
            return { success: false, message: "Credenciales inválidas" };
          }

          // Un solo rol profesional activo por navegador. La sesión de
          // cliente es independiente y no se toca aquí.
          if (user.role === "admin") {
            clearDriverCookies(ctx.resHeaders);
            clearMerchantCookie(ctx.resHeaders);
            await setAdminCookie(ctx.resHeaders, ctx.req.headers, user.id);
          } else {
            clearAdminCookie(ctx.resHeaders);
            clearDriverCookies(ctx.resHeaders);
            const merchant = await setMerchantCookie(ctx.resHeaders, ctx.req.headers, user.id);
            if (!merchant) {
              recordLoginFailure(attemptKey);
              return { success: false, message: "Credenciales inválidas" };
            }
          }

          clearLoginFailures(attemptKey);
          await db.update(users).set({ lastSignInAt: new Date() }).where(eq(users.id, user.id));
          const result: any = {
            success: true,
            role: user.role,
            user: { id: user.id, name: user.name, email: user.email, role: user.role },
          };
          if (user.role === "merchant") {
            const commerceResult = await db
              .select()
              .from(commerces)
              .where(eq(commerces.merchantUserId, user.id))
              .orderBy(commerces.id)
              .limit(1);
            if (commerceResult.length > 0) {
              result.commerceId = commerceResult[0].id;
              result.user.commerceId = commerceResult[0].id;
            }
          }
          return result;
        }
      }

      if (input.phone) {
        const normalizedPhone = input.phone.replace(/\D/g, "");
        let driverResult = await db
          .select()
          .from(drivers)
          .where(eq(drivers.phone, normalizedPhone));

        // Fallback por últimos 9 dígitos: tolera +593, 0 inicial y formatos legacy.
        if (driverResult.length === 0 && normalizedPhone.length >= 9) {
          const national = normalizedPhone.slice(-9);
          driverResult = await db
            .select()
            .from(drivers)
            .where(
              sql`right(regexp_replace(${drivers.phone}, '[^0-9]', '', 'g'), 9) = ${national}`,
            );
        }

        const driver = driverResult[0];
        const valid = await bcrypt.compare(input.password, driver?.passwordHash ?? DUMMY_HASH);
        if (driver && driver.passwordHash && valid) {
          clearLoginFailures(attemptKey);
          clearAdminCookie(ctx.resHeaders);
          clearMerchantCookie(ctx.resHeaders);
          const session = await setDriverCookies(ctx.resHeaders, ctx.req.headers, driver.id);
          if (!session) {
            recordLoginFailure(attemptKey);
            return { success: false, message: "Credenciales inválidas" };
          }
          return {
            success: true,
            role: "driver",
            user: { id: driver.id, name: driver.name, phone: driver.phone, role: "driver" },
          };
        }
      }

      recordLoginFailure(attemptKey);
      return { success: false, message: "Credenciales inválidas" };
    }),

  checkAuth: publicQuery.query(async ({ ctx }) => {
    if (ctx.admin) {
      return { authenticated: true, role: "admin", user: { id: ctx.admin.id, name: ctx.admin.name, email: ctx.admin.email, role: "admin" } };
    }
    if (ctx.merchant) {
      const db = getDb();
      const commerce = await db
        .select({ id: commerces.id })
        .from(commerces)
        .where(eq(commerces.merchantUserId, ctx.merchant.id))
        .orderBy(commerces.id)
        .limit(1);
      return {
        authenticated: true,
        role: "merchant",
        user: {
          id: ctx.merchant.id,
          name: ctx.merchant.name,
          email: ctx.merchant.email,
          role: "merchant",
          commerceId: commerce[0]?.id ?? null,
        },
      };
    }
    if (ctx.driver) {
      return { authenticated: true, role: "driver", user: { id: ctx.driver.id, name: ctx.driver.name, phone: ctx.driver.phone, role: "driver" } };
    }
    if (ctx.customer) {
      return { authenticated: true, role: "customer", user: { id: ctx.customer.id, firstName: ctx.customer.firstName, lastName: ctx.customer.lastName, phone: ctx.customer.phone, role: "customer" } };
    }
    return { authenticated: false, role: null, user: null };
  }),

  logout: publicQuery
    .input(
      z
        .object({
          scope: z.enum(["all", "admin", "driver", "merchant", "customer"]).optional(),
        })
        .optional(),
    )
    .mutation(async ({ input, ctx }) => {
      const scope = input?.scope ?? "all";
      if (scope === "all" || scope === "admin") clearAdminCookie(ctx.resHeaders);
      if (scope === "all" || scope === "driver") clearDriverCookies(ctx.resHeaders);
      if (scope === "all" || scope === "merchant") clearMerchantCookie(ctx.resHeaders);
      if (scope === "all" || scope === "customer") {
        clearCustomerCookies(ctx.resHeaders, ctx.req.headers);
      }
      return { success: true, scope };
    }),

  refresh: publicQuery.mutation(async ({ ctx }) => {
    const raw = ctx.req.headers.get("cookie") || "";
    const cookies = Object.fromEntries(
      raw.split(";").filter(Boolean).map(c => {
        const [k, ...v] = c.trim().split("=");
        return [decodeURIComponent(k), decodeURIComponent(v.join("="))];
      })
    );

    // Try admin refresh
    const adminRefresh = cookies["quickgo_admin_refresh"];
    if (adminRefresh) {
      const userId = await verifyAdminRefreshToken(adminRefresh);
      if (userId) {
        await setAdminCookie(ctx.resHeaders, ctx.req.headers, userId);
        return { success: true, role: "admin" };
      }
    }

    // Try driver refresh
    const driverRefresh = cookies["quickgo_driver_refresh"];
    if (driverRefresh) {
      const payload = await verifyDriverRefreshTokenPayload(driverRefresh);
      if (payload) {
        const db = getDb();
        const rows = await db.select().from(drivers).where(eq(drivers.id, payload.driverId));
        const driver = rows[0];
        if (
          driver &&
          (payload.sessionVersion === null ||
            (driver.sessionVersion ?? 0) === payload.sessionVersion)
        ) {
          const session = await setDriverCookies(ctx.resHeaders, ctx.req.headers, driver.id);
          if (session) return { success: true, role: "driver" };
        }
      }
    }

    // Try merchant refresh
    const merchantRefresh = cookies["quickgo_merchant_refresh"];
    if (merchantRefresh) {
      const userId = await verifyMerchantRefreshToken(merchantRefresh);
      if (userId) {
        const merchant = await setMerchantCookie(ctx.resHeaders, ctx.req.headers, userId);
        if (merchant) return { success: true, role: "merchant" };
      }
    }

    // Try customer refresh
    const customerRefresh = cookies["refresh_token"];
    if (customerRefresh) {
      const payload = await verifyRefreshTokenPayload(decodeURIComponent(customerRefresh));
      if (payload) {
        const db = getDb();
        const rows = await db.select().from(customers).where(eq(customers.id, payload.customerId));
        const customer = rows[0];
        if (
          customer &&
          !customer.deletedAt &&
          (customer.sessionVersion ?? 0) === payload.sessionVersion
        ) {
          await setCustomerCookies(ctx.resHeaders, ctx.req.headers, customer.id);
          return { success: true, role: "customer" };
        }
      }
    }

    return { success: false, role: null };
  }),
});