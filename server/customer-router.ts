import { z } from "zod";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import crypto from "node:crypto";
import { createRouter, publicQuery, customerQuery, adminQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { accountDeletionRequests, customers, otpVerifications } from "@db/schema";
import {
  setCustomerCookies,
  clearCustomerCookies,
  verifyRefreshTokenPayload,
  signRegistrationToken,
  verifyRegistrationToken,
} from "./customer-auth";
import {
  normalizePhone,
  sendOtp,
  verifyOtpWithProvider,
  hashOtpCode,
  compareOtpCode,
  isDevOtpId,
} from "./lib/otp";
import { safeCustomer } from "./lib/order-access";
import { env } from "./lib/env";

const PHONE_WINDOW_MS = 10 * 60_000;
const PHONE_MAX_PER_WINDOW = 3;
const IP_WINDOW_MS = 60 * 60_000;
const IP_MAX_PER_WINDOW = 20;

function clientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return req.headers.get("x-real-ip");
}

function phoneVariants(phone: string): string[] {
  const variants = new Set([phone]);
  if (phone.startsWith("593")) variants.add(`0${phone.slice(3)}`);
  return [...variants];
}

async function findCustomerByPhone(phone: string) {
  const db = getDb();
  const variants = phoneVariants(phone);
  const rows = await db
    .select()
    .from(customers)
    .where(
      and(
        sql`REGEXP_REPLACE(${customers.phone}, '[^0-9]', '', 'g') IN (${sql.join(
          variants.map((v) => sql`${v}`),
          sql`, `,
        )})`,
        isNull(customers.deletedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function enforceOtpRateLimit(phone: string, ip: string | null) {
  const db = getDb();
  const now = Date.now();

  const phoneRows = await db
    .select({ id: otpVerifications.id })
    .from(otpVerifications)
    .where(
      and(
        eq(otpVerifications.phone, phone),
        gte(otpVerifications.createdAt, new Date(now - PHONE_WINDOW_MS)),
      ),
    );

  if (phoneRows.length >= PHONE_MAX_PER_WINDOW) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Pediste demasiados códigos. Espera unos minutos antes de intentar de nuevo.",
    });
  }

  const lastRow = await db
    .select({ createdAt: otpVerifications.createdAt })
    .from(otpVerifications)
    .where(eq(otpVerifications.phone, phone))
    .orderBy(desc(otpVerifications.createdAt))
    .limit(1);

  if (lastRow[0] && now - lastRow[0].createdAt.getTime() < 45_000) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Espera 45 segundos antes de pedir otro código.",
    });
  }

  if (ip) {
    const ipRows = await db
      .select({ id: otpVerifications.id })
      .from(otpVerifications)
      .where(
        and(
          eq(otpVerifications.ip, ip),
          gte(otpVerifications.createdAt, new Date(now - IP_WINDOW_MS)),
        ),
      );
    if (ipRows.length >= IP_MAX_PER_WINDOW) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Demasiadas solicitudes desde esta conexión. Intenta más tarde.",
      });
    }
  }
}

