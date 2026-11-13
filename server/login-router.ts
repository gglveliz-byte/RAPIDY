import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { users, drivers, commerces, customers } from "@db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { env } from "./lib/env";
import { setAdminCookie, clearAdminCookie, verifyAdminRefreshToken } from "./admin-auth";
import { setDriverCookies, clearDriverCookies, verifyDriverRefreshToken } from "./driver-auth";
import { setMerchantCookie, clearMerchantCookie, verifyMerchantRefreshToken } from "./merchant-auth";
import { clearCustomerCookies, setCustomerCookies, verifyRefreshTokenPayload } from "./customer-auth";

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
      password: z.string().min(1, "Contraseña requerida"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();

      if (input.email) {
        const email = input.email.trim().toLowerCase();
        const userResult = await db.select().from(users).where(eq(users.email, email));
        const user = userResult[0];
        if (user && user.passwordHash) {
          const valid = await bcrypt.compare(input.password, user.passwordHash);
          if (valid) {
            if (user.role !== "admin" && user.role !== "merchant") {
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
                return { success: false, message: "Credenciales inválidas" };
              }
            }

            await db.update(users).set({ lastSignInAt: new Date() }).where(eq(users.id, user.id));
            const result: any = {
              success: true,
              role: user.role,
              user: { id: user.id, name: user.name, email: user.email, role: user.role },
            };
            if (user.role === "merchant") {
              const commerceResult = await db.select().from(commerces).where(eq(commerces.merchantUserId, user.id));
              if (commerceResult.length > 0) {
                result.commerceId = commerceResult[0].id;
                result.user.commerceId = commerceResult[0].id;
              }
            }
            return result;
          }
        }
      }

      if (input.phone) {
        const normalizedPhone = input.phone.replace(/\D/g, "");
        let driverResult = await db.select().from(drivers).where(eq(drivers.phone, normalizedPhone));

        // Fallback: buscar sin código de país (para drivers creados con input de texto plano)
        if (driverResult.length === 0 && normalizedPhone.length > 7) {
          const countryCodes = ["54", "591", "56", "57", "506", "53", "1809", "593", "503", "502", "504", "52", "505", "507", "595", "51", "1787", "598", "58", "34", "1", "44", "33", "39", "55"];
          for (const cc of countryCodes) {
            if (normalizedPhone.startsWith(cc)) {
              const withoutCC = normalizedPhone.slice(cc.length);
              driverResult = await db.select().from(drivers).where(eq(drivers.phone, withoutCC));
              if (driverResult.length > 0) break;
            }
          }
        }

        const driver = driverResult[0];
        if (driver && driver.passwordHash) {
          const valid = await bcrypt.compare(input.password, driver.passwordHash);
          if (valid) {
            await setDriverCookies(ctx.resHeaders, ctx.req.headers, driver.id);
            return {
              success: true,
              role: "driver",
              user: { id: driver.id, name: driver.name, phone: driver.phone, role: "driver" },
            };
          }
        }
      }

      return { success: false, message: "Credenciales inválidas" };
    }),

  seedAdmin: publicQuery.mutation(async () => {
    await seedAdminUser();
    return { success: true };
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
      const driverId = await verifyDriverRefreshToken(driverRefresh);
      if (driverId) {
        await setDriverCookies(ctx.resHeaders, ctx.req.headers, driverId);
        return { success: true, role: "driver" };
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