export const customerRouter = createRouter({
  requestOtp: publicQuery
    .input(
      z.object({
        phone: z.string().min(6).max(30),
        purpose: z.enum(["login", "register"]).default("login"),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const phone = normalizePhone(input.phone);
      const ip = clientIp(ctx.req);
      await enforceOtpRateLimit(phone, ip);

      const result = await sendOtp(phone);
      const codeHash = result.devCode ? await hashOtpCode(result.devCode) : null;

      const db = getDb();
      await db.insert(otpVerifications).values({
        phone,
        otpId: result.otpId,
        codeHash,
        provider: result.provider,
        purpose: input.purpose,
        status: "pending",
        ip,
        expiresAt: result.expiresAt,
      });

      return {
        success: true,
        otpId: result.otpId,
        expiresAt: result.expiresAt,
        channel: result.provider === "neurochat" ? "whatsapp" : "dev",
        // Solo en desarrollo local, para poder probar sin WhatsApp.
        devCode: env.isProduction ? undefined : result.devCode,
      };
    }),

  verifyOtp: publicQuery
    .input(
      z.object({
        phone: z.string().min(6).max(30),
        otpId: z.string().min(3).max(120),
        code: z.string().regex(/^\d{4,8}$/, "El código debe tener entre 4 y 8 dígitos"),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const phone = normalizePhone(input.phone);
      const db = getDb();

      const rows = await db
        .select()
        .from(otpVerifications)
        .where(
          and(
            eq(otpVerifications.phone, phone),
            eq(otpVerifications.otpId, input.otpId),
            eq(otpVerifications.status, "pending"),
          ),
        )
        .orderBy(desc(otpVerifications.createdAt))
        .limit(1);

      const record = rows[0];
      if (!record) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "El código no existe o ya fue utilizado. Pide uno nuevo.",
        });
      }
      if (record.expiresAt.getTime() < Date.now()) {
        await db
          .update(otpVerifications)
          .set({ status: "expired" })
          .where(eq(otpVerifications.id, record.id));
        throw new TRPCError({ code: "BAD_REQUEST", message: "El código expiró. Pide uno nuevo." });
      }
      if (record.attempts >= 3) {
        await db
          .update(otpVerifications)
          .set({ status: "failed" })
          .where(eq(otpVerifications.id, record.id));
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Superaste los 3 intentos. Pide un código nuevo.",
        });
      }

      await db
        .update(otpVerifications)
        .set({ attempts: record.attempts + 1 })
        .where(eq(otpVerifications.id, record.id));

      let valid = false;
      let providerStatus = "pending";

      if (isDevOtpId(input.otpId)) {
        valid = await compareOtpCode(input.code, record.codeHash);
        providerStatus = valid ? "verified" : "pending";
      } else {
        const provider = await verifyOtpWithProvider(input.otpId, input.code);
        valid = provider.valid;
        providerStatus = provider.status;
      }

      if (!valid) {
        if (["failed", "expired", "max_attempts", "not_found"].includes(providerStatus)) {
          await db
            .update(otpVerifications)
            .set({ status: providerStatus === "max_attempts" ? "failed" : providerStatus })
            .where(eq(otpVerifications.id, record.id));
        }
        const remaining = Math.max(0, 3 - (record.attempts + 1));
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            remaining > 0
              ? `Código incorrecto. Te quedan ${remaining} intento${remaining === 1 ? "" : "s"}.`
              : "Código incorrecto. Pide uno nuevo.",
        });
      }

      await db
        .update(otpVerifications)
        .set({ status: "verified", consumedAt: new Date() })
        .where(eq(otpVerifications.id, record.id));

      const customer = await findCustomerByPhone(phone);
      if (customer) {
        await setCustomerCookies(ctx.resHeaders, ctx.req.headers, customer.id);
        return {
          success: true,
          isNew: false as const,
          customer: safeCustomer(customer),
        };
      }

      const registrationToken = await signRegistrationToken(phone);
      return {
        success: true,
        isNew: true as const,
        registrationToken,
        phone,
      };
    }),

  /** @deprecated El acceso es por OTP de WhatsApp. Se mantiene para dar un error claro. */
  login: publicQuery
    .input(z.object({ phone: z.string() }))
    .mutation(async () => {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Por seguridad, ahora debes verificar tu número con un código de WhatsApp.",
      });
    }),

  register: publicQuery
    .input(
      z.object({
        firstName: z.string().trim().min(1).max(100),
        lastName: z.string().trim().min(1).max(100),
        phone: z.string().min(6).max(30),
        address: z.string().trim().min(3).max(500),
        registrationToken: z.string().min(10),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const phone = normalizePhone(input.phone);
      const tokenPhone = await verifyRegistrationToken(input.registrationToken);
      if (!tokenPhone || tokenPhone !== phone) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "La verificación del teléfono expiró. Vuelve a pedir el código.",
        });
      }

      const existing = await findCustomerByPhone(phone);
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Ya existe una cuenta con este número. Inicia sesión con tu código de WhatsApp.",
        });
      }

      const db = getDb();
      const inserted = await db
        .insert(customers)
        .values({
          firstName: input.firstName,
          lastName: input.lastName,
          phone,
          address: input.address,
        })
        .returning();

      const customer = inserted[0];
      await setCustomerCookies(ctx.resHeaders, ctx.req.headers, customer.id);
      return { success: true, customer: safeCustomer(customer) };
    }),

  checkAuth: publicQuery.query(async ({ ctx }) => {
    return { customer: ctx.customer ? safeCustomer(ctx.customer) : null };
  }),

  refresh: publicQuery.mutation(async ({ ctx }) => {
    const cookieHeader = ctx.req.headers.get("cookie") || "";
    const tokenMatch = cookieHeader.match(/refresh_token=([^;]+)/);
    if (!tokenMatch) return { success: false, customer: null };

    const payload = await verifyRefreshTokenPayload(decodeURIComponent(tokenMatch[1]));
    if (!payload) {
      clearCustomerCookies(ctx.resHeaders, ctx.req.headers);
      return { success: false, customer: null };
    }

    const db = getDb();
    const result = await db.select().from(customers).where(eq(customers.id, payload.customerId));
    const customer = result[0];
    if (
      !customer ||
      customer.deletedAt ||
      (customer.sessionVersion ?? 0) !== payload.sessionVersion
    ) {
      clearCustomerCookies(ctx.resHeaders, ctx.req.headers);
      return { success: false, customer: null };
    }

    await setCustomerCookies(ctx.resHeaders, ctx.req.headers, customer.id);
    return { success: true, customer: safeCustomer(customer) };
  }),

  logout: publicQuery.mutation(async ({ ctx }) => {
    if (ctx.customer) {
      const db = getDb();
      await db.update(customers).set({ fcmToken: null }).where(eq(customers.id, ctx.customer.id));
    }
    clearCustomerCookies(ctx.resHeaders, ctx.req.headers);
    return { success: true };
  }),

  getById: adminQuery
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = getDb();
      const result = await db.select().from(customers).where(eq(customers.id, input.id));
      return result[0] ? safeCustomer(result[0]) : null;
    }),

  update: customerQuery
    .input(
      z.object({
        firstName: z.string().trim().min(1).max(100).optional(),
        lastName: z.string().trim().min(1).max(100).optional(),
        address: z.string().trim().min(3).max(500).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const customerId = ctx.customer!.id;
      const data: Record<string, string> = {};
      if (input.firstName !== undefined) data.firstName = input.firstName;
      if (input.lastName !== undefined) data.lastName = input.lastName;
      if (input.address !== undefined) data.address = input.address;

      if (Object.keys(data).length > 0) {
        await db.update(customers).set(data).where(eq(customers.id, customerId));
      }
      const result = await db.select().from(customers).where(eq(customers.id, customerId));
      return safeCustomer(result[0]);
    }),

  list: adminQuery.query(async () => {
    const db = getDb();
    const rows = await db.select().from(customers).orderBy(desc(customers.createdAt)).limit(500);
    return rows.map(safeCustomer);
  }),

  registerDeviceToken: customerQuery
    .input(z.object({ token: z.string().min(10).max(4096) }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await db
        .update(customers)
        .set({ fcmToken: input.token })
        .where(eq(customers.id, ctx.customer!.id));
      return { success: true };
    }),

  unregisterDeviceToken: customerQuery.mutation(async ({ ctx }) => {
    const db = getDb();
    await db.update(customers).set({ fcmToken: null }).where(eq(customers.id, ctx.customer!.id));
    return { success: true };
  }),

  /** Baja autenticada: anonimiza PII y revoca todas las sesiones. */
  deleteAccount: customerQuery.mutation(async ({ ctx }) => {
    const db = getDb();
    const customerId = ctx.customer!.id;
    const anonymizedPhone = `del_${customerId}_${Date.now().toString(36)}`;

    await db
      .update(customers)
      .set({
        firstName: "Cuenta",
        lastName: "Eliminada",
        phone: anonymizedPhone,
        address: "",
        fcmToken: null,
        deletedAt: new Date(),
        sessionVersion: (ctx.customer!.sessionVersion ?? 0) + 1,
      })
      .where(eq(customers.id, customerId));

    clearCustomerCookies(ctx.resHeaders, ctx.req.headers);
    return { success: true };
  }),

  /** Solicitud pública para usuarios que ya no pueden iniciar sesión. */
  requestDeletion: publicQuery
    .input(
      z.object({
        phone: z.string().min(6).max(30),
        fullName: z.string().trim().min(2).max(200),
        role: z.enum(["customer", "driver", "merchant"]).default("customer"),
        reason: z.string().trim().max(1000).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const phone = normalizePhone(input.phone);
      const db = getDb();
      const ip = clientIp(ctx.req);

      const recent = await db
        .select({ id: accountDeletionRequests.id })
        .from(accountDeletionRequests)
        .where(
          and(
            eq(accountDeletionRequests.phone, phone),
            gte(accountDeletionRequests.createdAt, new Date(Date.now() - 60 * 60_000)),
          ),
        );
      if (recent.length >= 3) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Ya recibimos tu solicitud. Te contactaremos pronto.",
        });
      }

      await db.insert(accountDeletionRequests).values({
        ticketId: `BAJA-EC-${new Date().getFullYear()}-${crypto.randomInt(100000, 999999)}`,
        phone,
        fullName: input.fullName,
        role: input.role,
        reason: input.reason,
        ip,
      });

      const ticket = await db
        .select({ ticketId: accountDeletionRequests.ticketId, createdAt: accountDeletionRequests.createdAt })
        .from(accountDeletionRequests)
        .where(eq(accountDeletionRequests.phone, phone))
        .orderBy(desc(accountDeletionRequests.createdAt))
        .limit(1);

      return {
        success: true,
        ticketId: ticket[0]?.ticketId,
        sla: "48 horas hábiles",
        requestedAt: ticket[0]?.createdAt ?? new Date(),
      };
    }),
});